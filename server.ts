// `--production` flag (used by `npm start`) sets NODE_ENV cross-platform.
// Static imports are hoisted above this, so only modules that do not read
// NODE_ENV at load time are imported statically; the API app and Vite are
// imported dynamically inside startServer().
if (process.argv.includes('--production')) {
  process.env.NODE_ENV = 'production';
}

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer(): Promise<void> {
  const { createApiApp } = await import('./server/app.ts');
  const app = createApiApp();

  if (isProduction) {
    const distPath = path.resolve(__dirname, 'dist');
    const indexHtml = path.join(distPath, 'index.html');
    app.use(express.static(distPath, { index: false }));
    // SPA fallback (Express 4 compatible): serve index.html for any non-API
    // GET/HEAD request that did not match a static file, so deep links like
    // /markets work. /api/* is left to the API app's JSON 404 handler.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path === '/api' || req.path.startsWith('/api/')) return next();
      res.sendFile(indexHtml);
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `COMMODITY TRADING AI PRO (${isProduction ? 'production' : 'development'}) listening on http://0.0.0.0:${PORT}`,
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
