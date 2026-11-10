import { type Plugin, defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Browser-only build: adds a Content-Security-Policy to index.html.
 *
 * In that build the user's API key lives in the page, so the page is locked
 * down: it may load code only from itself and may open network connections
 * only to the Anthropic API. Even a compromised dependency could not send the
 * key anywhere else.
 */
function contentSecurityPolicy(apiOrigin: string): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src ${apiOrigin}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'prompt-refiner:csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    ],
  };
}

// During development the Express server in server/index.ts mounts Vite as
// middleware, so there is no separate dev-server port or proxy to configure.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const directMode = env.VITE_DIRECT_API === 'true';
  const apiOrigin = new URL(env.VITE_ANTHROPIC_BASE_URL || 'https://api.anthropic.com').origin;

  return {
    plugins: [react(), tailwindcss(), ...(directMode ? [contentSecurityPolicy(apiOrigin)] : [])],
    build: {
      target: 'es2022',
      outDir: 'dist',
    },
  };
});
