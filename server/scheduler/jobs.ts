/** T36 — job definitions (cadences are pure functions of the clock; fetching goes through existing services). */
import type { SchedulerJob } from './scheduler.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ICT_OFFSET_MS = 7 * HOUR;

/** CFTC publishes Friday 15:30 ET; we check Friday 21:00 UTC (= Saturday 04:00 ICT), after either DST offset. */
export function nextCotCheck(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 21, 0, 0));
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7));
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

/** Every 30 min Mon-Fri 08:00-17:00 ICT; otherwise the next business-day 08:00 ICT. */
export function nextFxRefresh(now: Date): Date {
  const ict = new Date(now.getTime() + ICT_OFFSET_MS);
  const dow = ict.getUTCDay();
  const minutes = ict.getUTCHours() * 60 + ict.getUTCMinutes();
  const business = dow >= 1 && dow <= 5;
  if (business && minutes >= 8 * 60 && minutes < 17 * 60) {
    return new Date(now.getTime() + 30 * MIN);
  }
  const day = new Date(Date.UTC(ict.getUTCFullYear(), ict.getUTCMonth(), ict.getUTCDate(), 8, 0, 0));
  if (!(business && minutes < 8 * 60)) day.setUTCDate(day.getUTCDate() + 1);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
  return new Date(day.getTime() - ICT_OFFSET_MS);
}

export interface CotSchedulerService {
  listMappings(): ReadonlyArray<{ instrumentId: string; status: string; cftcContractMarketCode?: string | null }>;
  sync(instrumentId: string): Promise<{ status: 'SUCCESS' | 'PARTIAL' | 'FAILED' }>;
  health(): { markets: Array<{ reports: Array<{ lastSuccessfulSyncAt: string | null }> }> };
}

export interface MacroSchedulerService {
  getEia(): Promise<unknown>;
  getWasde(): Promise<unknown>;
  getFx(): Promise<unknown>;
}

