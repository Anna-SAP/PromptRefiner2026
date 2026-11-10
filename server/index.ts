import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler } from 'express';
import type { ApiErrorBody, AppConfig } from '../shared/protocol';
import { config } from './config';
import { handleRefine } from './refine';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function startServer(): Promise<void> {
  const app = express();
  const httpServer = http.createServer(app);
  app.disable('x-powered-by');

  // Images travel as base64 JSON. The browser downscales them first, and
  // validate.ts enforces the real per-image and total limits.
  app.use('/api', express.json({ limit: '30mb' }));

  app.get('/api/config', (_req, res) => {
    const body: AppConfig = {
      model: config.model,
      modelLabel: config.modelLabel,
      defaultEffort: config.defaultEffort,
    };
    res.json(body);
  });

  app.post('/api/refine', handleRefine);

  app.use('/api', (_req, res) => {
    const body: ApiErrorBody = { error: { code: 'invalid_request', message: 'Unknown API route.' } };
    res.status(404).json(body);
  });

  if (config.isProduction) {
    const distDir = path.join(rootDir, 'dist');
    // Vite fingerprints everything under /assets, so those can be cached for a
    // year; index.html must always be fresh.
    app.use('/assets', express.static(path.join(distDir, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(distDir, { index: false }));
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    // One process in development: Vite runs as middleware. Hot reload shares
    // this HTTP server, so there is no second port to open or to collide on.
    const { createServer } = await import('vite');
    const vite = await createServer({
      root: rootDir,
      // Vite's default loader writes vite.config to a temporary file and
      // imports it. `node --watch` sees that file come and go and restarts the
      // server in a loop; the "runner" loader evaluates the config in memory.
      configLoader: 'runner',
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Body-parser failures (oversized or malformed JSON) land here.
  const onError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const tooLarge = error?.type === 'entity.too.large';
    const status = tooLarge ? 413 : typeof error?.status === 'number' ? error.status : 500;
    const body: ApiErrorBody = {
      error: {
        code: status >= 500 ? 'server' : 'invalid_request',
        message: tooLarge
          ? 'The request is too large. Remove some images and try again.'
          : status >= 500
            ? 'Unexpected server error.'
            : 'The request could not be read.',
      },
    };
    if (status >= 500) console.error('[server] unhandled error:', error);
    res.status(status).json(body);
  };
  app.use(onError);

  httpServer.listen(config.port, config.host, () => {
    const shownHost = config.host === '0.0.0.0' ? 'localhost' : config.host;
    console.log(`Prompt Refiner running at http://${shownHost}:${config.port}  (model: ${config.model})`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
