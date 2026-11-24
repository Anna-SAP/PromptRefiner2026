import type Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { EffortLevel } from '../shared/protocol';
import { CASES, selectCases } from './cases/index';
import type { MetaPromptSource } from './contract';
import { caseInputHash, targetFingerprint } from './fingerprint';
import { type CaseReport, type CurrentSettings, RELIES_ON, buildCaseReport, judgeRecording, judgeRun } from './judge';
import { type LiveSettings, refineCases } from './live';
import {
  RECORDING_FORMAT,
  type Recording,
  mergeRecordings,
  readRecording,
  readRecordingIfPresent,
  writeRecording,
} from './recording';
import { type ReportHeader, formatReport, reportJson } from './report';
import { redact } from './text';
import type { EvalCase } from './types';

export interface EvalOptions {
  live: boolean;
  /** Case ids, categories, traps or targets; empty means every case. */
  only: string[];
  /** Offline: the recording to judge. Live: the baseline to compare with. Defaults to the baseline path. */
  recordingPath?: string;
  /** Live: where to write this run's results. Defaults to a timestamped file in the results folder. */
  outPath?: string;
  /** Live: also merge this run into the baseline recording. */
  saveBaseline: boolean;
  repeat: number;
  concurrency: number;
  model: string;
  effort: EffortLevel;
  maxTokens: number;
  useFallbacks: boolean;
  /** Offline: count stale recorded results as failures. */
  strict: boolean;
  verbose: boolean;
  jsonPath?: string;
}

export interface EvalEnvironment {
  /** The committed baseline recording. */
  baselinePath: string;
  /** Where live runs write their results (not committed). */
  resultsDir: string;
  /** Live runs only. */
  createClient?: () => Anthropic;
  /** Progress lines for live runs. */
  progress?: (line: string) => void;
  now?: () => Date;
  cases?: readonly EvalCase[];
  /** Stand-ins for prompt.ts and rules.ts, for tests. */
  metaPrompt?: MetaPromptSource;
  fingerprint?: CurrentSettings['fingerprint'];
}

export interface EvalResult {
  exitCode: number;
  /** The report, ready to print. */
  text: string;
  reports: CaseReport[];
  /** Live runs: what was recorded. */
  recording?: Recording;
  writtenTo?: string[];
}

const display = (path: string) => relative(process.cwd(), path) || path;

function usageError(text: string): EvalResult {
  return { exitCode: 2, text, reports: [] };
}

