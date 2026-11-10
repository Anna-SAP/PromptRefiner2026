import { History as HistoryIcon, KeyRound, RotateCcw, Sparkles } from 'lucide-react';

interface HeaderProps {
  modelLabel: string;
  historyCount: number;
  onReset: () => void;
  onOpenHistory: () => void;
  /** Present only in the browser-only build, where the user supplies the key. */
  apiKey?: { hasKey: boolean; onOpen: () => void };
}

export default function Header({ modelLabel, historyCount, onReset, onOpenHistory, apiKey }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 flex h-20 items-center justify-between gap-3 border-b border-dark-border bg-dark-bg/50 px-4 backdrop-blur-md md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="shrink-0 rounded-xl bg-brand-600 p-2 shadow-lg shadow-brand-500/20">
          <Sparkles className="h-6 w-6 text-white" aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-white">Prompt Refiner</h1>
          <p className="hidden text-xs text-slate-400 min-[420px]:block">Intelligent Prompt Engineering Assistant</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onReset}
          title="Clear all and start over"
          className="group flex items-center gap-2 rounded-lg border border-dark-border bg-dark-surface px-3 py-1.5 text-xs font-medium text-slate-400 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
        >
          <RotateCcw size={14} className="transition-transform duration-500 group-hover:-rotate-180" aria-hidden />
          <span className="hidden sm:inline">Start Over</span>
          <span className="sr-only sm:hidden">Start over</span>
        </button>

        <button
          type="button"
          onClick={onOpenHistory}
          aria-label={`History, ${historyCount} saved`}
          className="relative flex items-center gap-2 rounded-lg border border-dark-border bg-dark-surface px-3 py-1.5 text-xs font-medium text-slate-400 transition-all hover:border-brand-500/30 hover:bg-brand-500/10 hover:text-brand-300"
        >
          <HistoryIcon size={14} aria-hidden />
          <span className="hidden sm:inline">History</span>
          {historyCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white shadow-sm">
              {historyCount > 99 ? '99+' : historyCount}
            </span>
          )}
        </button>

        {apiKey && (
          <button
            type="button"
            onClick={apiKey.onOpen}
            aria-label={apiKey.hasKey ? 'API key: saved. Change it.' : 'API key: not set. Add one.'}
            className={`relative flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              apiKey.hasKey
                ? 'border-dark-border bg-dark-surface text-slate-400 hover:border-brand-500/30 hover:bg-brand-500/10 hover:text-brand-300'
                : 'border-brand-500/50 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20'
            }`}
          >
            <KeyRound size={14} aria-hidden />
            <span className="hidden sm:inline">{apiKey.hasKey ? 'API Key' : 'Add API Key'}</span>
            {apiKey.hasKey && (
              <span aria-hidden className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-dark-bg bg-green-400" />
            )}
          </button>
        )}

        <span className="hidden rounded-full border border-dark-border bg-dark-surface px-3 py-1 font-mono text-xs text-slate-400 lg:inline-block">
          Powered by {modelLabel}
        </span>
      </div>
    </header>
  );
}
