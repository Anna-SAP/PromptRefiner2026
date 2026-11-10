import { DEFAULT_MODEL } from '../../shared/defaults';

/**
 * The app runs in one of two modes, fixed at build time.
 *
 * server — the default. The page talks to the Express server, which holds the
 *          API key and calls Claude.
 * direct — the browser-only build published to GitHub Pages. There is no
 *          server; the user enters their own API key and the page calls the
 *          Anthropic API itself.
 */
export const DIRECT_MODE = import.meta.env.VITE_DIRECT_API === 'true';

export const DIRECT_MODEL = import.meta.env.VITE_REFINER_MODEL?.trim() || DEFAULT_MODEL;
export const DIRECT_BASE_URL = import.meta.env.VITE_ANTHROPIC_BASE_URL?.trim() || undefined;
