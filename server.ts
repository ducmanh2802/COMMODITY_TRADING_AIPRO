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
  const { MacroService } = await import('./server/macro/service.ts');
  const { CotService } = await import('./server/cot/service.ts');
  const { Scheduler, buildSchedulerJobs, isSchedulerEnabled } = await import('./server/scheduler/index.ts');
  // T36: shared MacroService so scheduler warm-ups fill the cache the routes read.
  const macro = new MacroService();
  let cotService: InstanceType<typeof CotService> | null = null;
  let scheduler: InstanceType<typeof Scheduler> | null = null;
  const app = createApiApp({ macro, schedulerStatus: () => scheduler?.status() ?? { enabled: false, jobs: [] } });

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

  // Listen only after the API app (incl. the SQLite DB, opened synchronously in createApiApp) and
  // the Vite middleware are ready, so the first browser request never hits a half-initialised server.
  //
  // HOST unset → Node's default dual-stack bind (`::`, accepting IPv4 too; falls back to 0.0.0.0
  // without IPv6). Binding only 0.0.0.0 made `http://localhost:PORT` try ::1 first and wait for the
  // refused connection to time out (~2 s per attempt on Windows): every API call took 4–5 s.
  const host = process.env.HOST?.trim() || undefined;
  const onListening = () => {
    console.log(
      `COMMODITY TRADING AI PRO (${isProduction ? 'production' : 'development'}) listening on http://localhost:${PORT}` +
        (host ? ` (bound to ${host})` : ' (IPv4 + IPv6)'),
    );
  };
  if (isSchedulerEnabled()) {
    try {
      const registry = app.locals.providerRegistry as
        | { getProviderById?: (id: string) => { syncMacroSeries?: () => Promise<{ synced: number; error?: string }> } | null }
        | undefined;
      const fred = registry?.getProviderById?.('FRED_MACRO');
      scheduler = new Scheduler(
        buildSchedulerJobs({
          cot: () => (cotService ??= new CotService()),
          macro,
          fredSync: fred?.syncMacroSeries ? () => fred.syncMacroSeries!() : null,
        }),
      );
      scheduler.start();
    } catch (err) {
      console.error('Scheduler failed to start (continuing without it):', err instanceof Error ? err.message : 'unknown error');
    }
  }
  const server = host ? app.listen(PORT, host, onListening) : app.listen(PORT, onListening);
  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error(
      err.code === 'EADDRINUSE'
        ? `Port ${PORT} is already in use (another server instance?). Stop it or set PORT=...`
        : `Server error: ${err.message}`,
    );
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
