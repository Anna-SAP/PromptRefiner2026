import type { EffortLevel } from '../../shared/protocol';

const OPTIONS: { value: EffortLevel; label: string; hint: string }[] = [
  { value: 'low', label: 'Quick', hint: 'Fastest. Good for short, clear drafts.' },
  { value: 'medium', label: 'Balanced', hint: 'A good default for everyday prompts.' },
  { value: 'high', label: 'Deep', hint: 'Claude thinks longer. Best for complex or high-stakes prompts.' },
];

interface EffortSelectProps {
  value: EffortLevel;
  disabled: boolean;
  onChange: (value: EffortLevel) => void;
}

/** How hard Claude thinks about the rewrite; maps to the API's `effort` setting. */
export default function EffortSelect({ value, disabled, onChange }: EffortSelectProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Thinking effort"
      className="inline-flex rounded-lg border border-dark-border bg-dark-bg/60 p-0.5"
    >
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.hint}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              selected ? 'bg-dark-border text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
