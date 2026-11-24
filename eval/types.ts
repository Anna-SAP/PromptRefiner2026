import type { ParsedRationale } from '../shared/parseRationale';
import type { RefineReference, TargetModel } from '../shared/protocol';

/** The kinds of draft the golden set covers. */
export const CATEGORIES = ['coding-agent', 'multi-step-agent', 'grading', 'chatbot', 'writing'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * What makes a draft hard to refine well.
 *
 * details       — specifics (paths, ids, numbers, quotes) that a rewrite easily loses
 * contradiction — two instructions that cannot both be followed
 * boosters      — lines written for older models: "think step by step", "double-check", shouting
 * cache-prefix  — per-request values at the top of a reusable system prompt
 * grader-scale  — a grading prompt with a scale whose levels are undefined
 * rule-interplay— two refiner rules pull in different directions
 * not-a-task    — the draft talks to the refiner; it must still be rewritten, not carried out
 * already-good  — little should change
 * earlier-session — the request builds on an earlier refinement
 */
export type Trap =
  | 'details'
  | 'contradiction'
  | 'boosters'
  | 'cache-prefix'
  | 'grader-scale'
  | 'rule-interplay'
  | 'not-a-task'
  | 'already-good'
  | 'earlier-session';

/**
 * Who a check speaks for.
 *
 * keep    — the refinement lost nothing and added nothing the user did not ask for.
 *           The unchanged draft passes these by construction.
 * improve — the refinement fixed what was wrong with the draft. The unchanged
 *           draft fails every one of these; that is what makes them evidence of
 *           improvement rather than of fluent wording.
 * explain — the analysis and rationale tell the user what changed and why.
 * format  — the answer has the shape the app parses and shows.
 */
export type CheckRole = 'keep' | 'improve' | 'explain' | 'format';

interface Base {
  label: string;
}

export type Check =
  | (Base & { kind: 'keep'; role: 'keep'; text: string })
  | (Base & { kind: 'keepMatch'; role: 'keep'; pattern: RegExp })
  /** Must not appear; the draft does not contain it either. `example` matches the pattern (used to calibrate). */
  | (Base & { kind: 'avoid'; role: 'keep'; pattern: RegExp; example: string })
  | (Base & { kind: 'sameSentence'; role: 'keep'; patterns: RegExp[] })
  | (Base & { kind: 'maxChars'; role: 'keep'; max: number })
  | (Base & { kind: 'similar'; role: 'keep'; min: number })
  | (Base & { kind: 'lengthRatio'; role: 'keep'; max: number })
  /**
   * The user's input matches the pattern; the refined prompt must not. Usually
   * an improve check. It is a keep check when the prompt before this round
   * already lacks it (a note about an earlier session must not be pasted in).
   */
  | (Base & { kind: 'drop'; role: 'improve' | 'keep'; pattern: RegExp })
  /** At least `min` of the patterns match the refined prompt. */
  | (Base & { kind: 'add'; role: 'improve'; patterns: RegExp[]; min: number })
  /** Each pattern in `first` appears before the first match of `then`. */
  | (Base & { kind: 'order'; role: 'improve'; first: RegExp[]; then: RegExp })
  /**
   * Every sentence that matches `pattern` also matches `qualifier`; with
   * `required`, at least one sentence matches `pattern`.
   */
  | (Base & {
      kind: 'qualified';
      role: 'improve' | 'keep';
      pattern: RegExp;
      qualifier: RegExp;
      required: boolean;
    })
  | (Base & { kind: 'analysis'; role: 'explain'; pattern: RegExp })
  /** The rationale cites at least one of these rule ids. */
  | (Base & { kind: 'cites'; role: 'explain'; rules: string[] })
  // Checks every case gets; see globalChecks().
  | (Base & { kind: 'structure'; role: 'format' })
  | (Base & { kind: 'complete'; role: 'format' })
  | (Base & { kind: 'noLeakedTags'; role: 'format' })
  | (Base & { kind: 'rationaleBlock'; role: 'format' })
  | (Base & { kind: 'rationaleTarget'; role: 'format' })
  | (Base & { kind: 'knownRules'; role: 'format' })
  | (Base & { kind: 'analysisPresent'; role: 'explain' })
  | (Base & { kind: 'rationaleEntries'; role: 'explain' })
  | (Base & { kind: 'language'; role: 'keep' })
  | (Base & { kind: 'noNewLimits'; role: 'keep' });

export type CheckKind = Check['kind'];

/**
 * A refinement a person wrote by hand for this case, as a correct answer
 * would look. It is not model output. The eval uses it to show that every
 * check accepts a sound rewrite in other words than the draft, and as the
 * starting point for the broken variants that every check must reject.
 */
export interface ReferenceOutput {
  analysis: string;
  prompt: string;
  /** [rule id, what changed] */
  rationale: [string, string][];
}

/** A wrong refinement that reads well. Each listed check must fail on it. */
export interface Pitfall {
  name: string;
  prompt: string;
  /** Defaults to the reference analysis. */
  analysis?: string;
  /** Labels of the checks that must fail. */
  fails: string[];
}

export interface EvalCase {
  id: string;
  category: Category;
  /** What the case is about, in one line. */
  title: string;
  traps: Trap[];
  target: TargetModel;
  /** The language of the draft; the refined prompt must be in it too. */
  lang: 'zh' | 'en';
  /**
   * improve  — the draft has problems; every improve check fails on it.
   * preserve — the draft is fine as a prompt or is mainly a detail trap: the
   *            refinement must not make it worse.
   */
  expect: 'improve' | 'preserve';
  /** The draft exactly as a user would paste it. */
  draft: string;
  /** Earlier sessions the refinement builds on, oldest first. */
  references?: RefineReference[];
  checks: Check[];
  reference: ReferenceOutput;
  pitfalls?: Pitfall[];
}

/** What a check looks at: one refinement, as the app would show it. */
export interface Subject {
  format: 'tagged' | 'legacy' | 'plain';
  analysis: string;
  prompt: string;
  promptComplete: boolean;
  rationale: ParsedRationale;
}

export interface CheckResult {
  check: Check;
  pass: boolean;
  /** Why it failed. */
  reason?: string;
}
