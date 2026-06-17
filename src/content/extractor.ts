import type { PageContent, CommentItem } from '@/shared/types';

/**
 * Extract the main content from the current page.
 * Priority: <article> → readability heuristic → <body> fallback
 */
export function extractPageContent(): PageContent {
  const url = window.location.href;
  const title = extractTitle();
  const description = extractDescription();
  const language = extractLanguage();

  // Try extracting from <article> first
  let textContent = '';
  let htmlContent = '';

  const article = document.querySelector('article');
  if (article) {
    textContent = cleanText(article.textContent || '');
    htmlContent = cleanHtml(article.innerHTML);
  }

  // Fallback: readability-style heuristic
  if (!textContent || textContent.length < 100) {
    const mainContent = findMainContent();
    if (mainContent) {
      textContent = cleanText(mainContent.textContent || '');
      htmlContent = cleanHtml(mainContent.innerHTML);
    }
  }

  // Final fallback: body content
  if (!textContent || textContent.length < 50) {
    textContent = cleanText(document.body.textContent || '');
    htmlContent = cleanHtml(document.body.innerHTML);
  }

  // 提取评论区（加 try-catch 防止评论提取异常导致整个提取失败）
  let comments: CommentItem[] = [];
  try {
    comments = extractComments();
  } catch {
    comments = [];
  }

  // 极端安全网：内容超过 50 万字符时截断，防滥用
  if (textContent.length > 500000) {
    textContent = textContent.slice(0, 500000) + '\n\n[内容过长，已截断...]';
  }

  return {
    title,
    description,
    url,
    language,
    textContent,
    htmlContent,
    comments,
  };
}

/**
 * Extract page title from various sources
 */
function extractTitle(): string {
  // Try og:title first (often the cleanest)
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle?.getAttribute('content')) {
    return ogTitle.getAttribute('content')!;
  }

  // Fall back to document title
  return document.title || '';
}

/**
 * Extract page description
 */
function extractDescription(): string {
  // Try og:description
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc?.getAttribute('content')) {
    return ogDesc.getAttribute('content')!;
  }

  // Try meta description
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc?.getAttribute('content')) {
    return metaDesc.getAttribute('content')!;
  }

  return '';
}

/**
 * Detect page language
 */
function extractLanguage(): string {
  const htmlLang = document.documentElement.getAttribute('lang');
  if (htmlLang) return htmlLang;

  const metaLang = document.querySelector('meta[http-equiv="content-language"]');
  if (metaLang?.getAttribute('content')) {
    return metaLang.getAttribute('content')!;
  }

  return 'unknown';
}

/**
 * Find the main content element using readability-style heuristics
 */
function findMainContent(): Element | null {
  const candidates = document.querySelectorAll(
    'main, [role="main"], .content, .article-content, .post-content, .entry-content, #content, #main',
  );

  if (candidates.length > 0) {
    // Return the candidate with the most text
    let best: Element | null = null;
    let bestLength = 0;
    candidates.forEach((el) => {
      const len = (el.textContent || '').length;
      if (len > bestLength) {
        bestLength = len;
        best = el;
      }
    });
    return best;
  }

  // Score-based approach for block-level elements
  const blocks = document.querySelectorAll('div, section');
  let best: Element | null = null;
  let bestScore = 0;

  blocks.forEach((block) => {
    const score = computeContentScore(block);
    if (score > bestScore) {
      bestScore = score;
      best = block;
    }
  });

  return best;
}

/**
 * Compute a content score for an element (readability heuristic)
 */
function computeContentScore(el: Element): number {
  const text = el.textContent || '';
  if (text.length < 100) return 0;

  let score = 0;

  // Reward text density
  score += text.length / 100;

  // Reward paragraph count
  const paragraphs = el.querySelectorAll('p');
  score += paragraphs.length * 2;

  // Penalize high link density
  const links = el.querySelectorAll('a');
  const linkDensity = links.length / (text.length / 100 + 1);
  score -= linkDensity * 5;

  // Penalize known non-content class/id names
  const className = (el.className || '').toLowerCase();
  const id = (el.id || '').toLowerCase();
  const penalizedWords = ['sidebar', 'nav', 'footer', 'header', 'comment', 'ad', 'promo', 'related', 'social', 'share', 'widget'];
  penalizedWords.forEach((word) => {
    if (className.includes(word) || id.includes(word)) {
      score -= 20;
    }
  });

  // Reward semantic tags
  if (el.tagName === 'MAIN' || el.getAttribute('role') === 'main') {
    score += 30;
  }
  if (el.tagName === 'ARTICLE') {
    score += 25;
  }

  return score;
}

/**
 * Clean text content: normalize whitespace, remove excessive blank lines
 */
