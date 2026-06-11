import { useState, useEffect, useCallback } from 'react';
import { initDatabase } from '@/db/database';

interface UseDatabaseReturn {
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Hook to initialize the data store.
 * Uses chrome.storage.local — instant initialization, no WASM needed.
 */
export function useDatabase(): UseDatabaseReturn {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await initDatabase();
      setIsReady(true);
      console.log('[PageLens] Data store ready');
    } catch (err: any) {
      console.error('[PageLens] Data store initialization failed:', err);
      setError(err.message || 'Initialization failed');
      setIsReady(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return { isReady, isLoading, error, retry: initialize };
}
