import { ExternalLink } from 'lucide-react';
import { useId } from 'react';
import { TARGET_MODELS, type TargetModel, isTargetModel } from '../../shared/protocol';
import { GUIDES, TALK, TARGETS } from '../../shared/rules';

interface TargetSelectProps {
  value: TargetModel;
  disabled: boolean;
  onChange: (value: TargetModel) => void;
}

const LINK =
  'mr-2 inline-flex items-center gap-1 whitespace-nowrap text-brand-300 underline decoration-brand-300/40 underline-offset-2 hover:text-brand-200';

/**
 * Which model the refined prompt is written for. The choice decides which of
 * Anthropic's prompting guides the meta-prompt takes its rules from; the line
 * under the menu names those guides and links to them. Every target also gets
 * the cross-model rules from Lance Martin's talk, linked last.
 */
export default function TargetSelect({ value, disabled, onChange }: TargetSelectProps) {
  const id = useId();
  const target = TARGETS[value];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-xs font-medium text-slate-300">
          Target model
        </label>
        <select
          id={id}
          value={value}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            if (isTargetModel(event.target.value)) onChange(event.target.value);
          }}
          className="rounded-lg border border-dark-border bg-dark-bg/60 px-2 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {TARGET_MODELS.map((model) => (
            <option key={model} value={model}>
              {TARGETS[model].label}
            </option>
          ))}
        </select>
      </div>

      <p id={`${id}-hint`} className="text-xs text-slate-400">
        {value === 'generic'
          ? 'No particular model: only the rules that hold across Claude models, from'
          : 'The model you will paste the result into. Its rules come from'}{' '}
        {target.guides.map((guide) => (
          <a key={guide} href={GUIDES[guide].url} target="_blank" rel="noreferrer" className={LINK}>
            {GUIDES[guide].title}
            <ExternalLink size={11} aria-hidden />
          </a>
        ))}
        <span className="mr-1">and the talk</span>
        <a href={TALK.url} target="_blank" rel="noreferrer" className={LINK} title={TALK.speaker}>
          {TALK.title}
          <ExternalLink size={11} aria-hidden />
        </a>
      </p>
    </div>
  );
}
