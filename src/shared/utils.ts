/**
 * Format a date string for display
 */
export function formatDate(dateStr: string): string {
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

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;

  return date.toLocaleDateString('zh-CN', {
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