function cleanText(text: string): string {
  return text
    .replace(/\t/g, ' ')
    .replace(/[ ]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Clean HTML: remove scripts, styles, and non-content elements
 */
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

// ===================== 评论提取 =====================

/** 常见评论区容器选择器，按优先级排列 */
const COMMENT_CONTAINER_SELECTORS = [
  '#comments',
  '#comment_list',
  '#commentList',
  '.comments',
  '.comment-list',
  '.commentList',
  '.CommentListV2',
  '.discuss',
  '.reply-list',
  '.message-list',
  '.reviews',
  '.review-list',
  '[role="comment"]',
];

/** 常见单条评论选择器 */
const COMMENT_ITEM_SELECTORS = [
  '.comment-item',
  '.comment',
  '.review-item',
  '.message-item',
  '.reply-item',
  '.CommentItem',
  '.comment-card',
];

/**
 * 提取页面中的评论/留言列表
 */
function extractComments(): CommentItem[] {
  // Step 1: 定位评论区容器
  let container: Element | null = null;

  for (const selector of COMMENT_CONTAINER_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) {
      // 验证：容器内应该有多个子元素（评论列表的特征）
      const childCount = el.children.length;
      if (childCount >= 2) {
        container = el;
        break;
      }
    }
  }

  if (!container) {
    return [];
  }

  // Step 2: 查找单条评论元素
  let commentElements: Element[] = [];

  for (const selector of COMMENT_ITEM_SELECTORS) {
    const items = container.querySelectorAll(selector);
    if (items.length >= 2) {
      commentElements = Array.from(items);
      break;
    }
  }

  // 如果没有找到明确的评论元素，尝试用直接子元素
  if (commentElements.length === 0) {
    commentElements = Array.from(container.children);
  }

  if (commentElements.length === 0) {
    return [];
  }

  // Step 3: 解析每条评论
  const comments: CommentItem[] = [];

  for (const el of commentElements) {
    const comment = parseCommentItem(el);
    if (comment && comment.content.length > 0) {
      comments.push(comment);
    }
  }

  return comments;
}

/**
 * 解析单条评论元素
 */
function parseCommentItem(el: Element): CommentItem | null {
  const content = extractCommentContent(el);
  if (!content) return null;

  return {
    author: extractCommentAuthor(el),
    content,
    time: extractCommentTime(el),
    likes: extractCommentLikes(el),
    isReply: isReplyComment(el),
  };
}

/** 提取评论内容 */
function extractCommentContent(el: Element): string {
  const contentSelectors = [
    '.comment-body',
    '.comment-content',
    '.reply-content',
    '.review-content',
    '.message-content',
    '.text',
    '.content',
    'p',
  ];

  for (const selector of contentSelectors) {
    const contentEl = el.querySelector(selector);
    if (contentEl) {
      const text = cleanText(contentEl.textContent || '');
      if (text.length > 0) return text;
    }
  }

  // 回退：直接用元素的文本内容
  return cleanText(el.textContent || '');
}

/** 提取评论作者 */
function extractCommentAuthor(el: Element): string {
  const authorSelectors = [
    '.author',
    '.username',
    '.user-name',
    '.nickname',
    '.comment-author',
    '.reviewer',
    '[itemprop="name"]',
    '.name',
    'a[href*="user"]',
    'a[href*="profile"]',
  ];

  for (const selector of authorSelectors) {
    const authorEl = el.querySelector(selector);
    if (authorEl) {
      const text = (authorEl.textContent || '').trim();
      if (text.length > 0 && text.length < 50) return text;
    }
  }

  return '';
}

/** 提取评论时间 */
function extractCommentTime(el: Element): string | undefined {
  // 优先用 <time> 标签
  const timeEl = el.querySelector('time[datetime]');
  if (timeEl) {
    return timeEl.getAttribute('datetime') || undefined;
  }

  const timeSelectors = ['.time', '.date', '.comment-time', '.timestamp', 'time'];

  for (const selector of timeSelectors) {
    const el2 = el.querySelector(selector);
    if (el2) {
      const text = (el2.textContent || '').trim();
      if (text.length > 0 && text.length < 50) return text;
    }
  }

  return undefined;
}

/** 提取评论点赞数 */
function extractCommentLikes(el: Element): number | undefined {
  const likesSelectors = ['.likes', '.like-count', '.vote-count', '.upvote', '.zan', '.praise'];

  for (const selector of likesSelectors) {
    const likesEl = el.querySelector(selector);
    if (likesEl) {
      const text = (likesEl.textContent || '').trim();
      const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num)) return num;
    }
  }

  return undefined;
}

/** 判断是否为回复（嵌套评论） */
function isReplyComment(el: Element): boolean {
  // 检查是否有嵌套层级标记
  if (el.classList.contains('reply') || el.classList.contains('child-comment')) {
    return true;
  }

  // 检查父元素是否也是评论容器
  const parent = el.parentElement;
  if (parent && parent.closest('.comment, .comment-item, .review-item')) {
    return true;
  }

  // 检查缩进层级（常见的缩进回复模式）
  const indent = el.querySelector('.indent, .reply-indent, .level');
  if (indent) return true;

  return false;
}
