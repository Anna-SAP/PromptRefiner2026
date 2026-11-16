import { parseRefineOutput } from './parseOutput';
import { splitRationale } from './parseRationale';
import type { RefineReference } from './protocol';

/** The part of a saved session a reference is made from. */
export interface SavedSession {
  /** The draft as the user typed it. */
  originalPrompt: string;
  /** The model's raw answer, as history stores it. */
  refinedPrompt: string;
}

/**
 * Turns a saved session into what a later refinement gets to build on: the
 * draft, the analysis and the refined prompt, without tags or rationale.
 *
 * An answer in a layout the parser does not know (very old history, or a
 * reply that ignored the format) has no separate prompt section. The whole
 * answer is that session's result then, so it is passed on as the prompt.
 */
export function toReference(session: SavedSession): RefineReference {
  const { main } = splitRationale(session.refinedPrompt);
  const parsed = parseRefineOutput(main);
  const originalPrompt = session.originalPrompt.trim();
  return parsed.prompt
    ? { originalPrompt, analysis: parsed.analysis, refinedPrompt: parsed.prompt }
    : { originalPrompt, analysis: '', refinedPrompt: main.trim() };
}

/** Characters a reference adds to the request; what LIMITS.maxReferenceChars counts. */
export function referenceLength(reference: RefineReference): number {
  return reference.originalPrompt.length + reference.analysis.length + reference.refinedPrompt.length;
}
