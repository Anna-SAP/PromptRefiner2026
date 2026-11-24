import { type CaseCalibration, calibrateCase } from './calibrate';
import { allChecks, caseContext, evaluate } from './checks';
import { type MetaPromptSource, CURRENT_META_PROMPT, checkContract } from './contract';
import { type TargetFingerprint, caseInputHash, metaPromptChanges, targetFingerprint } from './fingerprint';
import { parseAnswer } from './output';
import type { RecordedCase, RecordedRun, Recording } from './recording';
import type { CheckResult, CheckRole, EvalCase } from './types';

/** The verdict on one refinement. */
export interface RunVerdict {
  pass: boolean;
  results: CheckResult[];
  /** The request failed; no checks were run. */
  error?: string;
  truncated: boolean;
}

export function judgeRun(evalCase: EvalCase, run: RecordedRun): RunVerdict {
  if (run.error) {
    return { pass: false, results: [], error: `${run.error.code}: ${run.error.message}`, truncated: run.truncated };
  }
  const results = evaluate(allChecks(evalCase), parseAnswer(run.output), caseContext(evalCase));
  return { pass: !run.truncated && results.every((result) => result.pass), results, truncated: run.truncated };
}

/** Results of a set of runs of one case. */
export interface OutputVerdict {
  verdicts: RunVerdict[];
  /** Why the runs no longer reflect the current meta-prompt or case; empty when they do. */
  stale: string[];
}

export function outputPasses(output: OutputVerdict): boolean {
  return output.verdicts.length > 0 && output.verdicts.every((verdict) => verdict.pass);
}

export type CaseStatus = 'pass' | 'fail' | 'stale' | 'not-run';
/** How a live result compares with the baseline recording. */
export type CaseChange = 'regression' | 'fixed' | 'same' | 'new';

export interface CaseReport {
  evalCase: EvalCase;
  /** Problems with what prompt.ts and rules.ts give this case (see contract.ts). */
  contract: string[];
  calibration: CaseCalibration;
  /** The refinements judged in this run: live ones, or a replayed recording. */
  output?: OutputVerdict;
  /** In a live run, the baseline recording judged with today's checks. */
  baseline?: OutputVerdict;
  status: CaseStatus;
  change?: CaseChange;
}

/** What a refinement would be produced with today. */
export interface CurrentSettings {
  model: string;
  effort: string;
  /** Defaults to the meta-prompt built from today's prompt.ts and rules.ts. */
  fingerprint?: (target: EvalCase['target']) => TargetFingerprint;
}

/** Why a recorded case no longer reflects what would be sent today. Empty when it still does. */
export function staleness(recorded: RecordedCase, evalCase: EvalCase, current: CurrentSettings): string[] {
  const reasons: string[] = [];
  if (recorded.model !== current.model) reasons.push(`recorded with ${recorded.model}, the refiner is now ${current.model}`);
  if (recorded.effort !== current.effort) reasons.push(`recorded at effort ${recorded.effort}, now ${current.effort}`);
  if (recorded.target !== evalCase.target) reasons.push(`recorded for ${recorded.target}, the case now targets ${evalCase.target}`);
  const fingerprint = (current.fingerprint ?? targetFingerprint)(evalCase.target);
  reasons.push(...metaPromptChanges(recorded.metaPrompt, fingerprint, evalCase.target));
  // Every target shares some rules, so one edited rule makes every recording
  // stale. Say which cases test that rule directly: re-run those first.
  const changedRules = Object.keys(recorded.metaPrompt.rules).filter(
    (id) => recorded.metaPrompt.rules[id] !== fingerprint.rules[id],
  );
  const relied = evalCase.checks.flatMap((check) =>
    check.kind === 'cites' ? check.rules.filter((id) => changedRules.includes(id)) : [],
  );
  if (relied.length > 0) reasons.push(`${RELIES_ON} ${[...new Set(relied)].join(', ')}`);
  if (recorded.inputHash !== caseInputHash(evalCase)) reasons.push('the case draft, or how it is sent, changed');
  return reasons;
}

/** Starts the stale reason that names a changed rule the case tests directly. */
export const RELIES_ON = 'this case tests the changed rule';

export function judgeRecording(recording: Recording, evalCase: EvalCase, current: CurrentSettings): OutputVerdict | undefined {
  const recorded = recording.cases[evalCase.id];
  if (!recorded || recorded.runs.length === 0) return undefined;
  return {
    verdicts: recorded.runs.map((run) => judgeRun(evalCase, run)),
    stale: staleness(recorded, evalCase, current),
  };
}

export function buildCaseReport(
  evalCase: EvalCase,
  {
    output,
    baseline,
    compare = false,
    metaPrompt = CURRENT_META_PROMPT,
  }: {
    output?: OutputVerdict;
    baseline?: OutputVerdict;
    /** A live run: say how the output compares with the baseline (or that there is none). */
    compare?: boolean;
    metaPrompt?: MetaPromptSource;
  } = {},
): CaseReport {
  const contract = checkContract(evalCase, metaPrompt);
  const calibration = calibrateCase(evalCase);
  let status: CaseStatus;
  if (contract.length > 0 || calibration.problems.length > 0) status = 'fail';
  else if (!output) status = 'not-run';
  else if (output.stale.length > 0) status = 'stale';
  else status = outputPasses(output) ? 'pass' : 'fail';

  let change: CaseChange | undefined;
  if (compare && output) {
    if (baseline === undefined) change = 'new';
    else {
      const before = outputPasses(baseline);
      const now = outputPasses(output);
      change = before === now ? 'same' : now ? 'fixed' : 'regression';
    }
  }
  return {
    evalCase,
    contract,
    calibration,
    ...(output ? { output } : {}),
    ...(baseline ? { baseline } : {}),
    status,
    ...(change ? { change } : {}),
  };
}

/** Passed / total checks per role, over one run. */
export function roleTally(verdict: RunVerdict): Record<CheckRole, [number, number]> {
  const tally: Record<CheckRole, [number, number]> = { improve: [0, 0], keep: [0, 0], explain: [0, 0], format: [0, 0] };
  for (const result of verdict.results) {
    const entry = tally[result.check.role];
    entry[1]++;
    if (result.pass) entry[0]++;
  }
  return tally;
}

/** Each failed check across the runs, with how many runs it failed in. */
export function failureSummary(output: OutputVerdict): { role: CheckRole | 'request'; label: string; reason: string; runs: number }[] {
  const byLabel = new Map<string, { role: CheckRole | 'request'; label: string; reason: string; runs: number }>();
  for (const verdict of output.verdicts) {
    if (verdict.error) {
      const entry = byLabel.get('request') ?? { role: 'request', label: 'request failed', reason: verdict.error, runs: 0 };
      entry.runs++;
      byLabel.set('request', entry);
      continue;
    }
    for (const result of verdict.results) {
      if (result.pass) continue;
      const key = result.check.label;
      const entry = byLabel.get(key) ?? { role: result.check.role, label: key, reason: result.reason ?? '', runs: 0 };
      entry.runs++;
      byLabel.set(key, entry);
    }
    if (verdict.truncated) {
      const entry = byLabel.get('truncated') ?? { role: 'format', label: 'answer was cut off at max_tokens', reason: '', runs: 0 };
      entry.runs++;
      byLabel.set('truncated', entry);
    }
  }
  return [...byLabel.values()];
}
