import type { EffortLevel, TargetModel } from './protocol';

/** Defaults shared by the server and the browser-only (GitHub Pages) build. */
export const DEFAULT_MODEL = 'claude-fable-5-2';
export const DEFAULT_EFFORT: EffortLevel = 'medium';
/** The model a refined prompt is written for when the request does not say. */
export const DEFAULT_TARGET: TargetModel = 'claude-fable-5-2';
/** Thinking tokens count toward this ceiling, so it is deliberately roomy. */
export const DEFAULT_MAX_TOKENS = 64_000;

const MODEL_LABELS: Record<string, string> = {
  'claude-fable-5-2': 'Claude Fable 5.2',
  'claude-fable-5-1': 'Claude Fable 5.1',
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-haiku-5-5': 'Claude Haiku 5.5',
};

export function modelLabel(model: string): string {
  return MODEL_LABELS[model] ?? model;
}
