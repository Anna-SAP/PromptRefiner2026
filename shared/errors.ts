import Anthropic from '@anthropic-ai/sdk';
import type { RefineErrorCode } from './protocol';

export interface MappedError {
  status: number;
  code: RefineErrorCode;
  message: string;
}

/**
 * Who will read the message. On the server the fix is in `.env`; in the
 * browser-only build the fix is in the page's API Key dialog.
 */
export type Audience = 'server' | 'browser';

const AUTH_MESSAGE: Record<Audience, string> = {
  server: 'The server could not authenticate with Anthropic. Set ANTHROPIC_API_KEY in .env and restart the server.',
  browser: 'Anthropic rejected this API key. Open “API Key” at the top of the page and check it.',
};

const NO_CREDENTIALS_MESSAGE: Record<Audience, string> = {
  server:
    'No Anthropic credentials are configured on the server. Copy .env.example to .env, set ANTHROPIC_API_KEY, and restart.',
  browser: 'Add your Anthropic API key to start. Open “API Key” at the top of the page.',
};

const NETWORK_MESSAGE: Record<Audience, string> = {
  server: 'Could not reach the Anthropic API. Check the server’s network connection and try again.',
  browser:
    'Could not reach the Anthropic API. Check your connection; an ad blocker or a company proxy may be blocking api.anthropic.com.',
};

/**
 * Translates an SDK failure into something a person can act on. Ordered from
 * most to least specific, because every status class extends APIError.
 */
export function mapAnthropicError(error: unknown, model: string, audience: Audience): MappedError {
  if (error instanceof Anthropic.AuthenticationError) {
    return { status: 401, code: 'auth', message: AUTH_MESSAGE[audience] };
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return {
      status: 403,
      code: 'permission',
      message: `This API key is not allowed to use ${model}. Check the workspace's model access.`,
    };
  }
  if (error instanceof Anthropic.NotFoundError) {
    return {
      status: 404,
      code: 'model_not_found',
      message:
        audience === 'server'
          ? `Model "${model}" was not found. Check REFINER_MODEL in .env.`
          : `Model "${model}" is not available to this API key.`,
    };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return {
      status: 429,
      code: 'rate_limited',
      message: 'Anthropic rate limit reached. Wait a moment and try again.',
    };
  }
  if (error instanceof Anthropic.BadRequestError) {
    // 400s describe a problem with this specific request (an unreadable image,
    // a data-retention requirement), so the upstream wording is the useful part.
    return { status: 400, code: 'invalid_request', message: error.message };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 502, code: 'network', message: NETWORK_MESSAGE[audience] };
  }
  if (error instanceof Anthropic.APIError) {
    const overloaded = error.status === 529 || error.status === 503;
    return {
      status: 502,
      code: overloaded ? 'overloaded' : 'server',
      message: overloaded
        ? 'Claude is temporarily overloaded. Try again in a few seconds.'
        : 'The Anthropic API returned an unexpected error. Try again shortly.',
    };
  }
  if (error instanceof Anthropic.AnthropicError) {
    // Raised before any request is sent, e.g. when no credentials are configured.
    return { status: 500, code: 'auth', message: NO_CREDENTIALS_MESSAGE[audience] };
  }
  return {
    status: 500,
    code: 'server',
    message: audience === 'server' ? 'Unexpected server error. Check the server log.' : 'Something went wrong. Please try again.',
  };
}

export function isUserAbort(error: unknown): boolean {
  return error instanceof Anthropic.APIUserAbortError;
}
