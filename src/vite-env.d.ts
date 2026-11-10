/// <reference types="vite/client" />

/**
 * ISO 8601 UTC timestamp of the build, substituted by Vite (vite.config.ts).
 * Null on the dev server; undefined where Vite is not involved, such as tests.
 */
declare const __BUILD_TIME__: string | null | undefined;

interface ImportMetaEnv {
  /**
   * "true" builds the browser-only app (used for GitHub Pages): there is no
   * server, the user supplies their own Anthropic API key, and the page calls
   * the API directly.
   */
  readonly VITE_DIRECT_API?: string;
  /** Browser-only build: send API calls here instead of api.anthropic.com (a gateway, or a test double). */
  readonly VITE_ANTHROPIC_BASE_URL?: string;
  /** Browser-only build: model to use instead of the default. */
  readonly VITE_REFINER_MODEL?: string;
}
