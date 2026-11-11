import { useId, useState } from 'react';
import type { EffortLevel } from '../../shared/protocol';

// The wording follows "Calibrate effort" in Anthropic's guide to prompting
// Claude Fable 5.2, the model this app refines with by default: `high` is the
// recommended starting point, `medium` suits everyday work, and effort barely
// changes the length of a reply.
const OPTIONS: { value: EffortLevel; label: string; hint: string }[] = [
  { value: 'low', label: 'Quick', hint: 'Fastest and cheapest, for simple requests.' },
  { value: 'medium', label: 'Balanced', hint: 'The everyday default here. Enough for most prompts.' },
  {
    value: 'high',
    label: 'Deep',
    hint: 'Anthropic’s recommended starting point for Claude Fable 5.2. Noticeably slower.',
  },
];

interface EffortSelectProps {
  value: EffortLevel;
  disabled: boolean;
  onChange: (value: EffortLevel) => void;
}

/**
 * How hard Claude thinks about the rewrite; maps to the API's `effort` setting.
 *
 * The line under the buttons says what the selected level means. Pointing at
 * or focusing another level previews its description before choosing it.
 */
export default function EffortSelect({ value, disabled, onChange }: EffortSelectProps) {
  const id = useId();
  const [preview, setPreview] = useState<EffortLevel | null>(null);
  const described = preview ?? value;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="radiogroup"
        aria-label="Thinking effort"
        className="inline-flex self-start rounded-lg border border-dark-border bg-dark-bg/60 p-0.5"
      >
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-describedby={`${id}-${option.value}`}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              onMouseEnter={() => setPreview(option.value)}
              onMouseLeave={() => setPreview(null)}
              onFocus={() => setPreview(option.value)}
              onBlur={() => setPreview(null)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                selected ? 'bg-dark-border text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* All three descriptions share one grid cell, so the cell is as tall as
          the longest and the layout does not move when the visible one changes. */}
      <div className="grid text-xs text-slate-400">
        {OPTIONS.map((option) => (
          <p
            key={option.value}
            id={`${id}-${option.value}`}
            className={`col-start-1 row-start-1 ${option.value === described ? '' : 'invisible'}`}
          >
            <span className="font-medium text-slate-300">
              {option.label} ({option.value})
            </span>
            <span aria-hidden> · </span>
            {option.hint}
          </p>
        ))}
      </div>

      <p className="text-xs text-slate-500">Effort sets how much Claude thinks, not how long the result is.</p>
    </div>
  );
}
