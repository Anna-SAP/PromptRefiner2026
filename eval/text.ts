/**
 * Text helpers for the eval checks. Everything a check matches against goes
 * through `normalize` first, so a check is not fooled by typography that does
 * not change the meaning of a prompt:
 *
 * - NFKC folds full-width punctuation and symbols into their ASCII forms
 *   ("，" → ",", "？" → "?", "！" → "!", "￥" → "¥");
 * - spaces next to a Chinese character are removed, so "12 月 5 日" and
 *   "12月5日" are the same detail;
 * - runs of spaces and tabs become one space.
 *
 * Patterns written for checks therefore see half-width punctuation and no
 * spaces around Chinese characters.
 */

const CJK = '\\p{Script=Han}\\u3000-\\u303f';
const SPACE_NEAR_CJK = new RegExp(`(?<=[${CJK}]) +| +(?=[${CJK}])`, 'gu');

export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(SPACE_NEAR_CJK, '')
    .replace(/ +\n/g, '\n')
    .trim();
}

/**
 * Splits normalized text into sentences: at line breaks, after 。 ! ? ;, and
 * after a full stop followed by whitespace (so "CHANGELOG.md" stays whole).
 */
export function sentences(text: string): string[] {
  return normalize(text)
    .split(/\n+|(?<=[。!?;])|(?<=\.)\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** A copy of the pattern that finds every match, for replace and matchAll. */
export function globalPattern(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
}

export type Language = 'zh' | 'en' | 'mixed';

/**
 * The language a prompt is written in, judged by its prose. Code, URLs,
 * e-mail addresses and template placeholders are left out, because a Chinese
 * prompt about a codebase still carries English identifiers.
 */
export function detectLanguage(text: string): Language {
  const prose = text
    .normalize('NFKC')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\S+@\S+\.\S+/g, ' ')
    .replace(/\{\{?[^{}\n]*\}\}?/g, ' ');
  const han = prose.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latinWords = prose.match(/[A-Za-z]{2,}/g)?.length ?? 0;
  if (han + latinWords === 0) return 'mixed';
  // One English word carries roughly as much as one and a half Chinese characters.
  const share = han / (han + 1.5 * latinWords);
  if (share >= 0.5) return 'zh';
  if (share <= 0.15) return 'en';
  return 'mixed';
}

/**
 * The wording of a text as a set of tokens: English words of three letters or
 * more, and pairs of adjacent Chinese characters.
 */
export function wordTokens(text: string): Set<string> {
  const normalized = normalize(text).toLowerCase();
  const tokens = new Set<string>();
  for (const word of normalized.match(/[a-z][a-z0-9_'-]{2,}/g) ?? []) tokens.add(word);
  for (const run of normalized.match(/\p{Script=Han}+/gu) ?? []) {
    if (run.length === 1) tokens.add(run);
    for (let i = 0; i + 1 < run.length; i++) tokens.add(run.slice(i, i + 2));
  }
  return tokens;
}

/** Share of the draft's tokens that are still in the result, from 0 to 1. */
export function retainedShare(draft: string, result: string): number {
  const before = wordTokens(draft);
  if (before.size === 0) return 1;
  const after = wordTokens(result);
  let kept = 0;
  for (const token of before) if (after.has(token)) kept++;
  return kept / before.size;
}

const LENGTH_LIMIT =
  /(\d[\d,]*(?:\.\d+)?)\s*(words?|characters?|chars?|sentences?|paragraphs?|bullet points?|bullets?|lines?|tokens?|个字|字|词|句话|句|段|行|条)(?![a-z])/gi;

export interface LengthLimit {
  /** As written, e.g. "150 words". */
  text: string;
  /** The number, without thousands separators. */
  value: string;
}

/** Every "number + length unit" in the text, such as "150 words" or "300 字". */
export function lengthLimits(text: string): LengthLimit[] {
  return [...normalize(text).matchAll(LENGTH_LIMIT)].map((match) => ({
    text: match[0],
    value: (match[1] ?? '').replace(/,/g, ''),
  }));
}

/** True when the number appears in the text as a number of its own. */
export function mentionsNumber(text: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\d.,])${escaped}(?![\\d])`).test(normalize(text).replace(/(\d),(?=\d{3})/g, '$1'));
}

/** Shortens text for a one-line failure reason. */
export function excerpt(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Masks anything that looks like an Anthropic API key, and the value of
 * ANTHROPIC_API_KEY itself, before text is printed or written to a file.
 */
export function redact(text: string, secret = process.env.ANTHROPIC_API_KEY): string {
  let out = text.replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, 'sk-ant-[redacted]');
  if (secret && secret.length >= 8) out = out.split(secret).join('[redacted]');
  return out;
}
