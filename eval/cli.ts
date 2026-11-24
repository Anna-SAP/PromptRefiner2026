/**
 * Runs the Prompt Refiner eval.
 *
 *   npm run eval                      offline: no key, no API calls
 *   npm run eval:live                 refine every case with the real model and judge the results
 *
 * See README.md › 评测 for what each mode checks. Options:
 *
 *   --only <names>      comma-separated case ids, categories, traps or targets
 *   --verbose, -v       list every check, and what the unchanged draft fails
 *   --json <path>       also write the report as JSON
 *   --recording <path>  offline: judge this recording instead of eval/baseline.json;
 *                       live: compare with it instead of eval/baseline.json
 *   --strict            offline: count results recorded before a meta-prompt change as failures
 *   --save-baseline     live: merge this run into eval/baseline.json
 *   --out <path>        live: write this run's results here instead of eval/results/
 *   --repeat <n>        live: refine each case n times (default 1)
 *   --concurrency <n>   live: requests in flight at once (default 4)
 *   --model <id>        refiner model (default: REFINER_MODEL, else the app default)
 *   --effort <level>    low | medium | high (default: REFINER_EFFORT, else the app default)
 *
 * Live mode reads ANTHROPIC_API_KEY from the environment or from .env, like
 * the server. The key is never printed or written: output and result files
 * pass through redact().
 */
import Anthropic from '@anthropic-ai/sdk';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_EFFORT, DEFAULT_MAX_TOKENS, DEFAULT_MODEL } from '../shared/defaults';
import { isEffortLevel } from '../shared/protocol';
import { runEval } from './run';
import { redact } from './text';

const EVAL_DIR = dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile();
} catch {
  // No .env file; the environment may still have the key.
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${name} must be a positive whole number.`);
  return parsed;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      live: { type: 'boolean', default: false },
      only: { type: 'string', multiple: true, default: [] },
      verbose: { type: 'boolean', short: 'v', default: false },
      json: { type: 'string' },
      recording: { type: 'string' },
      strict: { type: 'boolean', default: false },
      'save-baseline': { type: 'boolean', default: false },
      out: { type: 'string' },
      repeat: { type: 'string' },
      concurrency: { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log('Usage: npm run eval [-- options]   |   npm run eval:live [-- options]\nSee the header of eval/cli.ts or README.md › 评测.');
    return 0;
  }

  const effort = (values.effort ?? process.env.REFINER_EFFORT ?? DEFAULT_EFFORT).trim().toLowerCase();
  if (!isEffortLevel(effort)) throw new Error('--effort must be low, medium or high.');
  const model = (values.model ?? process.env.REFINER_MODEL ?? DEFAULT_MODEL).trim();

  if (values.live && !process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error(
      'Live mode calls the Anthropic API and needs ANTHROPIC_API_KEY, in the environment or in .env (see .env.example).\n' +
        'The offline eval needs no key: npm run eval',
    );
    return 2;
  }

  const result = await runEval(
    {
      live: values.live,
      only: values.only.flatMap((value) => value.split(',')).map((name) => name.trim()).filter(Boolean),
      ...(values.recording ? { recordingPath: resolve(values.recording) } : {}),
      ...(values.out ? { outPath: resolve(values.out) } : {}),
      saveBaseline: values['save-baseline'],
      repeat: positiveInt(values.repeat, 1, 'repeat'),
      concurrency: positiveInt(values.concurrency, 4, 'concurrency'),
      model,
      effort,
      maxTokens: DEFAULT_MAX_TOKENS,
      useFallbacks: process.env.REFINER_FALLBACKS?.trim().toLowerCase() !== 'off',
      strict: values.strict,
      verbose: values.verbose,
      ...(values.json ? { jsonPath: resolve(values.json) } : {}),
    },
    {
      baselinePath: join(EVAL_DIR, 'baseline.json'),
      resultsDir: join(EVAL_DIR, 'results'),
      // The SDK reads ANTHROPIC_API_KEY itself; the eval never handles the value.
      createClient: () => new Anthropic({ maxRetries: 4 }),
      progress: (line) => console.error(redact(line)),
    },
  );
  console.log(result.text);
  return result.exitCode;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(redact(error instanceof Error ? error.message : String(error)));
    process.exitCode = 2;
  },
);
