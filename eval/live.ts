import type Anthropic from '@anthropic-ai/sdk';
import { isUserAbort, mapAnthropicError } from '../shared/errors';
import type { EffortLevel } from '../shared/protocol';
import { runRefinement } from '../shared/refine';
import { caseRequest } from './contract';
import type { RecordedRun } from './recording';
import { redact } from './text';
import type { EvalCase } from './types';

export interface LiveSettings {
  model: string;
  effort: EffortLevel;
  maxTokens: number;
  useFallbacks: boolean;
}

/**
 * Refines one case through shared/refine.ts, the same function the server
 * and the browser build call, so the eval sends exactly the request the app
 * sends. Failures are recorded on the run instead of thrown.
 */
export async function refineCase(
  client: Anthropic,
  evalCase: EvalCase,
  settings: LiveSettings,
  signal?: AbortSignal,
): Promise<RecordedRun> {
  const started = Date.now();
  const run: RecordedRun = { output: '', truncated: false };
  try {
    await runRefinement(
      client,
      caseRequest(evalCase, settings.effort),
      { ...settings, ...(signal ? { signal } : {}) },
      (event) => {
        if (event.type === 'text') run.output += event.text;
        else if (event.type === 'done') {
          run.truncated = event.truncated;
          run.model = event.model;
          run.usage = event.usage;
        } else if (event.type === 'error') run.error = { code: event.code, message: event.message };
      },
    );
  } catch (error) {
    if (isUserAbort(error)) throw error;
    const mapped = mapAnthropicError(error, settings.model, 'server');
    const detail = error instanceof Error && error.message && !mapped.message.includes(error.message) ? ` (${error.message})` : '';
    run.error = { code: mapped.code, message: redact(`${mapped.message}${detail}`) };
  }
  run.durationMs = Date.now() - started;
  return run;
}

export interface RunOptions {
  /** Requests in flight at once. */
  concurrency: number;
  /** Refinements per case. More than one shows how stable a result is. */
  repeat: number;
  signal?: AbortSignal;
  /** Called as each refinement finishes. */
  onRun?: (evalCase: EvalCase, run: RecordedRun, index: number) => void;
}

/** Refines every case `repeat` times, at most `concurrency` at once. */
export async function refineCases(
  client: Anthropic,
  cases: readonly EvalCase[],
  settings: LiveSettings,
  options: RunOptions,
): Promise<Map<string, RecordedRun[]>> {
  const jobs = cases.flatMap((evalCase) => Array.from({ length: options.repeat }, (_, index) => ({ evalCase, index })));
  // One slot per repetition, so runs keep their order whichever finishes first.
  const slots = new Map(cases.map((evalCase) => [evalCase.id, new Array<RecordedRun | undefined>(options.repeat)]));
  let next = 0;
  const worker = async () => {
    while (next < jobs.length && !options.signal?.aborted) {
      const job = jobs[next++];
      if (!job) break;
      const run = await refineCase(client, job.evalCase, settings, options.signal);
      const caseSlots = slots.get(job.evalCase.id);
      if (caseSlots) caseSlots[job.index] = run;
      options.onRun?.(job.evalCase, run, job.index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency, jobs.length)) }, worker));
  return new Map(
    [...slots].map(([id, caseSlots]) => [id, caseSlots.filter((run): run is RecordedRun => run !== undefined)]),
  );
}
