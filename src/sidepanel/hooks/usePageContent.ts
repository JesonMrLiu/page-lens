import { useState, useCallback } from 'react';
import { MSG_TYPES } from '@/shared/constants';
import type { PageContent } from '@/shared/types';

interface UsePageContentReturn {
  pageContent: PageContent | null;
  isLoading: boolean;
  error: string | null;
  extractPage: () => Promise<PageContent | null>;
}

/**
 * Hook to extract content from the current active tab page.
 */
export function usePageContent(): UsePageContentReturn {
  const [pageContent, setPageContent] = useState<PageContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractPage = useCallback(async (): Promise<PageContent | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG_TYPES.EXTRACT_PAGE,
      });

      if (response?.error) {
        setError(response.error);
        return null;
      }

      const content = response?.data as PageContent | null;
      if (content) {
        setPageContent(content);
        return content;
      }

      setError('无法提取页面内容');
      return null;
    } catch (err: any) {
      setError(err.message || '提取页面内容失败');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { pageContent, isLoading, error, extractPage };
}