export interface SchedulerDeps {
  cot?: CotSchedulerService | (() => CotSchedulerService) | null;
  macro?: MacroSchedulerService | null;
  /** Owner's FRED adapter sync (called as-is). */
  fredSync?: (() => Promise<{ synced: number; error?: string }>) | null;
  /** Official FRED Public CSV macro sync (no API key required). */
  fredPublicSync?: (() => Promise<{ synced: number; error?: string }>) | null;
  /** Yahoo UNOFFICIAL daily history (10y backfill once, then incremental); only passed when YAHOO_ENABLED. */
  yahooHistorySync?: (() => Promise<{ results: Array<{ status: string }> }>) | null;
  /** Yahoo UNOFFICIAL intraday (M15 + H1) history with retention; only passed when YAHOO_ENABLED. */
  yahooIntradaySync?: (() => Promise<{ results: Array<{ status: string }> }>) | null;
  /** T67: Telegram zone + radar checks every 5 min; only passed when TELEGRAM_BOT_TOKEN is set. */
  telegramZones?: (() => Promise<unknown>) | null;
  telegramRadar?: (() => Promise<unknown>) | null;
  /** T63: contest stop/target check + mark refresh every 5 min. */
  contestStops?: (() => Promise<unknown>) | null;
  /** T101: Web Push / email zone + radar checks every 5 min; only passed when VAPID or SMTP env is set. */
  channelZones?: (() => Promise<unknown>) | null;
  channelRadar?: (() => Promise<unknown>) | null;
  /** T53: SQLite -> GCS backup; only passed when GCS_BACKUP_BUCKET is set. */
  dbBackup?: (() => Promise<unknown>) | null;
  dbBackupIntervalHours?: number;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

const COT_CATCHUP_DAYS = 8;

export function buildSchedulerJobs(deps: SchedulerDeps): SchedulerJob[] {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const jobs: SchedulerJob[] = [];

  if (deps.cot) {
    const cot = deps.cot;
    const getCot = (): CotSchedulerService => (typeof cot === 'function' ? cot() : cot);
    jobs.push({
      id: 'cot-weekly',
      description: 'CFTC COT sync for all mapped instruments (Friday evening UTC check + startup catch-up)',
      next: nextCotCheck,
      runOnStart: () => {
        const last = getCot()
          .health()
          .markets.flatMap((m) => m.reports.map((r) => r.lastSuccessfulSyncAt))
          .filter((x): x is string => !!x)
          .sort()
          .pop();
        return !last || now().getTime() - Date.parse(last) > COT_CATCHUP_DAYS * DAY;
      },
      async run() {
        const svc = getCot();
        const failed: string[] = [];
        for (const m of svc.listMappings()) {
          if (m.status !== 'REPORTED' || !m.cftcContractMarketCode) continue;
          const r = await svc.sync(m.instrumentId);
          if (r.status === 'FAILED') failed.push(m.instrumentId);
        }
        if (failed.length) throw new Error(`COT sync failed for: ${failed.join(', ')}`);
      },
    });
  }

  if (deps.macro) {
    const macro = deps.macro;
    jobs.push({
      id: 'macro-fx',
      description: 'VCB USD/VND + DXY cache warm-up (every 30 min, Mon-Fri 08-17 ICT)',
      next: nextFxRefresh,
      async run() {
        await macro.getFx();
      },
    });
    jobs.push({
      id: 'macro-wasde',
      description: 'USDA WASDE cache warm-up (daily)',
      next: (n) => new Date(n.getTime() + DAY),
      runOnStart: true,
      async run() {
        await macro.getWasde();
      },
    });
    jobs.push({
      id: 'macro-eia',
      description: 'EIA weekly stocks cache warm-up (every 6 h, only with EIA_API_KEY)',
      next: (n) => new Date(n.getTime() + 6 * HOUR),
      enabled: () => !!env.EIA_API_KEY?.trim(),
      runOnStart: () => !!env.EIA_API_KEY?.trim(),
      async run() {
        await macro.getEia();
      },
    });
  }

  if (deps.fredSync) {
    const fredSync = deps.fredSync;
    jobs.push({
      id: 'fred-macro',
      description: 'FRED macro series sync (daily, only with FRED_API_KEY)',
      next: (n) => new Date(n.getTime() + DAY),
      enabled: () => !!env.FRED_API_KEY?.trim(),
      runOnStart: () => !!env.FRED_API_KEY?.trim(),
      async run() {
        const r = await fredSync();
        if (r.error) throw new Error(r.error);
      },
    });
  }
  if (deps.fredPublicSync) {
    const fredPublicSync = deps.fredPublicSync;
    jobs.push({
      id: 'fred-public-macro',
      description: 'FRED Public CSV macro sync (daily, 0 key required)',
      next: (n) => new Date(n.getTime() + DAY),
      runOnStart: true,
      async run() {
        const r = await fredPublicSync();
        if (r.synced === 0 && r.error) throw new Error(r.error);
      },
    });
  }
  if (deps.yahooHistorySync) {
    const yahooHistorySync = deps.yahooHistorySync;
    jobs.push({
      id: 'yahoo-history',
      description: 'Yahoo daily history for charts (10y backfill once, then daily incremental; UNOFFICIAL)',
      next: (n) => new Date(n.getTime() + DAY / 2),
      runOnStart: true,
      async run() {
        const r = await yahooHistorySync();
        if (r.results.length > 0 && r.results.every((x) => x.status === 'FAILED' || x.status === 'UNAVAILABLE')) {
          throw new Error('Yahoo history: no instrument synced.');
        }
      },
    });
  }
  if (deps.yahooIntradaySync) {
    const yahooIntradaySync = deps.yahooIntradaySync;
    jobs.push({
      id: 'yahoo-intraday',
      description: 'Yahoo M15/H1 history for session analysis (startup + every 2 h, >= 20 sessions kept; UNOFFICIAL)',
      next: (n) => new Date(n.getTime() + 2 * HOUR),
      runOnStart: true,
      async run() {
        const r = await yahooIntradaySync();
        if (r.results.length > 0 && r.results.every((x) => x.status === 'FAILED' || x.status === 'UNAVAILABLE')) {
          throw new Error('Yahoo intraday: no instrument synced.');
        }
      },
    });
  }
  if (deps.contestStops) {
    const run = deps.contestStops;
    jobs.push({
      id: 'contest-stops',
      description: 'Paper contest: check stops/targets on latest server quotes and refresh scores (every 5 min)',
      next: (n) => new Date(n.getTime() + 5 * MIN),
      async run() {
        await run();
      },
    });
  }
  if (deps.telegramZones) {
    const run = deps.telegramZones;
    jobs.push({
      id: 'telegram-zones',
      description: 'Telegram: watchlist price-zone alerts on latest delayed/closing prices (every 5 min, only with TELEGRAM_BOT_TOKEN)',
      next: (n) => new Date(n.getTime() + 5 * MIN),
      async run() {
        await run();
      },
    });
  }
  if (deps.telegramRadar) {
    const run = deps.telegramRadar;
    jobs.push({
      id: 'telegram-radar',
      description: 'Telegram: new Radar events (every 5 min, only with TELEGRAM_BOT_TOKEN)',
      next: (n) => new Date(n.getTime() + 5 * MIN),
      async run() {
        await run();
      },
    });
  }
  if (deps.channelZones) {
    const run = deps.channelZones;
    jobs.push({
      id: 'channel-zones',
      description: 'Web Push + email: watchlist price-zone alerts on latest delayed/closing prices (every 5 min, only with VAPID/SMTP env)',
      next: (n) => new Date(n.getTime() + 5 * MIN),
      async run() {
        await run();
      },
    });
  }
  if (deps.channelRadar) {
    const run = deps.channelRadar;
    jobs.push({
      id: 'channel-radar',
      description: 'Web Push: new Radar events (every 5 min, only with VAPID env)',
      next: (n) => new Date(n.getTime() + 5 * MIN),
      async run() {
        await run();
      },
    });
  }
  if (deps.dbBackup) {
    const run = deps.dbBackup;
    const hours = deps.dbBackupIntervalHours && deps.dbBackupIntervalHours > 0 ? deps.dbBackupIntervalHours : 6;
    jobs.push({
      id: 'db-backup',
      description: `SQLite backup to Google Cloud Storage (every ${hours} h, only with GCS_BACKUP_BUCKET)`,
      next: (n) => new Date(n.getTime() + hours * HOUR),
      async run() {
        await run();
      },
    });
  }
  return jobs;
}
