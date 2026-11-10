import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_EFFORT, DEFAULT_MAX_TOKENS } from '../../shared/defaults';
import { mapAnthropicError } from '../../shared/errors';
import type { RefineRequest, StreamEvent } from '../../shared/protocol';
import { runRefinement } from '../../shared/refine';
import { validateRefineRequest } from '../../shared/validate';
import { loadApiKey } from './apiKey';
import { DIRECT_BASE_URL, DIRECT_MODEL } from './mode';
import { RefineError } from './refineError';

/**
 * Browser-only transport: calls the Anthropic API straight from the page with
 * the key the user entered. Same contract as the server transport in
 * refineClient.ts — resolves after `done`, rejects with a RefineError.
 */
export async function streamRefineDirect(
  request: RefineRequest,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const stored = loadApiKey();
  if (!stored) {
    throw new RefineError('auth', 'Add your Anthropic API key to start. Open “API Key” at the top of the page.');
  }
  const validation = validateRefineRequest(request);
  if (!validation.ok) throw new RefineError('invalid_request', validation.message);

  const client = new Anthropic({
    apiKey: stored.key,
    baseURL: DIRECT_BASE_URL,
    // Safe here because the key belongs to the person using the page and never
    // leaves their browser except to reach the API. This flag exists to stop
    // developers shipping *their own* key to visitors, which this build never does.
    dangerouslyAllowBrowser: true,
  });

  let finished = false;
  try {
    await runRefinement(
      client,
      validation.value,
      {
        model: DIRECT_MODEL,
        maxTokens: DEFAULT_MAX_TOKENS,
        effort: validation.value.effort ?? DEFAULT_EFFORT,
        useFallbacks: true,
        signal,
      },
      (event) => {
        if (event.type === 'error') throw new RefineError(event.code, event.message);
        if (event.type === 'done') finished = true;
        onEvent(event);
      },
    );
  } catch (error) {
    if (error instanceof RefineError || signal.aborted) throw error;
    console.error(error);
    const mapped = mapAnthropicError(error, DIRECT_MODEL, 'browser');
    throw new RefineError(mapped.code, mapped.message);
  }

  if (!finished) throw new RefineError('incomplete', 'The response ended before it was complete. Try again.');
}
