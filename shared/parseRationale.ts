/**
 * Reads the `<rationale>` block: the list of changes the model made and the
 * rule each one rests on. The block follows `</refined_prompt>` in the model's
 * answer and is shown in the UI only.
 *
 * This file is deliberately separate from parseOutput.ts. The rationale is cut
 * off the end of the answer first (splitRationale), and what is left goes to
 * parseRefineOutput unchanged. That parser therefore sees exactly what it saw
 * before the rationale existed, and no rationale text can end up in the
 * analysis or in the prompt the user copies.
 */

const RATIONALE_OPEN = '<rationale';
const RATIONALE_CLOSE = '</rationale>';
/** Where the answer proper ends and the rationale begins. */
const BOUNDARY = /<\/refined_prompt>\s*<rationale(?=[\s>])/g;

export interface RationaleEntry {
  /** The rule id the model cited; empty when it gave none. */
  rule: string;
  /** What changed, in the model's words. */
  change: string;
}

export interface ParsedRationale {
  /** The block has begun, even if no entry has arrived yet. */
  started: boolean;
  /** The closing tag has arrived. */
  complete: boolean;
  /** The `target` attribute of the opening tag: the model the prompt was written for. */
  target: string | null;
  entries: RationaleEntry[];
}

export interface SplitOutput {
  /** The answer without the rationale block. This is what parseRefineOutput receives. */
  main: string;
  rationale: ParsedRationale;
}

const NO_RATIONALE: ParsedRationale = { started: false, complete: false, target: null, entries: [] };

/**
 * Index of the `<rationale` that opens the block, or -1.
 *
 * Only a `<rationale` that directly follows `</refined_prompt>` counts, so a
 * prompt that merely mentions the tag is left alone. The last such place wins:
 * a refined prompt may itself quote this output format, and the real block is
 * always the final one.
 */
function findRationaleStart(raw: string): number {
  let start = -1;
  for (const match of raw.matchAll(BOUNDARY)) {
    start = match.index + match[0].length - RATIONALE_OPEN.length;
  }
  return start;
}

function attribute(tagAttributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(tagAttributes);
  return match?.[1]?.trim() ?? null;
}

/** Removes a tag that a chunk boundary cut in half, such as `</chan`. */
function stripPartialTag(text: string): string {
  const start = text.lastIndexOf('<');
  return start !== -1 && !text.includes('>', start) ? text.slice(0, start) : text;
}

const CHANGE = /<change\b([^>]*)>([\s\S]*?)(?:<\/change>|$)/g;

function parseEntries(body: string): RationaleEntry[] {
  const entries: RationaleEntry[] = [];
  for (const match of body.matchAll(CHANGE)) {
    const [, attributes = '', text = ''] = match;
    const change = stripPartialTag(text).trim();
    if (change) entries.push({ rule: attribute(attributes, 'rule') ?? '', change });
  }
  if (entries.length > 0) return entries;
  // The model was asked for <change> items. If it wrote plain text instead,
  // show the text rather than dropping it; it has no rule and so no source.
  const text = body.includes('<change') ? '' : stripPartialTag(body).trim();
  return text ? [{ rule: '', change: text }] : [];
}

function parseBlock(block: string): ParsedRationale {
  const openEnd = block.indexOf('>');
  // The opening tag itself is still arriving.
  if (openEnd === -1) return { ...NO_RATIONALE, started: true };

  const target = attribute(block.slice(RATIONALE_OPEN.length, openEnd), 'target');
  const close = block.indexOf(RATIONALE_CLOSE, openEnd);
  const body = block.slice(openEnd + 1, close === -1 ? block.length : close);
  return { started: true, complete: close !== -1, target, entries: parseEntries(body) };
}

/**
 * Separates the rationale block from the rest of the answer. Works on partial
 * strings, so it can run on every chunk of the stream.
 */
export function splitRationale(raw: string): SplitOutput {
  const start = findRationaleStart(raw);
  if (start === -1) return { main: raw, rationale: NO_RATIONALE };
  return { main: raw.slice(0, start), rationale: parseBlock(raw.slice(start)) };
}
