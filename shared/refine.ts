import type Anthropic from '@anthropic-ai/sdk';
import type { EffortLevel, RefineRequest, StreamEvent } from './protocol';
import { SYSTEM_PROMPT, buildUserContent } from './prompt';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export interface RefineOptions {
  model: string;
  maxTokens: number;
  effort: EffortLevel;
  /** Let the API re-run a request that a safety classifier declined. */
  useFallbacks: boolean;
  signal?: AbortSignal;
  /** Called once, as soon as the API accepts the request and starts streaming. */
  onOpen?: () => void;
}

/**
 * Sends one refinement request to Claude and reports progress through `emit`.
 *
 * This is the single place that talks to the Messages API. The Express server
 * and the browser-only build both call it, so the two always send the same
 * request and interpret the answer the same way. SDK errors are thrown for the
 * caller to translate; a refusal is reported as an `error` event.
 */
export async function runRefinement(
  client: Anthropic,
  request: RefineRequest,
  options: RefineOptions,
  emit: (event: StreamEvent) => void,
): Promise<void> {
  const stream = client.beta.messages.stream(
    {
      model: options.model,
      max_tokens: options.maxTokens,
      // Thinking is always on for Claude Fable 5.2; "summarized" asks for a
      // readable summary so the UI has something to show while it works.
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: options.effort },
      // The system prompt is identical on every request, so mark it cacheable.
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildUserContent(request) }],
      ...(options.useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    },
    { signal: options.signal },
  );

  let opened = false;
  for await (const event of stream) {
    if (!opened) {
      opened = true;
      options.onOpen?.();
    }
    if (event.type !== 'content_block_delta') continue;
    if (event.delta.type === 'text_delta') {
      emit({ type: 'text', text: event.delta.text });
    } else if (event.delta.type === 'thinking_delta') {
      emit({ type: 'thinking', text: event.delta.thinking });
    }
  }

  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    // Any text streamed before a refusal is partial and must not be used.
    emit({
      type: 'error',
      code: 'refusal',
      message:
        'Claude declined to refine this request. Rephrase the draft, or remove content that could be read as harmful, and try again.',
    });
    return;
  }
  emit({
    type: 'done',
    model: message.model,
    truncated: message.stop_reason === 'max_tokens',
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  });
}
