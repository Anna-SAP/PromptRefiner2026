import { REFINER_EDIT_RULE, rulesForTarget } from '../shared/rules';
import type { TargetModel } from '../shared/protocol';
import {
  detectLanguage,
  excerpt,
  lengthLimits,
  mentionsNumber,
  normalize,
  retainedShare,
  sentences,
} from './text';
import type { Check, CheckResult, EvalCase, Subject } from './types';

// --- Builders ----------------------------------------------------------------
// Cases are written with these, so each check reads as a sentence.

/** The refined prompt still contains this detail (after normalize()). */
export function keep(detail: string | RegExp, label?: string): Check {
  return typeof detail === 'string'
    ? { kind: 'keep', role: 'keep', text: detail, label: label ?? `keeps "${detail}"` }
    : { kind: 'keepMatch', role: 'keep', pattern: detail, label: label ?? `keeps ${detail}` };
}

/** The refined prompt does not add this; the draft does not have it either. */
export function avoid(pattern: RegExp, label: string, example: string): Check {
  return { kind: 'avoid', role: 'keep', pattern, label, example };
}

/** The draft has this; the refined prompt must not. */
export function drop(pattern: RegExp, label: string, { role = 'improve' }: { role?: 'improve' | 'keep' } = {}): Check {
  return { kind: 'drop', role, pattern, label };
}

/** The refined prompt gains this; the draft does not have it. With several patterns, at least `min` must match. */
export function add(patterns: RegExp | RegExp[], label: string, min?: number): Check {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  return { kind: 'add', role: 'improve', patterns: list, min: min ?? list.length, label };
}

/** Everything in `first` comes before `then`: "the fixed instructions come before the per-session details". */
export function order(first: RegExp | RegExp[], then: RegExp, label: string): Check {
  return { kind: 'order', role: 'improve', first: Array.isArray(first) ? first : [first], then, label };
}

export function qualified(
  pattern: RegExp,
  qualifier: RegExp,
  label: string,
  { role = 'improve', required = false }: { role?: 'improve' | 'keep'; required?: boolean } = {},
): Check {
  return { kind: 'qualified', role, pattern, qualifier, required, label };
}

export function sameSentence(patterns: RegExp[], label: string): Check {
  return { kind: 'sameSentence', role: 'keep', patterns, label };
}

/** Guards against the refiner carrying out the task instead of rewriting it. */
export function maxChars(max: number): Check {
  return { kind: 'maxChars', role: 'keep', max, label: `stays a prompt (at most ${max} characters)` };
}

export function similar(min: number): Check {
  return { kind: 'similar', role: 'keep', min, label: `keeps at least ${Math.round(min * 100)}% of the draft's wording` };
}

export function lengthRatio(max: number): Check {
  return { kind: 'lengthRatio', role: 'keep', max, label: `grows to at most ${max}× the draft's length` };
}

export function analysisSays(pattern: RegExp, label: string): Check {
  return { kind: 'analysis', role: 'explain', pattern, label };
}

export function cites(rules: string[], label?: string): Check {
  return { kind: 'cites', role: 'explain', rules, label: label ?? `rationale cites ${rules.join(' or ')}` };
}

// Patterns several cases share. They run on normalize()d text.

/** "Say in the analysis that the effort setting controls how much the model thinks." */
export const MENTIONS_EFFORT = /effort|思考深度|思考程度|思考量|推理强度|推理深度|推理量|思考档位/i;
/** The analysis points out a conflict. */
export const MENTIONS_CONFLICT =
  /contradict|conflict|clash|inconsisten|at odds|incompatible|which (one |rule |tone )?(wins|comes first|takes (priority|precedence))|can'?t (both|do both)|cannot (both|be both|do both)|矛盾|冲突|抵触|不一致|打架|相悖|哪条优先|哪个优先|以哪条为准|无法同时|不能同时|二选一/i;
