/**
 * Where the browser-only build keeps the user's Anthropic API key.
 *
 * The key lives in this browser and nowhere else: sessionStorage by default
 * (gone when the tab closes), or localStorage when the user ticks "Remember on
 * this device". It is never written into the page's source, the build output,
 * or any request other than the ones the page makes to the Anthropic API.
 */

const STORAGE_KEY = 'prompt_refiner_api_key';

export interface StoredApiKey {
  key: string;
  /** True when the key is in localStorage and will survive closing the browser. */
  remembered: boolean;
}

// Used when the browser blocks storage (some private modes): the key then
// lasts until the page is reloaded.
let memoryFallback: string | null = null;

function read(storage: Storage): string | null {
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remove(storage: Storage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing to remove.
  }
}

export function loadApiKey(): StoredApiKey | null {
  const remembered = read(localStorage);
  if (remembered) return { key: remembered, remembered: true };
  const session = read(sessionStorage) ?? memoryFallback;
  return session ? { key: session, remembered: false } : null;
}

export function saveApiKey(key: string, remember: boolean): void {
  clearApiKey();
  try {
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, key);
  } catch {
    memoryFallback = key;
  }
}

export function clearApiKey(): void {
  memoryFallback = null;
  remove(localStorage);
  remove(sessionStorage);
}
