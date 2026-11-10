import Anthropic from '@anthropic-ai/sdk';
import type { Request, Response } from 'express';
import { isUserAbort, mapAnthropicError } from '../shared/errors';
import type { ApiErrorBody, RefineErrorCode, StreamEvent } from '../shared/protocol';
import { runRefinement } from '../shared/refine';
import { validateRefineRequest } from '../shared/validate';
import { config } from './config';

const HEARTBEAT_MS = 15_000;

// Created on first use so the server still boots, and can explain the problem
// in the UI, when no credentials are configured yet.
let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

function errorBody(code: RefineErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

/**
 * POST /api/refine — streams Claude's refinement of a draft prompt as SSE.
 *
 * Failures that happen before the first byte (bad input, bad key, rate limit)
 * are returned as a normal JSON error with a matching HTTP status. Once the
 * stream is open, a failure is delivered as an `error` event instead.
 */
export async function handleRefine(req: Request, res: Response): Promise<void> {
  const validation = validateRefineRequest(req.body);
  if (!validation.ok) {
    res.status(400).json(errorBody('invalid_request', validation.message));
    return;
  }
  const request = validation.value;

  let heartbeat: NodeJS.Timeout | undefined;
  const openEventStream = () => {
    if (res.headersSent) return;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stops nginx-style proxies from buffering the stream.
      'X-Accel-Buffering': 'no',
    });
    // Claude can think for a while before its first visible token; comment
    // lines keep idle-timeout proxies from closing the connection meanwhile.
    heartbeat = setInterval(() => res.write(': keep-alive\n\n'), HEARTBEAT_MS);
  };
  const send = (event: StreamEvent) => {
    openEventStream();
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // If the browser goes away (Stop button, closed tab), stop paying for tokens.
  const upstream = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) upstream.abort();
  });

  try {
    await runRefinement(
      getClient(),
      request,
      {
        model: config.model,
        maxTokens: config.maxTokens,
        effort: request.effort ?? config.defaultEffort,
        useFallbacks: config.useFallbacks,
        signal: upstream.signal,
        onOpen: openEventStream,
      },
      send,
    );
  } catch (error) {
    if (isUserAbort(error) || upstream.signal.aborted || res.destroyed) return;
    console.error('[refine] request failed:', error);
    const mapped = mapAnthropicError(error, config.model, 'server');
    if (res.headersSent) {
      send({ type: 'error', code: mapped.code, message: mapped.message });
    } else {
      res.status(mapped.status).json(errorBody(mapped.code, mapped.message));
    }
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
}