/** The analysis says little needed changing. */
export const SAYS_LITTLE_CHANGED =
  /already|little|minimal|minor|few changes|(mostly|largely) unchanged|light(ly)?\b|well[- ]?(focused|structured|written|scoped)|as (it )?(is|was)|no changes?|nothing (much )?to change|基本保留|改动很少|改动不大|几乎没有|几乎不需要|已经(很|足够|比较|相当)?(清楚|清晰|完整|聚焦|明确|具体|好)|原样|少量|微调|小幅|只做了|只调整|只把|只改|只是把/i;
/** A bracketed question for the user, such as [which comes first: short replies or full detail?]. */
export const BRACKETED_QUESTION = /\[[^\]\n]*\?[^\]\n]*\]/;

// --- Checks every case gets ----------------------------------------------------

export function globalChecks(evalCase: EvalCase): Check[] {
  const checks: Check[] = [
    { kind: 'structure', role: 'format', label: 'answer has <analysis> and <refined_prompt> blocks' },
    { kind: 'complete', role: 'format', label: 'refined prompt is complete and not empty' },
    { kind: 'noLeakedTags', role: 'format', label: 'refined prompt contains none of the answer or request tags' },
    { kind: 'rationaleBlock', role: 'format', label: 'answer ends with a complete <rationale> block' },
    { kind: 'rationaleTarget', role: 'format', label: `rationale names the target (${evalCase.target})` },
    { kind: 'knownRules', role: 'format', label: 'rationale cites only rules offered for the target, or refiner-edit' },
    { kind: 'analysisPresent', role: 'explain', label: 'analysis is not empty' },
    { kind: 'language', role: 'keep', label: `refined prompt is in the draft's language (${evalCase.lang})` },
    { kind: 'noNewLimits', role: 'keep', label: 'adds no length limit the draft does not give' },
  ];
  if (evalCase.expect === 'improve') {
    checks.push({ kind: 'rationaleEntries', role: 'explain', label: 'rationale lists at least one change' });
  }
  return checks;
}

export function allChecks(evalCase: EvalCase): Check[] {
  return [...globalChecks(evalCase), ...evalCase.checks];
}

// --- Evaluation ---------------------------------------------------------------

/** What the checks compare a refinement against. */
export interface CaseContext {
  target: TargetModel;
  lang: 'zh' | 'en';
  /** Everything the user gave: the draft and the earlier sessions. */
  source: string;
  /** The prompt as it stood before this refinement: the draft, or the latest earlier refined prompt. */
  before: string;
  allowedRules: Set<string>;
}

/** The prompt as it stood before this refinement. */
export function promptBefore(evalCase: EvalCase): string {
  const last = evalCase.references?.at(-1);
  return last ? last.refinedPrompt : evalCase.draft;
}

export function caseContext(evalCase: EvalCase, rulesFor = rulesForTarget): CaseContext {
  const earlier = (evalCase.references ?? []).flatMap((reference) => [
    reference.originalPrompt,
    reference.analysis,
    reference.refinedPrompt,
  ]);
  return {
    target: evalCase.target,
    lang: evalCase.lang,
    source: [...earlier, evalCase.draft].join('\n'),
    before: promptBefore(evalCase),
    allowedRules: new Set([...rulesFor(evalCase.target).map((rule) => rule.id), REFINER_EDIT_RULE]),
  };
}

const LEAKED_TAG =
  /<\/?(analysis|refined_prompt|rationale|change|raw_request|earlier_sessions|session|earlier_draft|earlier_analysis|earlier_refined_prompt)\b/;

function firstMatch(pattern: RegExp, text: string): string | undefined {
  return pattern.exec(text)?.[0];
}

