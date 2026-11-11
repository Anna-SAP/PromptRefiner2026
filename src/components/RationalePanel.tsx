import { ChevronDown, ExternalLink, ListChecks } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { ParsedRationale, RationaleEntry } from '../../shared/parseRationale';
import { type TargetModel, isTargetModel } from '../../shared/protocol';
import {
  GUIDES,
  REFINER_EDIT_RULE,
  TARGETS,
  findRule,
  isOutsideScope,
  sourceUrl,
} from '../../shared/rules';

interface RationalePanelProps {
  rationale: ParsedRationale;
  /** Shown after the last entry while the block is still arriving. */
  cursor: ReactNode;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-x-3">
      <dt className="text-xs font-semibold tracking-wider text-slate-500 uppercase">{label}</dt>
      <dd className="min-w-0 text-sm leading-relaxed break-words text-slate-300">{children}</dd>
    </div>
  );
}

function Entry({ entry, target, cursor }: { entry: RationaleEntry; target: TargetModel | null; cursor: ReactNode }) {
  const rule = findRule(entry.rule);
  const change = (
    <Field label="Change">
      {entry.change}
      {cursor}
    </Field>
  );

  // No link is ever built from the model's text: a source appears only when
  // the cited id is one of the rules in shared/rules.ts.
  if (!rule) {
    const isRefinerEdit = entry.rule === REFINER_EDIT_RULE;
    return (
      <dl className="space-y-2">
        {change}
        <Field label="Rule">
          {isRefinerEdit
            ? 'Prompt Refiner’s own editing approach.'
            : entry.rule
              ? `“${entry.rule}” is not a rule this app knows.`
              : 'No rule was cited.'}
        </Field>
        <Field label="Source">
          {isRefinerEdit
            ? 'None. This change does not rest on a rule from an Anthropic guide.'
            : 'None, so this change cannot be checked against a guide.'}
        </Field>
        <Field label="Applies to">{isRefinerEdit ? 'Any target model' : 'Unknown'}</Field>
      </dl>
    );
  }

  return (
    <dl className="space-y-2">
      {change}
      <Field label="Rule">
        <span className="font-medium text-slate-200">{rule.title}.</span> {rule.instruction}
      </Field>
      <Field label="Source">
        <ul className="space-y-1">
          {rule.sources.map((source) => (
            <li key={`${source.guide}#${source.anchor}`}>
              <a
                href={sourceUrl(source)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-baseline gap-1 text-brand-300 underline decoration-brand-300/40 underline-offset-2 hover:text-brand-200"
              >
                <span>
                  {GUIDES[source.guide].title} › {source.section}
                </span>
                <ExternalLink size={12} className="shrink-0 self-center" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
        {rule.note && <p className="mt-1 text-xs text-slate-400">{rule.note}</p>}
      </Field>
      <Field label="Applies to">
        {rule.appliesTo}
        {target && isOutsideScope(rule, target) && (
          <p className="mt-1 text-xs text-amber-300/90">
            The guide states this rule for another model, not for {TARGETS[target].label}. Prompt Refiner applies it
            to every target as its own rule.
          </p>
        )}
      </Field>
    </dl>
  );
}

/**
 * The reasons behind the edit: one entry per change, each with the rule it
 * rests on, the guide section that states the rule, and the models the rule
 * is for. Display only; nothing here is ever copied with the prompt.
 */
export default function RationalePanel({ rationale, cursor }: RationalePanelProps) {
  const [open, setOpen] = useState(true);
  const target = isTargetModel(rationale.target) ? rationale.target : null;
  const count = rationale.entries.length;

  return (
    <section className="mt-4 rounded-xl border border-dark-border bg-dark-bg/40">
      <h3>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex w-full flex-wrap items-center gap-2 rounded-xl px-4 py-2.5 text-left text-xs font-medium text-slate-300 hover:text-white"
        >
          <ListChecks size={14} className="text-brand-400" aria-hidden />
          <span>Why these changes{rationale.complete ? ` (${count})` : ''}</span>
          {target && (
            <span className="rounded-full border border-dark-border px-2 py-0.5 font-normal text-slate-400">
              Written for {TARGETS[target].label}
            </span>
          )}
          <ChevronDown size={14} className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h3>

      {open && (
        <div className="border-t border-dark-border px-4 py-3">
          <p className="mb-3 text-xs text-slate-500">
            For checking the edit. This list is not part of the refined prompt and is not copied with it.
          </p>
          {count === 0 ? (
            <p className="text-sm text-slate-400">
              {rationale.complete ? 'No changes were listed.' : 'Listing the changes…'}
              {!rationale.complete && cursor}
            </p>
          ) : (
            <ol className="space-y-4">
              {rationale.entries.map((entry, index) => (
                <li key={index} className="border-l-2 border-brand-500/30 pl-3">
                  <Entry
                    entry={entry}
                    target={target}
                    cursor={!rationale.complete && index === count - 1 ? cursor : null}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
