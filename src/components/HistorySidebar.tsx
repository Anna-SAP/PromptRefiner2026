import { ChevronRight, Clock, Download, MessageSquare, Search, Trash2, Upload, X } from 'lucide-react';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { HistoryItem } from '../types';

interface HistorySidebarProps {
  isOpen: boolean;
  history: HistoryItem[];
  onClose: () => void;
  onSelect: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  /** Merges a parsed backup file into history; returns how many items were new. */
  onImport: (value: unknown) => number;
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function HistorySidebar({
  isOpen,
  history,
  onClose,
  onSelect,
  onDelete,
  onClearAll,
  onImport,
}: HistorySidebarProps) {
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Each opening starts from the full list.
    setQuery('');
    setNotice(null);
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return history;
    return history.filter(
      (item) =>
        item.originalPrompt.toLowerCase().includes(needle) || item.refinedPrompt.toLowerCase().includes(needle),
    );
  }, [history, query]);

  const handleExport = () => {
    downloadJson(`prompt-refiner-history-${new Date().toISOString().slice(0, 10)}.json`, history);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const added = onImport(JSON.parse(await file.text()));
      setNotice(added > 0 ? `Imported ${added} new ${added === 1 ? 'entry' : 'entries'}.` : 'Nothing new to import.');
    } catch {
      setNotice('That file is not a Prompt Refiner history export.');
    }
  };

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="History"
        inert={!isOpen}
        className={`fixed inset-y-0 right-0 z-[70] flex w-full transform flex-col border-l border-dark-border bg-dark-surface shadow-2xl transition-transform duration-300 md:w-[400px] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-dark-border p-4">
          <div className="flex items-center gap-2 text-slate-200">
            <Clock className="h-5 w-5 text-brand-400" aria-hidden />
            <h2 className="text-lg font-semibold">History</h2>
            <span className="rounded-full border border-dark-border bg-dark-bg px-2 py-0.5 text-xs text-slate-400">
              {history.length}
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-dark-bg hover:text-white"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        {history.length > 0 && (
          <div className="border-b border-dark-border p-4">
            <label className="flex items-center gap-2 rounded-lg border border-dark-border bg-dark-bg/60 px-3 py-2 focus-within:border-brand-500/50">
              <Search size={14} className="shrink-0 text-slate-500" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search history"
                aria-label="Search history"
                className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
              />
            </label>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {history.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
              <Clock size={48} className="opacity-20" aria-hidden />
              <p>No history yet</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="pt-8 text-center text-sm text-slate-500">No entries match “{query.trim()}”.</p>
          ) : (
            <ul className="space-y-3">
              {visible.map((item) => (
                <li
                  key={item.id}
                  className="group relative rounded-xl border border-dark-border bg-dark-bg/50 transition-all hover:border-brand-500/50 hover:bg-dark-bg"
                >
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="flex w-full flex-col gap-2 rounded-xl p-3 text-left"
                  >
                    <span className="flex items-center gap-1.5 font-mono text-xs text-brand-400">
                      <Clock size={12} aria-hidden />
                      {dateFormat.format(item.timestamp)}
                    </span>
                    <span className="flex gap-2">
                      <MessageSquare size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
                      <span className="line-clamp-2 text-sm leading-relaxed break-words text-slate-300">
                        {item.originalPrompt || 'Image only request'}
                      </span>
                    </span>
                    <ChevronRight
                      size={16}
                      aria-hidden
                      className="absolute right-3 bottom-3 text-brand-400 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    title="Delete item"
                    aria-label="Delete this entry"
                    className="absolute top-2 right-2 rounded-md p-1.5 text-slate-500 transition-all hover:bg-red-500/20 hover:text-red-400 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-dark-border bg-dark-surface p-4">
          {notice && (
            <p role="status" className="text-center text-xs text-slate-400">
              {notice}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={history.length === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dark-border py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-dark-bg disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={14} aria-hidden />
              Export
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dark-border py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-dark-bg"
            >
              <Upload size={14} aria-hidden />
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete all history? This cannot be undone.')) {
                  onClearAll();
                }
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-900/30 py-2.5 text-sm font-medium text-red-400 transition-all hover:border-red-500/50 hover:bg-red-950/30"
            >
              <Trash2 size={16} aria-hidden />
              Clear All History
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
