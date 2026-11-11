/**
 * The wire contract between the browser and the Express server. Both sides
 * import from here, so a change to the protocol is a compile error on whichever
 * side was not updated.
 */

export const EFFORT_LEVELS = ['low', 'medium', 'high'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === 'string' && (EFFORT_LEVELS as readonly string[]).includes(value);
}

/**
 * The model the refined prompt is written for: the one the user will paste it
 * into. This is separate from the model that does the refining. `generic`
 * means no particular model, so only cross-model rules apply.
 */
export const TARGET_MODELS = [
  'claude-fable-5-2',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
  'generic',
] as const;
export type TargetModel = (typeof TARGET_MODELS)[number];

export function isTargetModel(value: unknown): value is TargetModel {
  return typeof value === 'string' && (TARGET_MODELS as readonly string[]).includes(value);
}

/** Image formats Claude's vision input accepts. */
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export type ImageMediaType = (typeof SUPPORTED_IMAGE_TYPES)[number];

export function isImageMediaType(value: unknown): value is ImageMediaType {
  return typeof value === 'string' && (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(value);
}

export const LIMITS = {
  /** Longest draft the server accepts, in characters. */
  maxInputChars: 100_000,
  maxImages: 10,
  /** Per-image ceiling the Claude API enforces. */
  maxImageBytes: 5 * 1024 * 1024,
  /** Keeps a full request comfortably under the API's 32 MB body limit. */
  maxTotalImageBytes: 20 * 1024 * 1024,
  /** The browser downscales anything larger than this on its longest edge. */
  maxImageEdge: 2000,
} as const;

export interface RefineImage {
  mediaType: ImageMediaType;
  /** Raw base64, without the `data:...;base64,` prefix. */
  data: string;
}

export interface RefineRequest {
  inputText: string;
  images: RefineImage[];
  effort?: EffortLevel;
  /** Absent means DEFAULT_TARGET. */
  targetModel?: TargetModel;
}

export type RefineErrorCode =
  | 'invalid_request'
  | 'auth'
  | 'permission'
  | 'model_not_found'
  | 'rate_limited'
  | 'overloaded'
  | 'refusal'
  | 'network'
  | 'incomplete'
  | 'server';

/** Events the server streams back over SSE, one JSON object per `data:` line. */
export type StreamEvent =
  /** A piece of Claude's summarized reasoning, shown while the answer forms. */
  | { type: 'thinking'; text: string }
  /** A piece of the answer itself. */
  | { type: 'text'; text: string }
  | {
      type: 'done';
      /** The model that actually produced the answer (differs after a fallback). */
      model: string;
      /** True when the answer hit the output-token ceiling and was cut short. */
      truncated: boolean;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { type: 'error'; code: RefineErrorCode; message: string };

export interface ApiErrorBody {
  error: { code: RefineErrorCode; message: string };
}

/** Returned by GET /api/config so the UI can label itself truthfully. */
export interface AppConfig {
  model: string;
  modelLabel: string;
  defaultEffort: EffortLevel;
}
