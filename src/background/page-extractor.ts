/**
 * Page content extraction orchestration.
 * Coordinates between the side panel and content script to extract page content.
 */
import { MSG_TYPES } from '@/shared/constants';
import type { PageContent } from '@/shared/types';

/**
 * Self-contained page content extraction function for chrome.scripting.executeScript.
 * This function must NOT reference any external variables or imports — it runs in
 * the page context as-is. It mirrors the logic in src/content/extractor.ts.
 */
function inlineExtractPageContent(): {
  title: string;
  description: string;
  url: string;
  language: string;
  textContent: string;
  htmlContent: string;
  comments?: Array<{ author: string; content: string; time?: string; likes?: number; isReply?: boolean }>;
} {
  // --- extractTitle ---
  function extractTitle(): string {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle?.getAttribute('content')) return ogTitle.getAttribute('content')!;
    return document.title || '';
  }

  // --- extractDescription ---
  function extractDescription(): string {
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc?.getAttribute('content')) return ogDesc.getAttribute('content')!;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc?.getAttribute('content')) return metaDesc.getAttribute('content')!;
    return '';
  }

  // --- extractLanguage ---
  function extractLanguage(): string {
    const htmlLang = document.documentElement.getAttribute('lang');
    if (htmlLang) return htmlLang;
    const metaLang = document.querySelector('meta[http-equiv="content-language"]');
    if (metaLang?.getAttribute('content')) return metaLang.getAttribute('content')!;
    return 'unknown';
  }

  // --- cleanText ---
  function cleanText(text: string): string {
    return text
      .replace(/\t/g, ' ')
      .replace(/[ ]+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  // --- cleanHtml ---
  function cleanHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
  }

  // --- computeContentScore ---
  function computeContentScore(el: Element): number {
    const text = el.textContent || '';
    if (text.length < 100) return 0;
    let score = 0;
    score += text.length / 100;
    const paragraphs = el.querySelectorAll('p');
    score += paragraphs.length * 2;
    const links = el.querySelectorAll('a');
    const linkDensity = links.length / (text.length / 100 + 1);
    score -= linkDensity * 5;
    const className = (el.className || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const penalizedWords = ['sidebar', 'nav', 'footer', 'header', 'comment', 'ad', 'promo', 'related', 'social', 'share', 'widget'];
    penalizedWords.forEach((word) => {
      if (className.includes(word) || id.includes(word)) score -= 20;
    });
    if (el.tagName === 'MAIN' || el.getAttribute('role') === 'main') score += 30;
    if (el.tagName === 'ARTICLE') score += 25;
    return score;
  }

  // --- findMainContent ---
  function findMainContent(): Element | null {
    const candidates = document.querySelectorAll(
      'main, [role="main"], .content, .article-content, .post-content, .entry-content, #content, #main',
    );
    if (candidates.length > 0) {
      let best: Element | null = null;
      let bestLength = 0;
      candidates.forEach((el) => {
        const len = (el.textContent || '').length;
        if (len > bestLength) { bestLength = len; best = el; }
      });
      return best;
    }
    const blocks = document.querySelectorAll('div, section');
    let best: Element | null = null;
    let bestScore = 0;
    blocks.forEach((block) => {
      const score = computeContentScore(block);
      if (score > bestScore) { bestScore = score; best = block; }
    });
    return best;
  }

  // --- Main extraction logic ---
  const url = window.location.href;
  const title = extractTitle();
  const description = extractDescription();
  const language = extractLanguage();

  let textContent = '';
  let htmlContent = '';

  const article = document.querySelector('article');
  if (article) {
    textContent = cleanText(article.textContent || '');
    htmlContent = cleanHtml(article.innerHTML);
  }
  if (!textContent || textContent.length < 100) {
    const mainContent = findMainContent();
    if (mainContent) {
      textContent = cleanText(mainContent.textContent || '');
      htmlContent = cleanHtml(mainContent.innerHTML);
    }
  }
  if (!textContent || textContent.length < 50) {
    textContent = cleanText(document.body.textContent || '');
    htmlContent = cleanHtml(document.body.innerHTML);
  }

  // 提取评论区（加 try-catch 防止评论提取异常导致整个提取失败）
  let comments: Array<{ author: string; content: string; time?: string; likes?: number; isReply?: boolean }> = [];
  try {
    comments = inlineExtractComments();
  } catch {
    comments = [];
  }

  // 极端安全网：内容超过 50 万字符时截断
  if (textContent.length > 500000) {
    textContent = textContent.slice(0, 500000) + '\n\n[内容过长，已截断...]';
  }

  return { title, description, url, language, textContent, htmlContent, comments };
}

// --- inlineExtractComments ---
function inlineExtractComments(): Array<{ author: string; content: string; time?: string; likes?: number; isReply?: boolean }> {
  const containerSelectors = [
    '#comments', '#comment_list', '#commentList', '.comments', '.comment-list',
    '.commentList', '.CommentListV2', '.discuss', '.reply-list', '.message-list',
    '.reviews', '.review-list', '[role="comment"]',
  ];
  const itemSelectors = [
    '.comment-item', '.comment', '.review-item', '.message-item',
    '.reply-item', '.CommentItem', '.comment-card',
  ];
  const contentSelectors = [
    '.comment-body', '.comment-content', '.reply-content', '.review-content',
    '.message-content', '.text', '.content', 'p',
  ];
  const authorSelectors = [
    '.author', '.username', '.user-name', '.nickname', '.comment-author',
    '.reviewer', '[itemprop="name"]', '.name', 'a[href*="user"]', 'a[href*="profile"]',
  ];
  const timeSelectors = ['.time', '.date', '.comment-time', '.timestamp', 'time'];
  const likesSelectors = ['.likes', '.like-count', '.vote-count', '.upvote', '.zan', '.praise'];

  let container: Element | null = null;
  for (const sel of containerSelectors) {
    const el = document.querySelector(sel);
    if (el && el.children.length >= 2) { container = el; break; }
  }
  if (!container) return [];

  let items: Element[] = [];
  for (const sel of itemSelectors) {
    const found = container.querySelectorAll(sel);
    if (found.length >= 2) { items = Array.from(found); break; }
  }
  if (items.length === 0) items = Array.from(container.children);
  if (items.length === 0) return [];

  const comments: Array<{ author: string; content: string; time?: string; likes?: number; isReply?: boolean }> = [];

  for (const el of items) {
    // content
    let content = '';
    for (const sel of contentSelectors) {
      const c = el.querySelector(sel);
      if (c && (c.textContent || '').trim().length > 0) { content = (c.textContent || '').trim(); break; }
    }
    if (!content) content = (el.textContent || '').trim();
    if (!content) continue;

    // author
    let author = '';
    for (const sel of authorSelectors) {
      const a = el.querySelector(sel);
      if (a) { const t = (a.textContent || '').trim(); if (t.length > 0 && t.length < 50) { author = t; break; } }
    }

    // time
    let time: string | undefined;
    const timeTag = el.querySelector('time[datetime]');
    if (timeTag) { time = timeTag.getAttribute('datetime') || undefined; }
    if (!time) {
      for (const sel of timeSelectors) {
        const t = el.querySelector(sel);
        if (t) { const txt = (t.textContent || '').trim(); if (txt.length > 0 && txt.length < 50) { time = txt; break; } }
      }
    }

    // likes
    let likes: number | undefined;
    for (const sel of likesSelectors) {
      const l = el.querySelector(sel);
      if (l) { const n = parseInt((l.textContent || '').replace(/[^0-9]/g, ''), 10); if (!isNaN(n)) { likes = n; break; } }
    }

    // isReply
    const isReply = el.classList.contains('reply') || el.classList.contains('child-comment') ||
      !!el.querySelector('.indent, .reply-indent, .level') ||
      !!el.closest('.comment, .comment-item, .review-item');

    comments.push({ author, content, time, likes, isReply });
  }

  return comments;
}

/**
 * Extract content from the currently active tab.
 * Strategy:
 * 1. Fast path: try chrome.tabs.sendMessage (content script already loaded)
 * 2. Fallback: use chrome.scripting.executeScript to inject extraction logic directly
 */
export async function extractFromActiveTab(): Promise<{ data: PageContent | null; error?: string }> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return { data: null, error: 'No active tab found' };
    }

    if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
      return { data: null, error: 'Cannot extract content from this page type' };
    }

    // Fast path: content script is already injected
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: MSG_TYPES.EXTRACT });
      if (response?.error) {
        return { data: null, error: response.error };
      }
      if (response?.data) {
        return { data: response.data };
      }
    } catch {
      // Content script not loaded — fall through to programmatic injection
    }

    // Fallback: programmatically inject extraction function
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: inlineExtractPageContent,
    });

    if (results && results.length > 0 && results[0].result) {
      return { data: results[0].result as PageContent };
    }

    return { data: null, error: 'Failed to extract page content' };
  } catch (error: any) {
    return { data: null, error: error.message || 'Failed to extract page content' };
  }
}
