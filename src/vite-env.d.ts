/// <reference types="vite/client" />

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
