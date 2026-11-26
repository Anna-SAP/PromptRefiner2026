import { useSyncExternalStore } from 'react';
import { type HistoryStore, createBrowserHistoryStore } from '../lib/historyStore';

// One store for the page, created on first use: it opens the database, moves
// any history still in localStorage over, and keeps open tabs in step.
let store: HistoryStore | null = null;

export function useHistory() {
  store ??= createBrowserHistoryStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return {
    /** Newest first, every entry ever saved: there is no cap. */
    history: snapshot.items,
    /** What is wrong with saving history, in words for the user; null when all is well. */
    problem: snapshot.problem,
    /** Entries that could not be saved and live only in this tab. */
    unsavedIds: snapshot.unsavedIds,
    add: store.add,
    remove: store.remove,
    clear: store.clear,
    importItems: store.importItems,
  };
}
