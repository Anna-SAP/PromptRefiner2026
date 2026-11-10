import { DEFAULT_EFFORT, DEFAULT_MAX_TOKENS, DEFAULT_MODEL, modelLabel } from '../shared/defaults';
import { type EffortLevel, isEffortLevel } from '../shared/protocol';

// Load .env when present. Real environment variables win, and a missing file is
// fine: in production the key normally comes from the host's secret store.
try {
  process.loadEnvFile();
} catch {
  // No .env file.
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const isProduction = process.env.NODE_ENV === 'production';
// Settings use a REFINER_ prefix rather than CLAUDE_: Claude Code exports
// variables such as CLAUDE_EFFORT into every terminal it opens, and this app
// must not pick those up by accident.
const model = process.env.REFINER_MODEL?.trim() || DEFAULT_MODEL;
const envEffort = process.env.REFINER_EFFORT?.trim().toLowerCase();
// "medium" suits an interactive tool: quick enough to watch, and the UI lets
// the user ask for deeper thinking per request.
const defaultEffort: EffortLevel = isEffortLevel(envEffort) ? envEffort : DEFAULT_EFFORT;

export const config = {
  isProduction,
  port: positiveInt(process.env.PORT, 3000),
  // Loopback by default so a dev machine does not expose a key-backed endpoint
  // to the local network; containers set HOST=0.0.0.0.
  host: process.env.HOST?.trim() || (isProduction ? '0.0.0.0' : '127.0.0.1'),
  model,
  modelLabel: modelLabel(model),
  defaultEffort,
  maxTokens: positiveInt(process.env.REFINER_MAX_TOKENS, DEFAULT_MAX_TOKENS),
  useFallbacks: process.env.REFINER_FALLBACKS?.trim().toLowerCase() !== 'off',
} as const;
