import type { HistoryItem } from '../types';

/**
 * Where history was kept before it moved to IndexedDB: one JSON array in
 * localStorage, under the key the Gemini-era app already used. It is only read
 * now, to move what it holds into the database.
 */
export const LEGACY_HISTORY_KEY = 'prompt_refiner_history';

const DATABASE_NAME = 'prompt_refiner';
const DATABASE_VERSION = 1;
const STORE_NAME = 'history';
const CHANNEL_NAME = 'prompt_refiner_history';

function isHistoryItem(value: unknown): value is HistoryItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.originalPrompt === 'string' &&
    typeof item.refinedPrompt === 'string' &&
    typeof item.timestamp === 'number' &&
    (item.basedOn === undefined ||
      (Array.isArray(item.basedOn) && item.basedOn.every((id) => typeof id === 'string')))
  );
}

/**
 * Accepts anything, returns only well-formed items: newest first, deduplicated
 * by id (the first one wins). Every item is kept; there is no cap.
 */
export function normalizeHistory(value: unknown): HistoryItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter(isHistoryItem)
    .filter((item) => !seen.has(item.id) && seen.add(item.id))
    .sort((a, b) => b.timestamp - a.timestamp);
}

/** What the history store needs from the place it saves to. */
export interface HistoryBackend {
  /** Everything saved, in any order. */
  readAll(): Promise<unknown[]>;
  /** Saves the items in one transaction: all of them, or none. An item replaces a saved one with the same id. */
  putAll(items: readonly HistoryItem[]): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(db: IDBDatabase, work: (store: IDBObjectStore) => void): Promise<void> {
  // 'strict': the transaction counts as done only once it is on disk, so a
  // crash or power cut right after a refinement does not take it with it.
  const transaction = db.transaction(STORE_NAME, 'readwrite', { durability: 'strict' });
  const done = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    // A failed request (QuotaExceededError, for one) aborts the whole
    // transaction, and its error becomes the transaction's.
    transaction.onabort = () => reject(transaction.error ?? new DOMException('The write was cancelled.', 'AbortError'));
  });
  try {
    work(transaction.objectStore(STORE_NAME));
  } catch (error) {
    done.catch(() => {});
    transaction.abort();
    throw error;
  }
  await done;
}

/** Opens (and on first use creates) the IndexedDB database history is saved in. */
export function openHistoryDatabase(factory: IDBFactory): Promise<HistoryBackend> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      // Version 1: one record per refinement, keyed by its id.
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      // A newer version of the app, open in another tab, needs to upgrade the
      // database. Step aside; this tab's next write then reports the problem.
      db.onversionchange = () => db.close();
      resolve({
        readAll: async () => requestResult(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()),
        putAll: (items) =>
          write(db, (store) => {
            for (const item of items) store.put(item);
          }),
        delete: (id) => write(db, (store) => store.delete(id)),
        clear: () => write(db, (store) => store.clear()),
      });
    };
  });
}

/** The part of localStorage that moving history out of it needs. */
export type LegacyStorage = Pick<Storage, 'getItem' | 'removeItem'>;

