/**
 * Checks that every source link in shared/rules.ts still resolves: the guide
 * page loads and has a heading with the cited anchor.
 *
 *   npm run check:links
 *
 * It needs network access to platform.claude.com, so it is not part of
 * `npm test`. Run it after editing rules.ts, and from time to time, because
 * the guides are revised.
 */
import { ALL_RULES, GUIDES, type GuideId, sourceUrl } from '../shared/rules';

const pages = new Map<GuideId, string>();
let failures = 0;

for (const [guide, { title, url }] of Object.entries(GUIDES) as [GuideId, { title: string; url: string }][]) {
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`FAIL  ${title}: HTTP ${response.status} at ${url}`);
    failures++;
    continue;
  }
  const html = await response.text();
  if (!html.includes(title)) {
    console.error(`FAIL  ${url} does not carry the title "${title}"`);
    failures++;
  }
  pages.set(guide, html);
}

for (const rule of ALL_RULES) {
  for (const source of rule.sources) {
    const html = pages.get(source.guide);
    if (!html) continue;
    const hasAnchor = new RegExp(`<h[1-6][^>]*\\bid="${source.anchor}"`).test(html);
    const hasHeading = html.includes(source.section) || html.includes(source.section.replace(/'/g, '’'));
    if (hasAnchor && hasHeading) {
      console.log(`ok    ${rule.id}  ${sourceUrl(source)}`);
    } else {
      console.error(
        `FAIL  ${rule.id}  ${sourceUrl(source)}${hasAnchor ? '' : '  (no heading with this anchor)'}${
          hasHeading ? '' : `  (heading text "${source.section}" not found)`
        }`,
      );
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} link(s) failed.`);
  process.exit(1);
}
console.log('\nAll rule sources resolve.');
