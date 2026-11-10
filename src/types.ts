import type { ImageMediaType } from '../shared/protocol';

export interface AttachedImage {
  id: string;
  /** Full data URL, used for the thumbnail and as the source of the upload. */
  dataUrl: string;
  mediaType: ImageMediaType;
}

export type RefineStatus = 'idle' | 'generating' | 'complete' | 'stopped' | 'error';

export interface HistoryItem {
  id: string;
  originalPrompt: string;
  /** The model's raw answer; parseRefineOutput turns it into analysis + prompt. */
  refinedPrompt: string;
  timestamp: number;
  /** Which model produced it. Absent on items saved by the Gemini-era app. */
  model?: string;
}
