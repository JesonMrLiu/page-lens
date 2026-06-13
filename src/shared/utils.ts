/**
 * Format a date string for display
 */
export function formatDate(dateStr: string, locale: string = 'zh'): string {
  // 将 "YYYY-MM-DD HH:mm:ss" 格式（无时区标识）当作 UTC 处理
  const normalized = dateStr.includes('T')
    ? dateStr
    : dateStr.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return locale === 'zh' ? '刚刚' : 'Just now';
  if (diffMins < 60) return locale === 'zh' ? `${diffMins} 分钟前` : `${diffMins} min ago`;
  if (diffHours < 24) return locale === 'zh' ? `${diffHours} 小时前` : `${diffHours} hr ago`;
  if (diffDays < 7) return locale === 'zh' ? `${diffDays} 天前` : `${diffDays} days ago`;

  return date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Truncate text to a max length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Generate a unique ID (simple implementation)
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a page URL for consistent comparison.
 * Strips query params, hash, and trailing slashes.
 */
export function normalizePageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

/**
 * Extract the domain from a URL for display purposes.
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Check if current URL is a valid page for extraction
 */
export function isValidPageUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Detect language from text content (simple heuristic)
 */
export function detectLanguage(text: string): 'zh' | 'en' | 'unknown' {
  const chineseChars = text.match(/[一-鿿]/g);
  const chineseRatio = chineseChars ? chineseChars.length / text.length : 0;

  if (chineseRatio > 0.1) return 'zh';
  if (chineseRatio < 0.01) return 'en';
  return 'unknown';
}
