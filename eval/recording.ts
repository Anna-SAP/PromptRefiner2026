import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EffortLevel, RefineErrorCode, TargetModel, Usage } from '../shared/protocol';
import type { TargetFingerprint } from './fingerprint';
import { redact } from './text';

export const RECORDING_FORMAT = 'prompt-refiner-eval/1';

/** One refinement of one case, as the API returned it. */
export interface RecordedRun {
  /** The model's raw answer: what the app would store in history. */
  output: string;
  truncated: boolean;
  /** The model that answered (differs from the requested one after a fallback). */
  model?: string;
  usage?: Usage;
  durationMs?: number;
  /** Set when the request failed; `output` then holds whatever arrived before. */
  error?: { code: RefineErrorCode; message: string };
}

/**
 * The refinements of one case and what produced them. Each case carries its
 * own settings and meta-prompt fingerprint, so cases re-run on their own
 * (`--only`) can be merged into a baseline recorded earlier.
 */
export interface RecordedCase {
  target: TargetModel;
  recordedAt: string;
  model: string;
  effort: EffortLevel;
  metaPrompt: TargetFingerprint;
  /** caseInputHash() when it was recorded. */
  inputHash: string;
  runs: RecordedRun[];
}

/**
 * Results of live runs. The raw answers are kept, not the verdicts, so a
 * later offline run judges them with the checks as they are then.
 */
export interface Recording {
  format: typeof RECORDING_FORMAT;
  updatedAt: string;
  cases: Record<string, RecordedCase>;
}

export function readRecording(path: string): Recording {
  const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<Recording>;
  if (data.format !== RECORDING_FORMAT || typeof data.cases !== 'object' || data.cases === null) {
    throw new Error(`${path} is not a ${RECORDING_FORMAT} recording`);
  }
  return data as Recording;
}

export function readRecordingIfPresent(path: string): Recording | undefined {
  return existsSync(path) ? readRecording(path) : undefined;
}

/** Writes a recording. Everything passes through redact() first, so no key can end up in the file. */
export function writeRecording(path: string, recording: Recording): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${redact(JSON.stringify(recording, null, 2))}\n`);
}

/** `update` with the cases of `base` it does not replace. */
export function mergeRecordings(base: Recording | undefined, update: Recording): Recording {
  return { format: RECORDING_FORMAT, updatedAt: update.updatedAt, cases: { ...base?.cases, ...update.cases } };
}
