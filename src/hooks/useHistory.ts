import { useCallback, useEffect, useState } from 'react';
import type { HistoryItem } from '../types';

export const MAX_HISTORY_ITEMS = 50;
/** Same key as the original app, so history carries over on the same origin. */
const STORAGE_KEY = 'prompt_refiner_history';

function isHistoryItem(value: unknown): value is HistoryItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.originalPrompt === 'string' &&
    typeof item.refinedPrompt === 'string' &&
    typeof item.timestamp === 'number'
  );
}

/** Accepts anything, returns only well-formed items: newest first, deduplicated, capped. */
export function normalizeHistory(value: unknown): HistoryItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter(isHistoryItem)
    .filter((item) => !seen.has(item.id) && seen.add(item.id))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_HISTORY_ITEMS);
}

function readStoredHistory(): HistoryItem[] {
  try {
    return normalizeHistory(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function useHistory() {
  // Read synchronously on first render so there is no empty flash, and no
  // window in which an effect could overwrite stored history with [].
  const [history, setHistory] = useState<HistoryItem[]>(readStoredHistory);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
      // Storage full or blocked (private mode). History still works in memory.
      console.warn('Could not save history:', error);
    }
  }, [history]);

  // Keep several open tabs in step with each other.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setHistory(readStoredHistory());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((entry: Omit<HistoryItem, 'id' | 'timestamp'>) => {
    const item: HistoryItem = { ...entry, id: crypto.randomUUID(), timestamp: Date.now() };
    setHistory((previous) => [item, ...previous].slice(0, MAX_HISTORY_ITEMS));
  }, []);

  const remove = useCallback((id: string) => {
    setHistory((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => setHistory([]), []);

  /** Merges imported items into the current list. Returns how many were new. */
  const importItems = useCallback(
    (value: unknown): number => {
      const incoming = normalizeHistory(value);
      const known = new Set(history.map((item) => item.id));
      const added = incoming.filter((item) => !known.has(item.id)).length;
      setHistory((previous) => normalizeHistory([...previous, ...incoming]));
      return added;
    },
    [history],
  );

  return { history, add, remove, clear, importItems };
}
