/**
 * Template tag for multi-line drafts and prompts in the case files: drops the
 * first line break and the trailing one, and removes the indentation the
 * lines share, so the text reads as written without fighting the code's
 * indentation. Relative indentation (in code blocks, for example) is kept.
 */
export function block(strings: TemplateStringsArray, ...values: unknown[]): string {
  const joined = strings.reduce((out, part, i) => out + part + (i < values.length ? String(values[i]) : ''), '');
  const lines = joined.replace(/^[ \t]*\n/, '').replace(/\n[ \t]*$/, '').split('\n');
  const indents = lines.filter((line) => line.trim()).map((line) => /^[ \t]*/.exec(line)?.[0].length ?? 0);
  const shared = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(shared)).join('\n');
}
