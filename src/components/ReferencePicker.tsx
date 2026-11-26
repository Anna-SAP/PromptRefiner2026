import { Clock, MessageSquarePlus, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LIMITS } from '../../shared/protocol';
import { toReference } from '../../shared/references';
import { sessionDateFormat, sessionTitle } from '../lib/sessionLabel';
import type { HistoryItem } from '../types';

/**
 * Sessions are listed this many at a time, newest first: history has no cap,
 * and drawing thousands of sessions at once makes the dialog slow to open.
 */
const PAGE_SIZE = 50;

// What a saved session would hand on, worked out once per entry: reading it
// means parsing the whole answer.
const handedOn = new WeakMap<HistoryItem, string>();
function referenceResult(item: HistoryItem): string {
  let result = handedOn.get(item);
  if (result === undefined) {
    result = toReference(item).refinedPrompt;
    handedOn.set(item, result);
  }
  return result;
}

interface ReferencePickerProps {
  isOpen: boolean;
  history: HistoryItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Where the user picks the earlier sessions a new refinement builds on.
 * Choices apply as they are ticked; the dialog only has to be closed.
 */
export default function ReferencePicker({
  isOpen,
  history,
  selectedIds,
  onToggle,
  onClear,
  onClose,
}: ReferencePickerProps) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const searchRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Each opening starts from the full list.
    setQuery('');
    setLimit(PAGE_SIZE);
    (searchRef.current ?? doneRef.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // The sessions to list, newest first, going only as far into history as the
  // page needs. A session whose answer came out empty has nothing to build on,
  // so it is not offered. Search still reaches every session.
  const { visible, hasSessions, hasMore } = useMemo(() => {
    const found: { item: HistoryItem; result: string }[] = [];
    let hasSessions = false;
    let hasMore = false;
    if (!isOpen) return { visible: found, hasSessions, hasMore };
    const needle = query.trim().toLowerCase();
    for (const item of history) {
      const result = referenceResult(item);
      if (!result) continue;
      hasSessions = true;
      if (needle && !item.originalPrompt.toLowerCase().includes(needle) && !result.toLowerCase().includes(needle)) {
        continue;
      }
      if (found.length === limit) {
        hasMore = true;
        break;
      }
      found.push({ item, result });
    }
    return { visible: found, hasSessions, hasMore };
  }, [history, isOpen, query, limit]);

  if (!isOpen) return null;

  const selected = new Set(selectedIds);
  const atLimit = selected.size >= LIMITS.maxReferences;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-picker-title"
        className="relative flex max-h-[min(85dvh,44rem)] w-full max-w-xl flex-col rounded-2xl border border-dark-border bg-dark-surface shadow-2xl"
      >
        <div className="p-6 pb-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 text-slate-100">
              <MessageSquarePlus className="h-5 w-5 text-brand-400" aria-hidden />
              <h2 id="reference-picker-title" className="text-lg font-semibold">
                Reference earlier sessions
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-dark-bg hover:text-white"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <p className="text-sm leading-relaxed text-slate-400">
            Pick the refinements this one should build on. Claude reads each one’s draft, analysis and refined prompt
            together with your new input, and writes a single result.
          </p>

          {hasSessions && (
            <label className="mt-4 flex items-center gap-2 rounded-lg border border-dark-border bg-dark-bg/60 px-3 py-2 focus-within:border-brand-500/50">
              <Search size={14} className="shrink-0 text-slate-500" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setLimit(PAGE_SIZE);
                }}
                placeholder="Search history"
                aria-label="Search history"
                className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
              />
            </label>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          {!hasSessions ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-slate-500">
              <Clock size={40} className="opacity-20" aria-hidden />
              <p className="text-sm">No history yet. Refine a prompt first, then build on it from here.</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No entries match “{query.trim()}”.</p>
          ) : (
            <ul className="space-y-2 pb-1">
              {visible.map(({ item, result }) => {
                const checked = selected.has(item.id);
                const unavailable = !checked && atLimit;
                return (
                  <li key={item.id}>
                    <label
                      className={`flex gap-3 rounded-xl border p-3 transition-colors ${
                        checked
                          ? 'border-brand-500/60 bg-brand-500/10'
                          : 'border-dark-border bg-dark-bg/50 hover:border-brand-500/50 hover:bg-dark-bg'
                      } ${unavailable ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={unavailable}
                        onChange={() => onToggle(item.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
                      />
                      <span className="flex min-w-0 flex-col gap-1.5">
                        <span className="flex items-center gap-1.5 font-mono text-xs text-brand-400">
                          <Clock size={12} aria-hidden />
                          {sessionDateFormat.format(item.timestamp)}
                        </span>
                        <span className="line-clamp-2 text-sm leading-relaxed break-words text-slate-300">
                          {sessionTitle(item)}
                        </span>
                        <span className="flex gap-1.5 text-xs leading-relaxed text-slate-500">
                          <Sparkles size={12} className="mt-0.5 shrink-0" aria-hidden />
                          <span className="sr-only">Refined prompt: </span>
                          <span className="line-clamp-2 break-words">{result}</span>
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={() => setLimit((current) => current + PAGE_SIZE)}
              className="mb-1 mt-2 w-full rounded-lg border border-dark-border py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-dark-bg hover:text-slate-200"
            >
              Show older sessions
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dark-border p-6 pt-4">
          <p role="status" className="text-xs text-slate-400">
            {selected.size} of {LIMITS.maxReferences} selected
            {atLimit && <span className="text-slate-500"> · Untick one to pick another.</span>}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClear}
              disabled={selected.size === 0}
              className="rounded-lg border border-dark-border px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-dark-bg disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear selection
            </button>
            <button
              ref={doneRef}
              type="button"
              onClick={onClose}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
