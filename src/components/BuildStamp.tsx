import { BUILD_TIME, formatBuildTime } from '../lib/buildTime';

const label = BUILD_TIME ? formatBuildTime(BUILD_TIME) : null;

/** "built on 2026-11-10 15:38 UTC+8" — when the running version was built. Renders nothing on the dev server. */
export default function BuildStamp({ className = '' }: { className?: string }) {
  if (!BUILD_TIME || !label) return null;
  return (
    <time
      dateTime={BUILD_TIME}
      title={`This version was built at ${BUILD_TIME} (UTC)`}
      className={`font-mono text-xs whitespace-nowrap text-slate-400 ${className}`}
    >
      built on {label}
    </time>
  );
}

/** Whether there is a build time to show; lets layouts reserve room for it. */
export const hasBuildStamp = label !== null;
