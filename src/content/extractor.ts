import type { PageContent } from '@/shared/types';

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

  // Truncate if too long
  const MAX_LENGTH = 15000;
  if (textContent.length > MAX_LENGTH) {
    textContent = textContent.slice(0, MAX_LENGTH) + '\n\n[内容已截断...]';
  }

  return {
    title,
    description,
    url,
    language,
    textContent,
    htmlContent,
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
