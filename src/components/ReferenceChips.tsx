import { MessageSquare, X } from 'lucide-react';
import { sessionDateFormat, sessionTitle } from '../lib/sessionLabel';
import type { HistoryItem } from '../types';

interface ReferenceChipsProps {
  /** The earlier sessions the next refinement will build on, oldest first. */
  sessions: HistoryItem[];
  disabled: boolean;
  onRemove: (id: string) => void;
}

/** The selected earlier sessions, shown under the draft the way attached images are. */
export default function ReferenceChips({ sessions, disabled, onRemove }: ReferenceChipsProps) {
  if (sessions.length === 0) return null;

  return (
    <ul aria-label="Referenced earlier sessions" className="mb-3 flex flex-wrap gap-2">
      {sessions.map((session) => {
        const title = sessionTitle(session);
        const date = sessionDateFormat.format(session.timestamp);
        return (
          <li
            key={session.id}
            title={title}
            className="flex max-w-full items-center gap-1.5 rounded-lg border border-dark-border bg-dark-bg/60 py-1 pr-1 pl-2 text-xs text-slate-300"
          >
            <MessageSquare size={12} className="shrink-0 text-brand-400" aria-hidden />
            <span className="max-w-[14rem] truncate">{title}</span>
            <span className="shrink-0 font-mono text-[11px] text-slate-500">{date}</span>
            <button
              type="button"
              onClick={() => onRemove(session.id)}
              disabled={disabled}
              aria-label={`Stop referencing the session from ${date}: ${title.slice(0, 80)}`}
              className="shrink-0 rounded-md p-0.5 text-slate-500 transition-colors hover:bg-red-500/20 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500"
            >
              <X size={12} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
