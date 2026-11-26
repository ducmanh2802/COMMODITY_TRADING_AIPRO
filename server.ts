// `--production` flag (used by `npm start`) sets NODE_ENV cross-platform.
// Static imports are hoisted above this, so only modules that do not read
// NODE_ENV at load time are imported statically; the API app and Vite are
// imported dynamically inside startServer().
if (process.argv.includes('--production')) {
  process.env.NODE_ENV = 'production';
}

import { errorSummary, logger } from './server/lib/logger.ts';
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer(): Promise<void> {
  // T53: restore the market DB from GCS (opt-in) BEFORE any module opens it. Never throws.
  const { restoreOnStartup, readBackupConfig, runConfiguredBackup, backupOnShutdown } = await import(
    './server/services/backup/sqliteBackup.ts'
  );
  await restoreOnStartup();
  // Fundamental (FRED/EIA/USDA) records persist in the same market DB; load them so panels are not empty after a restart.
  try {
    const { FundamentalRepository } = await import('./server/storage/fundamentalRepository.ts');
    const { fundamentalStore } = await import('./server/services/fundamentalService.ts');
    const loaded = fundamentalStore.attachPersistence(new FundamentalRepository());
    logger.info(`Fundamental store: loaded ${loaded} persisted records.`);
  } catch (err) {
    logger.warn(`Fundamental persistence unavailable: ${errorSummary(err)}`);
  }
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
    const { staticCompress } = await import('./server/lib/staticCompress.ts');
    const { staticSetHeaders, staticCacheControl } = await import('./server/lib/cacheHeaders.ts');
    app.use(staticCompress(distPath));
    app.use(express.static(distPath, { index: false, setHeaders: staticSetHeaders(distPath) }));
    // SPA fallback (Express 4 compatible): serve index.html for any non-API
    // GET/HEAD request that did not match a static file, so deep links like
    // /markets work. /api/* is left to the API app's JSON 404 handler.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path === '/api' || req.path.startsWith('/api/')) return next();
      res.setHeader('Cache-Control', staticCacheControl('/index.html'));
      res.sendFile(indexHtml);
    });
  } else {
    // Guard against any /api/* path falling through to Vite's SPA index.html fallback.
    app.use('/api', (_req, res) => {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Requested API endpoint does not exist.',
      });
    });
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
    logger.info(
      `COMMODITY TRADING AI PRO (${isProduction ? 'production' : 'development'}) listening on http://localhost:${PORT}` +
        (host ? ` (bound to ${host})` : ' (IPv4 + IPv6)'),
    );
  };
  // T67: Telegram worker + jobs exist only when TELEGRAM_BOT_TOKEN is set (the route module builds the service).
  const notify = app.locals.notify as import('./server/routes/notify.ts').NotifyService | null | undefined;
  const notifyDeps = app.locals.notifyDeps as
    | { getRadar: () => Promise<import('./src/shared/types/radar.ts').RadarResponse>; getPrice: (symbol: string) => Promise<number | null> }
    | undefined;
  let telegramJobs: { zones: () => Promise<unknown>; radar: () => Promise<unknown> } | null = null;
  if (notify?.getUpdates && notifyDeps) {
    const getUpdates = notify.getUpdates;
    const { TelegramPoller } = await import('./server/services/notify/poller.ts');
    const { runZoneCheck, runRadarCheck } = await import('./server/services/notify/jobs.ts');
    {
      new TelegramPoller({ getUpdates, store: notify.store, messenger: notify.messenger }).start();
      telegramJobs = {
        zones: () => runZoneCheck({ store: notify.store, messenger: notify.messenger, getPrice: notifyDeps.getPrice }),
        radar: () => runRadarCheck({ store: notify.store, messenger: notify.messenger, getRadar: notifyDeps.getRadar }),
      };
      console.log('Telegram notifications enabled (long-poll worker started).');
    }
  }
  // T101: Web Push / email jobs exist only when VAPID or SMTP env is set (route module builds the channels).
  const channels = app.locals.channels as import('./server/services/notify/channels.ts').Channels | null | undefined;
  let channelJobs: { zones: () => Promise<unknown>; radar: (() => Promise<unknown>) | null } | null = null;
  if (channels && notifyDeps) {
    const { runChannelZoneCheck, runChannelRadarCheck } = await import('./server/services/notify/channelJobs.ts');
    channelJobs = {
      zones: () => runChannelZoneCheck({ store: channels.store, push: channels.push, email: channels.email, baseUrl: channels.baseUrl, getPrice: notifyDeps.getPrice }),
      radar: channels.push ? () => runChannelRadarCheck({ store: channels.store, push: channels.push, getRadar: notifyDeps.getRadar }) : null,
    };
    console.log(`Push/email notifications enabled (push=${!!channels.push}, email=${!!channels.email}).`);
  }
  if (isSchedulerEnabled()) {
    try {
      const registry = app.locals.providerRegistry as
        | {
            getProviderById?: (id: string) => {
              syncMacroSeries?: () => Promise<{ synced: number; error?: string }>;
              syncPublicCsvMacroSeries?: () => Promise<{ synced: number; error?: string }>;
            } | null;
          }
        | undefined;
      const fred = registry?.getProviderById?.('FRED_MACRO') as
        | {
            syncMacroSeries?: () => Promise<{ synced: number; error?: string }>;
            syncPublicCsvMacroSeries?: () => Promise<{ synced: number; error?: string }>;
            syncPublicCommodityBenchmarks?: () => Promise<{ synced: number; error?: string }>;
          }
        | null
        | undefined;
      scheduler = new Scheduler(
        buildSchedulerJobs({
          cot: () => (cotService ??= new CotService()),
          contestStops: (app.locals.contest as { runStopCheck?: () => Promise<unknown> } | undefined)?.runStopCheck ?? null,
          telegramZones: telegramJobs?.zones ?? null,
          telegramRadar: telegramJobs?.radar ?? null,
          dbBackup: readBackupConfig() ? () => runConfiguredBackup() : null,
          dbBackupIntervalHours: readBackupConfig()?.intervalHours,
          channelZones: channelJobs?.zones ?? null,
          channelRadar: channelJobs?.radar ?? null,
          macro,
          fredSync: fred?.syncMacroSeries ? () => fred.syncMacroSeries!() : null,
          yahooHistorySync:
            (process.env.YAHOO_ENABLED ?? '').trim().toLowerCase() === 'true' && typeof app.locals.runYahooHistory === 'function'
              ? () => app.locals.runYahooHistory()
              : null,
          yahooIntradaySync:
            (process.env.YAHOO_ENABLED ?? '').trim().toLowerCase() === 'true' && typeof app.locals.runYahooIntraday === 'function'
              ? () => app.locals.runYahooIntraday()
              : null,
          fredPublicSync: fred?.syncPublicCsvMacroSeries
            ? async () => {
                const macroRes = await fred.syncPublicCsvMacroSeries!();
                const benchRes = fred.syncPublicCommodityBenchmarks
                  ? await fred.syncPublicCommodityBenchmarks()
                  : { synced: 0 };
                return {
                  synced: macroRes.synced + benchRes.synced,
                  error: macroRes.error ?? benchRes.error,
                };
              }
            : null,
        }),
      );
      scheduler.start();
      void scheduler.runJob('fred-public-macro');
    } catch (err) {
      logger.error('Scheduler failed to start (continuing without it)', { error: err instanceof Error ? err.message : 'unknown error' });
    }
  }
  if (isSchedulerEnabled()) {
    // Pre-compute scorecard / market-pulse / cycle overview after startup and then on a timer, so requests are served
    // from memory (stale-while-revalidate). Never blocks listen(); failures are swallowed (refresh() never rejects).
    const warmers = (app.locals.warmers ?? []) as Array<{ name: string; refresh: () => Promise<void> }>;
    const warmAll = () => Promise.all(warmers.map((w) => w.refresh()));
    setTimeout(() => void warmAll(), 500).unref();
    setInterval(() => void warmAll(), 5 * 60_000 + 5_000).unref();
  }
  // Optional admin alert when a data source stays STALE > 2x cadence (needs the Telegram bot + TELEGRAM_ADMIN_CHAT_ID).
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  const freshnessSnapshot = app.locals.freshnessSnapshot as (() => Promise<import('./server/lib/freshness.ts').FreshnessRow[]>) | undefined;
  if (adminChatId && notify?.messenger && freshnessSnapshot) {
    const { FreshnessAlerter } = await import('./server/lib/freshness.ts');
    const alerter = new FreshnessAlerter({ send: async (text) => (await notify.messenger.sendMessage(adminChatId, text)).ok });
    const tick = () => void freshnessSnapshot().then((rows) => alerter.check(rows)).catch(() => undefined);
    setTimeout(tick, 10 * 60_000).unref();
    setInterval(tick, 10 * 60_000).unref();
    logger.info('Data freshness admin alerts enabled.');
  }
  const server = host ? app.listen(PORT, host, onListening) : app.listen(PORT, onListening);
  if (readBackupConfig()) {
    let shuttingDown = false;
    process.once('SIGTERM', () => {
      if (shuttingDown) return;
      shuttingDown = true;
      void backupOnShutdown(20_000).finally(() => process.exit(0));
    });
  }
  server.on('error', (err: NodeJS.ErrnoException) => {
    logger.error(
      err.code === 'EADDRINUSE'
        ? `Port ${PORT} is already in use (another server instance?). Stop it or set PORT=...`
        : `Server error: ${err.message}`,
    );
    process.exit(1);
  });
}

startServer().catch((err) => {
  logger.error('Failed to start server', { error: errorSummary(err) });
  process.exit(1);
});
