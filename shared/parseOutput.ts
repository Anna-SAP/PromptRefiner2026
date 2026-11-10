/**
 * Turns the model's raw answer into the two parts the UI renders: a short
 * analysis and the refined prompt.
 *
 * The answer arrives as a stream, so this runs on every partial string and has
 * to cope with half-written tags. It also understands the Markdown layout the
 * Gemini-era app produced ("**Analysis:** ... ```prompt```"), so history saved
 * by the previous version still renders properly.
 */

const ANALYSIS_OPEN = '<analysis>';
const ANALYSIS_CLOSE = '</analysis>';
const PROMPT_OPEN = '<refined_prompt>';
const PROMPT_CLOSE = '</refined_prompt>';
const ALL_TAGS = [ANALYSIS_OPEN, ANALYSIS_CLOSE, PROMPT_OPEN, PROMPT_CLOSE];
const FENCE = '```';

export interface ParsedOutput {
  /**
   * tagged — the current `<analysis>` / `<refined_prompt>` contract.
   * legacy — Markdown with a fenced code block, from the previous app version.
   * plain  — neither; shown as-is.
   */
  format: 'tagged' | 'legacy' | 'plain';
  analysis: string;
  prompt: string;
  /** The prompt section has begun, even if no characters have arrived yet. */
  promptStarted: boolean;
  /** The prompt section has been closed. */
  promptComplete: boolean;
}

/** Removes a trailing fragment such as `</refined_pro` left by a mid-tag chunk boundary. */
function stripPartialTag(text: string): string {
  const start = text.lastIndexOf('<');
  if (start === -1) return text;
  const tail = text.slice(start);
  const isPartial = ALL_TAGS.some((tag) => tag.length > tail.length && tag.startsWith(tail));
  return isPartial ? text.slice(0, start) : text;
}

/** The model is asked not to fence the prompt; if it does anyway, unwrap it. */
function unwrapSingleFence(text: string): string {
  if (!text.startsWith(FENCE) || !text.endsWith(FENCE)) return text;
  if (text.split(FENCE).length !== 3) return text;
  const firstNewline = text.indexOf('\n');
  if (firstNewline === -1) return text;
  return text.slice(firstNewline + 1, text.length - FENCE.length).trim();
}

function parseTagged(raw: string, analysisOpen: number, promptOpen: number): ParsedOutput {
  let analysis: string;
  if (analysisOpen === -1) {
    analysis = raw.slice(0, promptOpen);
  } else {
    const from = analysisOpen + ANALYSIS_OPEN.length;
    const close = raw.indexOf(ANALYSIS_CLOSE, from);
    const until = close !== -1 ? close : promptOpen > from ? promptOpen : raw.length;
    analysis = raw.slice(from, until);
  }

  let prompt = '';
  let promptComplete = false;
  if (promptOpen !== -1) {
    const from = promptOpen + PROMPT_OPEN.length;
    // lastIndexOf, so a prompt that happens to mention the tag is not cut short.
    const close = raw.lastIndexOf(PROMPT_CLOSE);
    promptComplete = close >= from;
    prompt = promptComplete ? raw.slice(from, close) : stripPartialTag(raw.slice(from));
    prompt = prompt.trim();
    if (promptComplete) prompt = unwrapSingleFence(prompt);
  }

  return {
    format: 'tagged',
    analysis: stripPartialTag(analysis).trim(),
    prompt,
    promptStarted: promptOpen !== -1,
    promptComplete,
  };
}

/** Bold section labels such as `**Analysis:**` or `**Refined Prompt**:`. */
const LEGACY_LABEL = /\*\*[^*\n]{1,40}(?:[:：]\*\*|\*\*[:：])[ \t]*/g;

function parseLegacy(raw: string, fenceOpen: number): ParsedOutput {
  const afterOpen = raw.indexOf('\n', fenceOpen);
  const bodyStart = afterOpen === -1 ? raw.length : afterOpen + 1;
  const fenceClose = raw.lastIndexOf(FENCE);
  const promptComplete = fenceClose >= bodyStart;
  return {
    format: 'legacy',
    analysis: raw.slice(0, fenceOpen).replace(LEGACY_LABEL, '').trim(),
    prompt: raw.slice(bodyStart, promptComplete ? fenceClose : raw.length).trim(),
    promptStarted: true,
    promptComplete,
  };
}

export function parseRefineOutput(raw: string): ParsedOutput {
  const analysisOpen = raw.indexOf(ANALYSIS_OPEN);
  const promptOpen = raw.indexOf(PROMPT_OPEN);
  if (analysisOpen !== -1 || promptOpen !== -1) {
    return parseTagged(raw, analysisOpen, promptOpen);
  }

  const fenceOpen = raw.indexOf(FENCE);
  if (fenceOpen !== -1) {
    return parseLegacy(raw, fenceOpen);
  }

  return {
    format: 'plain',
    analysis: stripPartialTag(raw).trim(),
    prompt: '',
    promptStarted: false,
    promptComplete: false,
  };
}

/** Plain-text rendering used by "Copy Full Text". */
export function formatForCopy(raw: string): string {
  const parsed = parseRefineOutput(raw);
  if (parsed.format === 'plain' || !parsed.prompt) return raw.trim();
  if (!parsed.analysis) return parsed.prompt;
  return `Analysis:\n${parsed.analysis}\n\nRefined Prompt:\n${parsed.prompt}`;
}
