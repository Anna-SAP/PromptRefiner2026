import type { ApiErrorBody, RefineRequest, StreamEvent } from '../../shared/protocol';
import { DIRECT_MODE } from './mode';
import { RefineError } from './refineError';

async function errorFromResponse(response: Response): Promise<RefineError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (body.error?.message) {
      return new RefineError(body.error.code ?? 'server', body.error.message);
    }
  } catch {
    // Not JSON — fall through to the generic message.
  }
  return new RefineError('server', `The server responded with HTTP ${response.status}.`);
}

/** Extracts the JSON payload from one SSE block, or null for comments/keep-alives. */
function parseEventBlock(block: string): StreamEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  return data ? (JSON.parse(data) as StreamEvent) : null;
}

/** Server transport: POST /api/refine and read the SSE stream it returns. */
async function streamRefineViaServer(
  request: RefineRequest,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new RefineError('network', 'Could not reach the server. Check that it is running and try again.');
  }

  if (!response.ok) throw await errorFromResponse(response);
  if (!response.body) throw new RefineError('server', 'The server sent an empty response.');

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value.replaceAll('\r\n', '\n');

      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const event = parseEventBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (!event) continue;
        if (event.type === 'error') throw new RefineError(event.code, event.message);
        onEvent(event);
        if (event.type === 'done') return;
      }
    }
  } catch (error) {
    if (error instanceof RefineError || signal.aborted) throw error;
    throw new RefineError('network', 'The connection dropped while Claude was responding. Try again.');
  } finally {
    reader.cancel().catch(() => {});
  }

  throw new RefineError('incomplete', 'The response ended before it was complete. Try again.');
}

/**
 * Refines a draft and feeds each streamed event to `onEvent`.
 *
 * Resolves after the `done` event. Rejects with a RefineError for anything
 * else, including a stream that ends without saying it finished. Aborting via
 * `signal` rejects with an abort error, which callers detect via the signal.
 *
 * Which transport runs is fixed at build time. The Anthropic SDK is imported
 * lazily, so the normal server-backed build never downloads it.
 */
export async function streamRefine(
  request: RefineRequest,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (DIRECT_MODE) {
    const { streamRefineDirect } = await import('./directClient');
    return streamRefineDirect(request, onEvent, signal);
  }
  return streamRefineViaServer(request, onEvent, signal);
}
