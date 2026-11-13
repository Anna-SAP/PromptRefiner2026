import { AlertTriangle, Brain, Check, ChevronDown, Copy, Database, Loader2, Terminal, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatForCopy, parseRefineOutput } from '../../shared/parseOutput';
import { splitRationale } from '../../shared/parseRationale';
import type { Usage } from '../../shared/protocol';
import { useCopy } from '../hooks/useCopy';
import type { RefineStatus } from '../types';
import RationalePanel from './RationalePanel';

interface RefineOutputProps {
  status: RefineStatus;
  output: string;
  thinking: string;
  error: string | null;
  truncated: boolean;
  usage: Usage | null;
}

function CopyButton({ text, label, className }: { text: string; label: string; className: string }) {
  const { copied, copy } = useCopy();
  return (
    <button type="button" onClick={() => copy(text)} className={className}>
      {copied ? <Check size={14} className="text-green-400" aria-hidden /> : <Copy size={14} aria-hidden />}
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  );
}

const count = (tokens: number) => tokens.toLocaleString('en-US');

/**
 * One line on what the request used, so the prompt cache's hit rate is
 * visible: the meta-prompt is the same on every request for a target, and a
 * cache read is billed at a fraction of the normal input rate.
 */
function UsageLine({ usage }: { usage: Usage }) {
  const input = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const cache =
    usage.cacheReadTokens > 0
      ? `${count(usage.cacheReadTokens)} (${Math.round((usage.cacheReadTokens / input) * 100)}%) read from the prompt cache`
      : usage.cacheWriteTokens > 0
        ? `${count(usage.cacheWriteTokens)} written to the prompt cache for the next refinement`
        : 'prompt cache not used';
  return (
    <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
      <Database size={12} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        Input {count(input)} tokens, {cache}. Output {count(usage.outputTokens)} tokens, thinking included.
      </span>
    </p>
  );
}

function ThinkingPanel({ thinking, active }: { thinking: string; active: boolean }) {
  // Open while Claude is still reasoning, folded away once the answer starts —
  // unless the user has chosen for themselves.
  const [userChoice, setUserChoice] = useState<boolean | null>(null);
  const open = userChoice ?? active;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thinking, active]);

  return (
    <section className="mb-4 rounded-xl border border-dark-border bg-dark-bg/40">
      <button
        type="button"
        onClick={() => setUserChoice(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left text-xs font-medium text-slate-400 hover:text-slate-200"
      >
        {active ? (
          <Loader2 size={14} className="animate-spin text-brand-400" aria-hidden />
        ) : (
          <Brain size={14} className="text-brand-400" aria-hidden />
        )}
        <span>{active ? 'Claude is thinking…' : 'Reasoning summary'}</span>
        <ChevronDown size={14} className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div
          ref={bodyRef}
          className="max-h-48 overflow-y-auto border-t border-dark-border px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-400"
        >
          {thinking}
        </div>
      )}
    </section>
  );
}

export default function RefineOutput({ status, output, thinking, error, truncated, usage }: RefineOutputProps) {
  const isStreaming = status === 'generating';
  // The rationale block is cut off first. Everything below that reads or
  // copies the analysis and the prompt works on `answer`, which has no
  // rationale in it.
  const { main: answer, rationale } = useMemo(() => splitRationale(output), [output]);
  const parsed = useMemo(() => parseRefineOutput(answer), [answer]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  // Follow the stream while the reader is at the bottom; stop the moment they
  // scroll up to read something.
  useEffect(() => {
    const element = scrollRef.current;
    if (element && isStreaming && pinnedToBottom.current) element.scrollTop = element.scrollHeight;
  }, [output, thinking, isStreaming]);

  if (status === 'idle' && !output) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-dark-border p-8 text-center text-slate-500">
        <Zap className="mb-4 h-12 w-12 opacity-20" aria-hidden />
        <h3 className="mb-2 text-lg font-medium text-slate-400">Ready to Refine</h3>
        <p className="max-w-xs text-sm">
          Enter your idea on the left, add optional screenshots, and watch the magic happen here.
        </p>
      </div>
    );
  }

  const cursor = isStreaming ? <span className="stream-cursor" aria-hidden /> : null;
  const waitingForFirstToken = isStreaming && !output && !thinking;

  return (
    <div className="relative flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-300">
          <Zap size={18} aria-hidden />
          Refined Result
        </h2>
        {output && !isStreaming && (
          <CopyButton
            text={formatForCopy(answer)}
            label="Copy Full Text"
            className="flex items-center gap-2 rounded-lg border border-dark-border bg-dark-surface px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-dark-border"
          />
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          pinnedToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
        }}
        className="flex-1 overflow-y-auto pr-2"
        aria-busy={isStreaming}
      >
        {thinking && <ThinkingPanel thinking={thinking} active={isStreaming && !output} />}

        {waitingForFirstToken && (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin text-brand-400" aria-hidden />
            Sending to Claude…
          </p>
        )}

        {parsed.analysis && (
          <section className="mb-4">
            <h3 className="mb-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase">
              {parsed.format === 'plain' ? 'Response' : 'Analysis'}
            </h3>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-300">
              {parsed.analysis}
              {!parsed.promptStarted && cursor}
            </p>
          </section>
        )}

        {parsed.promptStarted && (
          <section className="overflow-hidden rounded-xl border border-brand-500/20 bg-dark-code shadow-lg">
            <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-4 py-2">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-brand-400" aria-hidden />
                <h3 className="font-mono text-xs text-brand-200/60 uppercase">Refined Prompt</h3>
              </div>
              {parsed.prompt && !isStreaming && (
                <CopyButton
                  text={parsed.prompt}
                  label="Copy Prompt"
                  className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                />
              )}
            </div>
            <pre className="p-4 font-mono text-sm leading-relaxed break-words whitespace-pre-wrap text-brand-50/90">
              {parsed.prompt}
              {!rationale.started && cursor}
            </pre>
          </section>
        )}

        {rationale.started && <RationalePanel rationale={rationale} cursor={cursor} />}

        {status === 'complete' && usage && <UsageLine usage={usage} />}

        {status === 'stopped' && (
          <p className="mt-4 text-xs text-slate-500">Stopped before the result was complete. It was not saved to history.</p>
        )}

        {truncated && (
          <p role="status" className="mt-4 flex items-start gap-2 text-xs text-amber-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
            The result reached the output limit and may be cut off.
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-300"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
