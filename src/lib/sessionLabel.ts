import type { HistoryItem } from '../types';

/** How a saved session's time is shown wherever sessions are listed. */
export const sessionDateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** The text a saved session is recognised by: its draft, or a stand-in when it had none. */
export function sessionTitle(item: HistoryItem): string {
  return item.originalPrompt.trim() || 'Image only request';
}
