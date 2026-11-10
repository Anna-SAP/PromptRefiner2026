/**
 * When this bundle was built, as an ISO 8601 UTC timestamp. Vite writes the
 * value in at build time (see vite.config.ts), so it is fixed for a given
 * deployment and is not the time the visitor opened the page. It is null when
 * running from the dev server, which has no build.
 */
export const BUILD_TIME: string | null = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : null;

const DISPLAY_OFFSET_HOURS = 8;

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Formats a timestamp as `2026-11-10 15:38 UTC+8`.
 *
 * The result is always in UTC+8, whatever the visitor's own time zone, so
 * everyone looking at the same deployment sees the same text. The offset is
 * applied by hand rather than through a named time zone: UTC+8 has no
 * daylight saving, and this way the output cannot vary with the browser.
 */
export function formatBuildTime(iso: string): string | null {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return null;
  const shifted = new Date(instant + DISPLAY_OFFSET_HOURS * 60 * 60 * 1000);
  const date = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  const time = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
  return `${date} ${time} UTC+${DISPLAY_OFFSET_HOURS}`;
}
