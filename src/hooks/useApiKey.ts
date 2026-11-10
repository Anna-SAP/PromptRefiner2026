import { useCallback, useState } from 'react';
import { type StoredApiKey, clearApiKey, loadApiKey, saveApiKey } from '../lib/apiKey';

/** The user's own API key in the browser-only build. See lib/apiKey.ts for where it is kept. */
export function useApiKey() {
  const [stored, setStored] = useState<StoredApiKey | null>(loadApiKey);

  const save = useCallback((key: string, remember: boolean) => {
    saveApiKey(key, remember);
    setStored({ key, remembered: remember });
  }, []);

  const clear = useCallback(() => {
    clearApiKey();
    setStored(null);
  }, []);

  return { hasKey: stored !== null, remembered: stored?.remembered ?? false, save, clear };
}
