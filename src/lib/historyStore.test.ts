import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { HistoryItem } from '../types';
import {
  type HistoryBackend,
  LEGACY_HISTORY_KEY,
  type LegacyStorage,
  createHistoryStore,
  migrateLegacyHistory,
  normalizeHistory,
} from './historyStore';

/** Stands in for IndexedDB: records are copied in and out, as structured cloning does. */
function memoryBackend() {
  const records = new Map<string, HistoryItem>();
  const control = { failWrites: null as Error | null, dropWrites: false };
  const guard = () => {
    if (control.failWrites) throw control.failWrites;
  };
  const backend: HistoryBackend = {
    readAll: async () => [...records.values()].map((item) => structuredClone(item)),
    putAll: async (items) => {
      guard();
      if (control.dropWrites) return;
      for (const item of items) records.set(item.id, structuredClone(item));
    },
    delete: async (id) => {
      guard();
      records.delete(id);
    },
    clear: async () => {
      guard();
      records.clear();
    },
  };
  return { backend, records, control };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: LegacyStorage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => void values.delete(key),
  };
  return { storage, values };
}

/**
 * Fifty entries shaped like the ones the localStorage-era app saved: newest
 * first, some built on earlier ones, one from the Gemini era (Markdown answer,
 * no model).
 */
function legacyHistory(count = 50): HistoryItem[] {
  const start = Date.UTC(2026, 9, 1);
  const items: HistoryItem[] = [];
  for (let index = 0; index < count; index++) {
    items.push({
      id: `legacy-${index}`,
      originalPrompt: `Draft ${index}`,
      refinedPrompt: `<analysis>Change ${index}</analysis>\n<prompt>Prompt ${index}</prompt>`,
      timestamp: start + index * 60_000,
      model: 'claude-fable-5-2',
      ...(index >= 2 && index % 3 === 0 ? { basedOn: [`legacy-${index - 1}`, `legacy-${index - 2}`] } : {}),
    });
  }
  items[0] = {
    id: 'gemini-era',
    originalPrompt: 'Write a blog post about coffee',
    refinedPrompt: '**Analysis:** Too vague.\n\n```prompt\nWrite a 600-word blog post about coffee.\n```',
    timestamp: start - 86_400_000,
  };
  items[1] = { ...items[1]!, basedOn: ['gemini-era'] };
  return items.reverse();
}

function entry(index: number): Omit<HistoryItem, 'id' | 'timestamp'> {
  return { originalPrompt: `New draft ${index}`, refinedPrompt: `<prompt>New prompt ${index}</prompt>`, model: 'm' };
}

describe('normalizeHistory', () => {
  it('keeps every entry, however many there are', () => {
    const items = Array.from({ length: 5000 }, (_, index) => ({
      id: `id-${index}`,
      originalPrompt: '',
      refinedPrompt: 'x',
      timestamp: index,
    }));
    const result = normalizeHistory(items);
    assert.equal(result.length, 5000);
    assert.equal(result[0]!.id, 'id-4999');
    assert.equal(result.at(-1)!.id, 'id-0');
  });

  it('drops malformed entries and repeated ids', () => {
    const good = { id: 'a', originalPrompt: '', refinedPrompt: 'x', timestamp: 1 };
    assert.deepEqual(normalizeHistory([good, { ...good, timestamp: 2 }, { id: 'b' }, null, 'text']), [good]);
    assert.deepEqual(normalizeHistory('not a list'), []);
  });
});

describe('migrateLegacyHistory', () => {
  it('moves all fifty entries over unchanged, links included, then removes the old copy', async () => {
    const legacy = legacyHistory();
    const { backend, records } = memoryBackend();
    const { storage, values } = memoryStorage({ [LEGACY_HISTORY_KEY]: JSON.stringify(legacy) });

    assert.equal(await migrateLegacyHistory(backend, storage), 50);

    assert.equal(records.size, 50);
    for (const item of legacy) assert.deepEqual(records.get(item.id), item);
    const links = legacy.flatMap((item) => item.basedOn ?? []);
    assert.ok(links.length > 10);
    for (const id of links) assert.ok(records.has(id), `basedOn ${id} still resolves`);
    assert.equal(values.has(LEGACY_HISTORY_KEY), false);
  });

  it('keeps the old copy, untouched, when the write fails', async () => {
    const raw = JSON.stringify(legacyHistory());
    const { backend, control } = memoryBackend();
    control.failWrites = new Error('disk full');
    const { storage, values } = memoryStorage({ [LEGACY_HISTORY_KEY]: raw });

    await assert.rejects(migrateLegacyHistory(backend, storage), /disk full/);
    assert.equal(values.get(LEGACY_HISTORY_KEY), raw);
  });

  it('keeps the old copy when the entries do not read back', async () => {
    const raw = JSON.stringify(legacyHistory());
    const { backend, control } = memoryBackend();
    control.dropWrites = true;
    const { storage, values } = memoryStorage({ [LEGACY_HISTORY_KEY]: raw });

    await assert.rejects(migrateLegacyHistory(backend, storage), /50 of 50 entries did not read back/);
    assert.equal(values.get(LEGACY_HISTORY_KEY), raw);
  });

  it('can run again without duplicating anything', async () => {
    const legacy = legacyHistory();
    const { backend, records } = memoryBackend();
    await migrateLegacyHistory(backend, memoryStorage({ [LEGACY_HISTORY_KEY]: JSON.stringify(legacy) }).storage);
    await migrateLegacyHistory(backend, memoryStorage({ [LEGACY_HISTORY_KEY]: JSON.stringify(legacy) }).storage);
    assert.equal(records.size, 50);
  });

  it('does nothing when there is nothing to move', async () => {
    const { backend, records } = memoryBackend();
    assert.equal(await migrateLegacyHistory(backend, memoryStorage().storage), 0);
    assert.equal(await migrateLegacyHistory(backend, null), 0);
    assert.equal(records.size, 0);
  });
});

