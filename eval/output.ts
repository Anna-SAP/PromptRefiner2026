import { parseRefineOutput } from '../shared/parseOutput';
import { splitRationale } from '../shared/parseRationale';
import type { EvalCase, ReferenceOutput, Subject } from './types';

/**
 * Reads a raw answer the way the app does: the rationale is cut off the end
 * first, and the rest goes to the same parser the UI uses. The eval therefore
 * judges exactly what a user would see and copy.
 */
export function parseAnswer(raw: string): Subject {
  const { main, rationale } = splitRationale(raw);
  const parsed = parseRefineOutput(main);
  return {
    format: parsed.format,
    analysis: parsed.analysis,
    prompt: parsed.prompt,
    promptComplete: parsed.promptComplete,
    rationale,
  };
}

function escapeAttribute(value: string): string {
  return value.replace(/"/g, '&quot;');
}

/** Writes a reference output in the format the meta-prompt asks the model for. */
export function renderAnswer(target: string, output: ReferenceOutput): string {
  const changes = output.rationale
    .map(([rule, change]) => `<change rule="${escapeAttribute(rule)}">${change}</change>`)
    .join('\n');
  return [
    '<analysis>',
    output.analysis,
    '</analysis>',
    '<refined_prompt>',
    output.prompt,
    '</refined_prompt>',
    `<rationale target="${target}">`,
    ...(changes ? [changes] : []),
    '</rationale>',
  ].join('\n');
}

export function referenceAnswer(evalCase: EvalCase): string {
  return renderAnswer(evalCase.target, evalCase.reference);
}