/** Returns null when the check passes, or why it failed. */
export function runCheck(check: Check, subject: Subject, context: CaseContext): string | null {
  const prompt = normalize(subject.prompt);
  switch (check.kind) {
    case 'keep':
      return prompt.includes(normalize(check.text)) ? null : 'not found in the refined prompt';
    case 'keepMatch':
      return check.pattern.test(prompt) ? null : 'not found in the refined prompt';
    case 'avoid':
    case 'drop': {
      const found = firstMatch(check.pattern, prompt);
      return found === undefined ? null : `refined prompt still has "${excerpt(found, 60)}"`;
    }
    case 'add': {
      const missing = check.patterns.filter((pattern) => !pattern.test(prompt));
      const found = check.patterns.length - missing.length;
      if (found >= check.min) return null;
      return check.patterns.length === 1
        ? 'not found in the refined prompt'
        : `found ${found} of the ${check.min} needed`;
    }
    case 'order': {
      const then = prompt.search(check.then);
      if (then === -1) return `${check.then} not found`;
      for (const pattern of check.first) {
        const at = prompt.search(pattern);
        if (at === -1) return `${pattern} not found`;
        if (at > then) return `"${firstMatch(check.then, prompt)}" comes before "${firstMatch(pattern, prompt)}"`;
      }
      return null;
    }
    case 'qualified': {
      const matching = sentences(subject.prompt).filter((sentence) => check.pattern.test(sentence));
      if (check.required && matching.length === 0) return 'no sentence states it any more';
      const bare = matching.find((sentence) => !check.qualifier.test(sentence));
      return bare === undefined ? null : `this sentence lacks it: "${excerpt(bare)}"`;
    }
    case 'sameSentence':
      return sentences(subject.prompt).some((sentence) => check.patterns.every((pattern) => pattern.test(sentence)))
        ? null
        : 'no single sentence says all of it';
    case 'maxChars':
      return subject.prompt.length <= check.max
        ? null
        : `${subject.prompt.length} characters; a refined prompt this long may be the task carried out rather than a prompt for it`;
    case 'similar': {
      const share = retainedShare(context.before, subject.prompt);
      return share >= check.min ? null : `kept ${Math.round(share * 100)}% of the draft's wording`;
    }
    case 'lengthRatio': {
      const ratio = subject.prompt.length / Math.max(1, context.before.length);
      return ratio <= check.max ? null : `${ratio.toFixed(2)}× the draft's length`;
    }
    case 'analysis':
      return check.pattern.test(normalize(subject.analysis)) ? null : 'the analysis does not say so';
    case 'cites': {
      const cited = subject.rationale.entries.map((entry) => entry.rule);
      return check.rules.some((rule) => cited.includes(rule))
        ? null
        : `cited ${cited.length > 0 ? cited.join(', ') : 'nothing'}`;
    }
    case 'structure':
      return subject.format === 'tagged' ? null : `answer is in the ${subject.format} format`;
    case 'complete':
      if (!subject.promptComplete) return 'the </refined_prompt> tag never arrived';
      return subject.prompt.trim() ? null : 'refined prompt is empty';
    case 'noLeakedTags': {
      const found = firstMatch(LEAKED_TAG, subject.prompt);
      return found === undefined ? null : `refined prompt contains "${found}"`;
    }
    case 'rationaleBlock':
      if (!subject.rationale.started) return 'no <rationale> block';
      return subject.rationale.complete ? null : 'the </rationale> tag never arrived';
    case 'rationaleTarget':
      return subject.rationale.target === context.target
        ? null
        : `rationale target is ${subject.rationale.target === null ? 'missing' : `"${subject.rationale.target}"`}`;
    case 'knownRules': {
      const unknown = subject.rationale.entries
        .map((entry) => entry.rule)
        .filter((rule) => !context.allowedRules.has(rule));
      return unknown.length === 0 ? null : `cites ${unknown.map((rule) => `"${rule}"`).join(', ')}`;
    }
    case 'analysisPresent':
      return subject.analysis.trim() ? null : 'analysis is empty';
    case 'rationaleEntries':
      return subject.rationale.entries.length > 0 ? null : 'rationale is empty';
    case 'language': {
      const language = detectLanguage(subject.prompt);
      return language === context.lang ? null : `refined prompt reads as ${language}`;
    }
    case 'noNewLimits': {
      const added = lengthLimits(subject.prompt).filter((limit) => !mentionsNumber(context.source, limit.value));
      return added.length === 0 ? null : `adds ${added.map((limit) => `"${limit.text}"`).join(', ')}`;
    }
  }
}

export function evaluate(checks: Check[], subject: Subject, context: CaseContext): CheckResult[] {
  return checks.map((check) => {
    const reason = runCheck(check, subject, context);
    return reason === null ? { check, pass: true } : { check, pass: false, reason };
  });
}