export async function runEval(options: EvalOptions, env: EvalEnvironment): Promise<EvalResult> {
  const { selected, unknown } = selectCases(options.only, env.cases ?? CASES);
  if (unknown.length > 0) {
    return usageError(`No case, category, trap or target is called ${unknown.map((name) => `"${name}"`).join(', ')}.`);
  }
  const current: CurrentSettings = {
    model: options.model,
    effort: options.effort,
    ...(env.fingerprint ? { fingerprint: env.fingerprint } : {}),
  };
  const recordingPath = options.recordingPath ?? env.baselinePath;
  let recording: Recording | undefined;
  try {
    recording = options.recordingPath ? readRecording(recordingPath) : readRecordingIfPresent(recordingPath);
  } catch (error) {
    return usageError(`Could not read ${display(recordingPath)}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let reports: CaseReport[];
  let header: ReportHeader;
  let newRecording: Recording | undefined;
  const writtenTo: string[] = [];

  if (!options.live) {
    reports = selected.map((evalCase) => {
      const output = recording ? judgeRecording(recording, evalCase, current) : undefined;
      return buildCaseReport(evalCase, { ...(output ? { output } : {}), ...(env.metaPrompt ? { metaPrompt: env.metaPrompt } : {}) });
    });
    header = {
      mode: 'offline',
      source: recording
        ? [`Refiner output: replaying ${display(recordingPath)} (updated ${recording.updatedAt}), judged with the current checks.`]
        : [
            `Refiner output: no recording at ${display(recordingPath)}, so only the checks that need no model ran:`,
            '  contract    — prompt.ts and rules.ts still give each case what it relies on',
            '  calibration — each case\'s checks pass a correct rewrite and catch broken ones',
            'To judge real refinements: npm run eval:live (needs ANTHROPIC_API_KEY; one paid request per case).',
          ],
    };
  } else {
    if (!env.createClient) return usageError('Live mode needs an Anthropic client.');
    const client = env.createClient();
    const settings: LiveSettings = {
      model: options.model,
      effort: options.effort,
      maxTokens: options.maxTokens,
      useFallbacks: options.useFallbacks,
    };
    const total = selected.length * options.repeat;
    env.progress?.(`Refining ${selected.length} case(s) × ${options.repeat} with ${options.model} at effort ${options.effort}: ${total} request(s) to the Anthropic API.`);
    let done = 0;
    const runs = await refineCases(client, selected, settings, {
      concurrency: options.concurrency,
      repeat: options.repeat,
      onRun: (evalCase, run) => {
        done++;
        const verdict = judgeRun(evalCase, run);
        const seconds = ((run.durationMs ?? 0) / 1000).toFixed(1);
        const outcome = verdict.error ? `request failed (${redact(verdict.error)})` : verdict.pass ? 'pass' : 'fail';
        env.progress?.(`[${done}/${total}] ${evalCase.id}: ${outcome} in ${seconds}s`);
      },
    });

    const recordedAt = (env.now?.() ?? new Date()).toISOString();
    newRecording = {
      format: RECORDING_FORMAT,
      updatedAt: recordedAt,
      cases: Object.fromEntries(
        selected.map((evalCase) => [
          evalCase.id,
          {
            target: evalCase.target,
            recordedAt,
            model: options.model,
            effort: options.effort,
            metaPrompt: (env.fingerprint ?? targetFingerprint)(evalCase.target),
            inputHash: caseInputHash(evalCase),
            runs: runs.get(evalCase.id) ?? [],
          },
        ]),
      ),
    };
    const outPath = options.outPath ?? join(env.resultsDir, `${recordedAt.replace(/[:.]/g, '-')}.json`);
    writeRecording(outPath, newRecording);
    writtenTo.push(outPath);
    if (options.saveBaseline) {
      writeRecording(env.baselinePath, mergeRecordings(readRecordingIfPresent(env.baselinePath), newRecording));
      writtenTo.push(env.baselinePath);
    }

    reports = selected.map((evalCase) => {
      const verdicts = (runs.get(evalCase.id) ?? []).map((run) => judgeRun(evalCase, run));
      const baseline = recording ? judgeRecording(recording, evalCase, current) : undefined;
      return buildCaseReport(evalCase, {
        output: { verdicts, stale: [] },
        compare: true,
        ...(baseline ? { baseline } : {}),
        ...(env.metaPrompt ? { metaPrompt: env.metaPrompt } : {}),
      });
    });
    header = {
      mode: 'live',
      source: [
        `Refiner output: ${total} new refinement(s) by ${options.model} at effort ${options.effort}.`,
        recording
          ? `Compared with ${display(recordingPath)} (updated ${recording.updatedAt}), judged with the same checks.`
          : `No baseline at ${display(recordingPath)} to compare with; save one with --save-baseline.`,
      ],
    };
  }

  const failing = reports.filter((report) => report.status === 'fail' || (options.strict && report.status === 'stale'));
  let text = formatReport(header, reports, { verbose: options.verbose });

  const staleReports = reports.filter((report) => report.status === 'stale');
  if (staleReports.length > 0) {
    const stale = staleReports.map((report) => report.evalCase.id);
    const direct = staleReports
      .filter((report) => report.output?.stale.some((reason) => reason.startsWith(RELIES_ON)))
      .map((report) => report.evalCase.id);
    const rerun = stale.length === reports.length ? 'npm run eval:live' : `npm run eval:live -- --only ${stale.join(',')}`;
    text += `\n\nStale results were recorded before the change listed under each case, so they say nothing about the current prompt.ts / rules.ts. Re-check them with:\n  ${rerun}`;
    if (direct.length > 0 && direct.length < stale.length) {
      text += `\nThe cases that test a changed rule directly, to re-check first:\n  npm run eval:live -- --only ${direct.join(',')}`;
    }
  }
  const regressions = reports.filter((report) => report.change === 'regression');
  if (regressions.length > 0) {
    text += `\n\nRegressions — these passed in the baseline and fail now: ${regressions.map((report) => report.evalCase.id).join(', ')}`;
  }
  if (writtenTo.length > 0) {
    text += `\n\nResults written to ${writtenTo.map(display).join(' and ')}.`;
    if (!options.saveBaseline) text += ' Keep this run as the baseline with --save-baseline.';
  }
  if (options.jsonPath) {
    mkdirSync(dirname(options.jsonPath), { recursive: true });
    writeFileSync(options.jsonPath, `${redact(JSON.stringify(reportJson(header, reports), null, 2))}\n`);
    text += `\nJSON report written to ${display(options.jsonPath)}.`;
  }

  return {
    exitCode: failing.length > 0 ? 1 : 0,
    text: redact(text),
    reports,
    ...(newRecording ? { recording: newRecording } : {}),
    ...(writtenTo.length ? { writtenTo } : {}),
  };
}