/** What localStorage still holds from before the move, read without changing it. */
export function readLegacyHistory(storage: LegacyStorage | null): HistoryItem[] {
  if (!storage) return [];
  try {
    return normalizeHistory(JSON.parse(storage.getItem(LEGACY_HISTORY_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

/**
 * Moves history saved by the localStorage-era app into the backend. Each item
 * goes over exactly as it was, under the same id, so sessions that were built
 * on one another stay linked.
 *
 * The localStorage copy is removed only after every item has been read back
 * from the backend unchanged. If anything goes wrong it stays where it is and
 * this throws; the next start of the app tries again. Running it twice is
 * harmless: an item that is already there is written over with itself.
 *
 * Entries that are not well-formed history items are not moved. The app never
 * showed them, and the localStorage-era app dropped them on its next save.
 *
 * Returns how many items were moved.
 */
export async function migrateLegacyHistory(backend: HistoryBackend, storage: LegacyStorage | null): Promise<number> {
  const items = readLegacyHistory(storage);
  if (!storage || items.length === 0) return 0;

  await backend.putAll(items);

  const stored = new Map(normalizeHistory(await backend.readAll()).map((item) => [item.id, item]));
  const notBack = items.filter((item) => JSON.stringify(stored.get(item.id)) !== JSON.stringify(item));
  if (notBack.length > 0) {
    throw new Error(`${notBack.length} of ${items.length} entries did not read back unchanged`);
  }

  storage.removeItem(LEGACY_HISTORY_KEY);
  return items.length;
}

export interface HistorySnapshot {
  /** Newest first: everything saved, plus anything this tab could not save. */
  items: HistoryItem[];
  /** False until the saved history has been read. */
  loaded: boolean;
  /** What is wrong with saving or reading history, in words for the user. Null when all is well. */
  problem: string | null;
  /** Entries that could not be saved. They exist only in this tab and are lost when it closes. */
  unsavedIds: ReadonlySet<string>;
}

export interface HistoryStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): HistorySnapshot;
  /** Saves a finished refinement. Returns the entry, with its id and time. */
  add(entry: Omit<HistoryItem, 'id' | 'timestamp'>): HistoryItem;
  remove(id: string): void;
  clear(): void;
  /** Merges entries from an export file. Returns how many were new. */
  importItems(value: unknown): number;
  /** Reads the saved history again, after another tab changed it. */
  reload(): void;
  /** Resolves once every change asked for so far has been tried. */
  settled(): Promise<void>;
}

export interface HistoryStoreOptions {
  open: () => Promise<HistoryBackend>;
  /** Where history from before the move to IndexedDB may still be. */
  legacy: LegacyStorage | null;
  /** Tells other tabs that the saved history changed. */
  announce?: () => void;
  /** Runs after every successful save. */
  afterSave?: () => void;
}

const UNAVAILABLE =
  'This browser is not letting the app store data, so new history entries are kept only until this tab closes. Use Export to keep a copy.';

function reason(error: unknown): string {
  if ((error as { name?: unknown } | null)?.name === 'QuotaExceededError') {
    return 'the browser has no storage space left for this site';
  }
  return error instanceof Error && error.message ? error.message : String(error);
}

/**
 * History as the app sees it. Saved entries live in the backend, one record
 * each, with no limit on how many. An entry the backend refuses stays in
 * memory, is shown as unsaved, and is written again with the next save.
 */
export function createHistoryStore(options: HistoryStoreOptions): HistoryStore {
  let backend: HistoryBackend | null = null;
  /** What the backend holds, as far as this tab knows. */
  let saved: HistoryItem[] = [];
  /** Entries not in the backend yet: waiting for their write, or refused by it. */
  let unsaved: HistoryItem[] = [];
  /** Entries still kept in localStorage because they could not be moved; not at risk when the tab closes. */
  const inLegacy = new Set<string>();
  /** The last attempt to save failed, or there is nowhere to save to. */
  let saveFailing = false;
  let loaded = false;
  let writeProblem: string | null = null;
  let readProblem: string | null = null;

  const listeners = new Set<() => void>();
  let snapshot: HistorySnapshot = { items: [], loaded, problem: null, unsavedIds: new Set() };

  function publish() {
    snapshot = {
      items: normalizeHistory([...unsaved, ...saved]),
      loaded,
      problem: writeProblem ?? readProblem,
      unsavedIds: new Set(
        saveFailing ? unsaved.filter((item) => !inLegacy.has(item.id)).map((item) => item.id) : [],
      ),
    };
    for (const listener of listeners) listener();
  }

  // Backend work runs one task at a time, in the order it was asked for, so a
  // read never overtakes a write this tab started earlier. Each task handles
  // its own errors; the catch only keeps one bug from stopping the queue.
  let queue: Promise<void> = Promise.resolve();
  function enqueue(task: () => Promise<void>) {
    queue = queue.then(task).catch((error: unknown) => console.error(error));
  }

  async function load() {
    if (!backend) return;
    try {
      saved = normalizeHistory(await backend.readAll());
      readProblem = null;
    } catch (error) {
      console.warn('Could not read history:', error);
      readProblem = `Could not read saved history: ${reason(error)}. Nothing was deleted; reload the page to try again.`;
    }
  }

  /** Writes every unsaved entry, in one transaction. */
  async function flush() {
    const batch = unsaved;
    if (!backend || batch.length === 0) return;
    try {
      await backend.putAll(batch);
    } catch (error) {
      console.warn('Could not save history:', error);
      saveFailing = true;
      writeProblem = `Could not save to history: ${reason(error)}. Unsaved entries are kept until this tab closes, and saving is tried again after the next refinement. Use Export to keep a copy.`;
      publish();
      return;
    }
    // An entry deleted while the write ran is no longer in `unsaved`; the
    // delete queued behind this task takes it out of the backend as well.
    const stillWanted = new Set(unsaved);
    const kept = batch.filter((item) => stillWanted.has(item));
    const written = new Set(batch);
    unsaved = unsaved.filter((item) => !written.has(item));
    saved = normalizeHistory([...kept, ...saved]);
    saveFailing = false;
    writeProblem = null;
    publish();
    options.announce?.();
    options.afterSave?.();
  }

  /** Shows what localStorage still holds, without moving it. */
  function keepLegacyInView() {
    const legacy = readLegacyHistory(options.legacy);
    for (const item of legacy) inLegacy.add(item.id);
    unsaved = [...unsaved, ...legacy];
  }

  enqueue(async () => {
    try {
      backend = await options.open();
    } catch (error) {
      console.warn('History storage is unavailable:', error);
      keepLegacyInView();
      saveFailing = true;
      writeProblem = UNAVAILABLE;
      loaded = true;
      publish();
      return;
    }
    try {
      await migrateLegacyHistory(backend, options.legacy);
    } catch (error) {
      console.warn('Could not move history out of localStorage:', error);
      // Still shown, and still in localStorage. The next save writes them
      // along with it, and the next start of the app tries the move again.
      keepLegacyInView();
      saveFailing = true;
      writeProblem = `Could not move your earlier history to the new storage: ${reason(error)}. It is still shown and still kept where it was; the app tries again the next time it opens.`;
    }
    await load();
    loaded = true;
    publish();
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot: () => snapshot,

    add(entry) {
      const item: HistoryItem = { ...entry, id: crypto.randomUUID(), timestamp: Date.now() };
      unsaved = [item, ...unsaved];
      publish();
      enqueue(flush);
      return item;
    },

    remove(id) {
      unsaved = unsaved.filter((item) => item.id !== id);
      saved = saved.filter((item) => item.id !== id);
      publish();
      enqueue(async () => {
        if (!backend) return;
        try {
          await backend.delete(id);
          options.announce?.();
        } catch (error) {
          console.warn('Could not delete from history:', error);
          await load();
          // An entry that never made it into the backend is gone all the same.
          if (saved.some((item) => item.id === id)) {
            writeProblem = `Could not delete the entry: ${reason(error)}. It is still in history.`;
          }
          publish();
        }
      });
    },

    clear() {
      unsaved = [];
      saved = [];
      // Whatever has not been moved out of localStorage goes too: the user
      // asked for all of history to be deleted.
      try {
        options.legacy?.removeItem(LEGACY_HISTORY_KEY);
      } catch {
        // Nothing there to remove, or no access to it.
      }
      publish();
      enqueue(async () => {
        if (!backend) return;
        try {
          await backend.clear();
          options.announce?.();
          if (unsaved.length === 0) {
            saveFailing = false;
            writeProblem = null;
          }
        } catch (error) {
          console.warn('Could not clear history:', error);
          writeProblem = `Could not clear history: ${reason(error)}.`;
          await load();
        }
        publish();
      });
    },

    importItems(value) {
      const known = new Set(snapshot.items.map((item) => item.id));
      const incoming = normalizeHistory(value).filter((item) => !known.has(item.id));
      if (incoming.length === 0) return 0;
      unsaved = [...incoming, ...unsaved];
      publish();
      enqueue(flush);
      return incoming.length;
    },

    reload() {
      enqueue(async () => {
        await load();
        publish();
      });
    },

    settled: () => queue,
  };
}

function browserLocalStorage(): LegacyStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Asks the browser not to clear this site's storage when the disk runs low.
 * Chrome and Safari decide on their own; Firefox asks the user, once.
 */
async function keepStoragePersistent() {
  try {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return;
    await navigator.storage.persist();
  } catch {
    // Only a request. History is saved either way.
  }
}

/** The store the app uses: IndexedDB, kept in step across open tabs. */
export function createBrowserHistoryStore(): HistoryStore {
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
  let askedToPersist = false;
  const store = createHistoryStore({
    open: async () => openHistoryDatabase(globalThis.indexedDB),
    legacy: browserLocalStorage(),
    announce: () => channel?.postMessage('changed'),
    afterSave: () => {
      if (askedToPersist) return;
      askedToPersist = true;
      void keepStoragePersistent();
    },
  });
  if (channel) channel.onmessage = () => store.reload();
  return store;
}
