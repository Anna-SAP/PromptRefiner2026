import { ExternalLink, KeyRound, ShieldCheck, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';

interface ApiKeyDialogProps {
  isOpen: boolean;
  hasKey: boolean;
  remembered: boolean;
  onSave: (key: string, remember: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
}

/**
 * Browser-only build: where the user enters their own Anthropic API key.
 * A saved key is never shown again — the field only accepts a replacement.
 */
export default function ApiKeyDialog({ isOpen, hasKey, remembered, onSave, onRemove, onClose }: ApiKeyDialogProps) {
  const [value, setValue] = useState('');
  const [remember, setRemember] = useState(remembered);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValue('');
    setRemember(remembered);
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, remembered, onClose]);

  if (!isOpen) return null;

  const trimmed = value.trim();
  const looksUnusual = trimmed.length > 0 && !trimmed.startsWith('sk-ant-');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed) return;
    onSave(trimmed, remember);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-key-title"
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-2xl border border-dark-border bg-dark-surface p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-100">
            <KeyRound className="h-5 w-5 text-brand-400" aria-hidden />
            <h2 id="api-key-title" className="text-lg font-semibold">
              Anthropic API Key
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

        <p className="mb-4 text-sm leading-relaxed text-slate-400">
          This page has no server of its own. It calls Claude straight from your browser, using your key.
        </p>

        <label htmlFor="api-key-input" className="mb-1.5 block text-xs font-medium text-slate-300">
          {hasKey ? 'Replace the saved key' : 'Your API key'}
        </label>
        <input
          ref={inputRef}
          id="api-key-input"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={hasKey ? 'A key is saved. Paste a new one to replace it.' : 'sk-ant-…'}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-dark-border bg-dark-bg/60 px-3 py-2 font-mono text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-brand-500/60"
        />
        {looksUnusual && (
          <p className="mt-1.5 text-xs text-amber-400">Anthropic keys usually start with “sk-ant-”. Check that this is the right one.</p>
        )}

        <label className="mt-4 flex items-start gap-2.5 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand-500"
          />
          <span>
            Remember on this device
            <span className="block text-xs text-slate-500">
              Off: the key is forgotten when you close this tab. Leave it off on a shared computer.
            </span>
          </span>
        </label>

        <p className="mt-4 flex items-start gap-2 rounded-lg border border-dark-border bg-dark-bg/40 p-3 text-xs leading-relaxed text-slate-400">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-green-400" aria-hidden />
          <span>
            The key is stored only in this browser and sent only to the Anthropic API. Usage is billed to your
            Anthropic account.
          </span>
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
          >
            Get a key
            <ExternalLink size={12} aria-hidden />
          </a>
          <div className="flex gap-2">
            {hasKey && (
              <button
                type="button"
                onClick={onRemove}
                className="rounded-lg border border-red-900/40 px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-950/30"
              >
                Remove key
              </button>
            )}
            <button
              type="submit"
              disabled={!trimmed}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              Save key
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
