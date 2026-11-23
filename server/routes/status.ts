/** T74 - GET /api/status (public, cached 15 s) and GET /api/status/errors (admin). */
import { readFileSync, statSync } from 'node:fs';
import type { Express, RequestHandler } from 'express';
import { errorRing, latencyTracker } from '../lib/observability.ts';
import { getBackupStatus } from '../services/backup/sqliteBackup.ts';

export interface StatusDeps {
  requireAdmin: RequestHandler;
  schedulerStatus?: () => unknown;
  providerSummary?: () => Promise<unknown>;
  dbPaths?: string[];
  now?: () => number;
  cacheMs?: number;
}

let cachedVersion: string | null = null;
function appVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version?: string };
    cachedVersion = pkg.version ?? 'unknown';
  } catch {
    cachedVersion = 'unknown';
  }
  return cachedVersion;
}

function dbFiles(paths: string[]) {
  const out: Array<{ file: string; bytes: number }> = [];
  for (const base of paths) {
    for (const suf of ['', '-wal', '-shm']) {
      try {
        out.push({ file: (base + suf).split(/[\\/]/).pop() as string, bytes: statSync(base + suf).size });
      } catch {
        /* missing file */
      }
    }
  }
  return out;
}

export function registerStatusRoutes(app: Express, deps: StatusDeps): void {
  const now = deps.now ?? Date.now;
  const ttl = deps.cacheMs ?? 15_000;
  let cache: { at: number; body: unknown } | null = null;
  const dbPaths = deps.dbPaths ?? [process.env.MARKET_DB_PATH?.trim() || 'data/market.db'];

  app.get('/api/status', async (_req, res, next) => {
    try {
      const t = now();
      if (!cache || t - cache.at >= ttl) {
        const mem = process.memoryUsage();
        const sched = (deps.schedulerStatus?.() ?? { enabled: false, jobs: [] }) as {
          enabled?: boolean;
          jobs?: Array<Record<string, unknown>>;
        };
        let providers: unknown = null;
        try {
          providers = (await deps.providerSummary?.()) ?? null;
        } catch {
          providers = { error: 'unavailable' };
        }
        cache = {
          at: t,
          body: {
            status: 'OK',
            generatedAt: new Date(t).toISOString(),
            uptimeSec: Math.round(process.uptime()),
            version: appVersion(),
            nodeVersion: process.version,
            memory: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576) },
            scheduler: {
              enabled: Boolean(sched.enabled),
              jobs: (sched.jobs ?? []).map((j) => ({
                id: j.id,
                lastRun: j.lastRunAt ?? null,
                lastOk: j.lastSuccessAt ?? null,
                lastError: j.lastError ?? null,
                nextRun: j.nextRunAt ?? null,
              })),
            },
            providers,
            db: dbFiles(dbPaths),
            backup: (({ lastBackupAt, lastBackupError }) => ({ lastBackupAt, lastBackupError }))(getBackupStatus()),
            errors: {
              last1h: errorRing.countSince(3_600_000, t),
              last24h: errorRing.countSince(86_400_000, t),
            },
            latency: latencyTracker.summary(8),
          },
        };
      }
      res.setHeader('Cache-Control', 'public, max-age=15');
      res.json(cache.body);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/status/errors', deps.requireAdmin, (_req, res) => {
    res.json({ countsByRoute: errorRing.countsByRoute(), recent: errorRing.list() });
  });
}
