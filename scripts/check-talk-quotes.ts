/**
 * Checks every talk quote in shared/rules.ts against the talk's transcript:
 * each quote must appear, word for word, in the transcript lines between the
 * source's start and end times.
 *
 *   npm run check:quotes -- path/to/transcript.md
 *
 * The transcript is not part of the repository. It is the automatic
 * transcript of the full recording, one line per time stamp, in the form
 * `mm:ss text`. Run this after adding or editing a talk-sourced rule.
 */
import { readFileSync } from 'node:fs';
import { ALL_RULES, TALK, isTalkSource, sourceLabel, timestampSeconds } from '../shared/rules';

const path = process.argv[2];
if (!path) {
  console.error('Usage: npm run check:quotes -- <transcript file>');
  process.exit(2);
}

const LINE = /^(\d{1,2}:[0-5]\d)\s+(.*)$/;
const lines = readFileSync(path, 'utf8')
  .split('\n')
  .map((line) => LINE.exec(line.trim()))
  .filter((match): match is RegExpExecArray => match !== null)
  .map(([, time = '', text = '']) => ({ seconds: timestampSeconds(time), text }));

if (lines.length === 0) {
  console.error(`No "mm:ss text" lines found in ${path}.`);
  process.exit(2);
}

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
let failures = 0;
let checked = 0;

for (const rule of ALL_RULES) {
  for (const source of rule.sources.filter(isTalkSource)) {
    const from = timestampSeconds(source.start);
    const to = timestampSeconds(source.end);
    const passage = normalize(
      lines
        .filter((line) => line.seconds >= from && line.seconds <= to)
        .map((line) => line.text)
        .join(' '),
    );
    const problems: string[] = [];
    if (from > to) problems.push('start is after end');
    if (to > TALK.durationSeconds) problems.push('end is past the end of the recording');
    if (!passage) problems.push('no transcript lines in this range');
    for (const quote of source.quotes) {
      checked++;
      if (!passage.includes(normalize(quote))) problems.push(`not found: "${quote}"`);
    }
    if (problems.length === 0) {
      console.log(`ok    ${rule.id}  ${sourceLabel(source)}`);
    } else {
      failures++;
      console.error(`FAIL  ${rule.id}  ${sourceLabel(source)}\n        ${problems.join('\n        ')}`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} talk source(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checked} quotes appear in the transcript at the cited times.`);