describe('createHistoryStore', () => {
  it('shows migrated history and keeps every new entry, across reloads', async () => {
    const legacy = legacyHistory();
    const { backend, records } = memoryBackend();
    const { storage } = memoryStorage({ [LEGACY_HISTORY_KEY]: JSON.stringify(legacy) });

    const store = createHistoryStore({ open: async () => backend, legacy: storage });
    await store.settled();
    assert.equal(store.getSnapshot().loaded, true);
    assert.equal(store.getSnapshot().items.length, 50);

    for (let index = 0; index < 150; index++) store.add(entry(index));
    await store.settled();
    assert.equal(store.getSnapshot().items.length, 200);
    assert.equal(records.size, 200);
    assert.equal(store.getSnapshot().problem, null);

    // A fresh page load reads the same 200 back.
    const reloaded = createHistoryStore({ open: async () => backend, legacy: storage });
    await reloaded.settled();
    const ids = reloaded.getSnapshot().items.map((item) => item.id);
    assert.equal(ids.length, 200);
    for (const item of legacy) assert.ok(ids.includes(item.id));
  });

  it('returns the new entry and shows it at once, newest first', async () => {
    const { backend } = memoryBackend();
    const store = createHistoryStore({ open: async () => backend, legacy: null });
    const added = store.add({ ...entry(1), basedOn: ['earlier'] });
    assert.equal(store.getSnapshot().items[0], added);
    assert.deepEqual(added.basedOn, ['earlier']);
    await store.settled();
    assert.equal(store.getSnapshot().items[0]!.id, added.id);
  });

  it('keeps an entry it could not save, says so, and saves it with the next one', async () => {
    const { backend, records, control } = memoryBackend();
    let saves = 0;
    const store = createHistoryStore({ open: async () => backend, legacy: null, afterSave: () => saves++ });
    await store.settled();

    control.failWrites = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    const first = store.add(entry(1));
    await store.settled();
    assert.equal(store.getSnapshot().items.length, 1);
    assert.ok(store.getSnapshot().unsavedIds.has(first.id));
    assert.match(store.getSnapshot().problem ?? '', /no storage space left/);
    assert.equal(records.size, 0);

    control.failWrites = null;
    const second = store.add(entry(2));
    await store.settled();
    assert.deepEqual(new Set(records.keys()), new Set([first.id, second.id]));
    assert.equal(store.getSnapshot().unsavedIds.size, 0);
    assert.equal(store.getSnapshot().problem, null);
    assert.equal(saves, 1);
  });

  it('does not report an entry as unsaved while its write is only pending', async () => {
    const { backend } = memoryBackend();
    const store = createHistoryStore({ open: async () => backend, legacy: null });
    await store.settled();
    store.add(entry(1));
    assert.equal(store.getSnapshot().unsavedIds.size, 0);
    assert.equal(store.getSnapshot().problem, null);
  });

  it('without storage, shows the old history, leaves it in place and keeps new entries in memory', async () => {
    const raw = JSON.stringify(legacyHistory());
    const { storage, values } = memoryStorage({ [LEGACY_HISTORY_KEY]: raw });
    const store = createHistoryStore({
      open: () => Promise.reject(new DOMException('blocked', 'SecurityError')),
      legacy: storage,
    });
    await store.settled();
    assert.equal(store.getSnapshot().items.length, 50);
    assert.match(store.getSnapshot().problem ?? '', /not letting the app store data/);

    const added = store.add(entry(1));
    await store.settled();
    assert.equal(store.getSnapshot().items.length, 51);
    // Only the new entry is at risk; the old ones are still in localStorage.
    assert.deepEqual([...store.getSnapshot().unsavedIds], [added.id]);
    assert.equal(values.get(LEGACY_HISTORY_KEY), raw);
  });

  it('when the move fails, still shows the old history and saves it with the next entry', async () => {
    const legacy = legacyHistory();
    const raw = JSON.stringify(legacy);
    const { backend, records, control } = memoryBackend();
    const { storage, values } = memoryStorage({ [LEGACY_HISTORY_KEY]: raw });
    control.failWrites = new Error('busy');
    const store = createHistoryStore({ open: async () => backend, legacy: storage });
    await store.settled();
    assert.equal(store.getSnapshot().items.length, 50);
    assert.match(store.getSnapshot().problem ?? '', /Could not move your earlier history/);
    assert.equal(values.get(LEGACY_HISTORY_KEY), raw);

    control.failWrites = null;
    store.add(entry(1));
    await store.settled();
    assert.equal(records.size, 51);
    assert.equal(store.getSnapshot().problem, null);

    // The next start finishes the move and removes the old copy.
    const next = createHistoryStore({ open: async () => backend, legacy: storage });
    await next.settled();
    assert.equal(next.getSnapshot().items.length, 51);
    assert.equal(values.has(LEGACY_HISTORY_KEY), false);
  });

  it('deletes single entries and clears everything, old copy included', async () => {
    const { backend, records } = memoryBackend();
    const { storage, values } = memoryStorage({ [LEGACY_HISTORY_KEY]: JSON.stringify(legacyHistory()) });
    const store = createHistoryStore({ open: async () => backend, legacy: storage });
    await store.settled();

    store.remove('legacy-10');
    await store.settled();
    assert.equal(records.has('legacy-10'), false);
    assert.equal(store.getSnapshot().items.length, 49);

    values.set(LEGACY_HISTORY_KEY, '[]');
    store.clear();
    await store.settled();
    assert.equal(records.size, 0);
    assert.equal(store.getSnapshot().items.length, 0);
    assert.equal(values.has(LEGACY_HISTORY_KEY), false);
  });

  it('does not bring back an entry deleted while it was being saved', async () => {
    const { backend, records } = memoryBackend();
    const store = createHistoryStore({ open: async () => backend, legacy: null });
    await store.settled();
    const added = store.add(entry(1));
    store.remove(added.id);
    await store.settled();
    assert.equal(records.size, 0);
    assert.equal(store.getSnapshot().items.length, 0);
  });

  it('deletes an entry that was never saved without reporting a problem', async () => {
    const { backend, control } = memoryBackend();
    const store = createHistoryStore({ open: async () => backend, legacy: null });
    await store.settled();
    control.failWrites = new Error('read-only');
    const added = store.add(entry(1));
    await store.settled();
    assert.match(store.getSnapshot().problem ?? '', /Could not save/);
    store.remove(added.id);
    await store.settled();
    assert.equal(store.getSnapshot().items.length, 0);
    assert.doesNotMatch(store.getSnapshot().problem ?? '', /Could not delete/);
  });

  it('shows the entry again when its delete fails', async () => {
    const { backend, control } = memoryBackend();
    const store = createHistoryStore({ open: async () => backend, legacy: null });
    const added = store.add(entry(1));
    await store.settled();
    control.failWrites = new Error('locked');
    store.remove(added.id);
    await store.settled();
    assert.equal(store.getSnapshot().items[0]?.id, added.id);
    assert.match(store.getSnapshot().problem ?? '', /Could not delete the entry: locked/);
  });

  it('imports every new entry from an export, however many', async () => {
    const { backend, records } = memoryBackend();
    const store = createHistoryStore({ open: async () => backend, legacy: null });
    await store.settled();
    const existing = store.add(entry(0));
    const exported = [existing, ...legacyHistory(300)];
    assert.equal(store.importItems(exported), 300);
    await store.settled();
    assert.equal(records.size, 301);
    assert.equal(store.importItems(exported), 0);
  });

  it('picks up what another tab saved when told to reload', async () => {
    const { backend } = memoryBackend();
    const first = createHistoryStore({ open: async () => backend, legacy: null, announce: () => second.reload() });
    const second = createHistoryStore({ open: async () => backend, legacy: null });
    await Promise.all([first.settled(), second.settled()]);
    first.add(entry(1));
    await first.settled();
    await second.settled();
    assert.equal(second.getSnapshot().items.length, 1);
  });

  it('notifies subscribers on every change', async () => {
    const { backend } = memoryBackend();
    const store = createHistoryStore({ open: async () => backend, legacy: null });
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    await store.settled();
    const before = calls;
    store.add(entry(1));
    assert.ok(calls > before);
    unsubscribe();
    await store.settled();
  });
});
