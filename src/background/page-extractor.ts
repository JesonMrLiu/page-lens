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

  const MAX_LENGTH = 15000;
  if (textContent.length > MAX_LENGTH) {
    textContent = textContent.slice(0, MAX_LENGTH) + '\n\n[内容已截断...]';
  }

  return { title, description, url, language, textContent, htmlContent };
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
