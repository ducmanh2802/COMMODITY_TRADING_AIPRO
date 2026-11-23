/** T74 - in-memory error ring buffer, rolling latency tracker, access-log middleware, process hooks. */
import type { NextFunction, Request, Response } from 'express';
import { errorSummary, logger, redactUrl, type Logger } from './logger.ts';

export interface ErrorEntry {
  ts: string;
  route: string;
  method: string;
  status: number;
  name: string;
  message: string;
  reqId: string;
}

export class ErrorRing {
  private buf: ErrorEntry[] = [];
  private counts = new Map<string, number>();
  constructor(private capacity = 200) {}

  record(entry: ErrorEntry): void {
    this.buf.push(entry);
    if (this.buf.length > this.capacity) this.buf.shift();
    this.counts.set(entry.route, (this.counts.get(entry.route) ?? 0) + 1);
  }
  list(): ErrorEntry[] {
    return [...this.buf].reverse();
  }
  countsByRoute(): Record<string, number> {
    return Object.fromEntries([...this.counts.entries()].sort((a, b) => b[1] - a[1]));
  }
  countSince(ms: number, now = Date.now()): number {
    return this.buf.filter((e) => now - Date.parse(e.ts) <= ms).length;
  }
  clear(): void {
    this.buf = [];
    this.counts.clear();
  }
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export class LatencyTracker {
  private byRoute = new Map<string, number[]>();
  constructor(private windowSize = 200) {}

  record(route: string, ms: number): void {
    let arr = this.byRoute.get(route);
    if (!arr) {
      arr = [];
      this.byRoute.set(route, arr);
    }
    arr.push(ms);
    if (arr.length > this.windowSize) arr.shift();
  }
  summary(top = 10): Array<{ route: string; count: number; p50: number; p95: number }> {
    return [...this.byRoute.entries()]
      .map(([route, arr]) => {
        const sorted = [...arr].sort((a, b) => a - b);
        return { route, count: arr.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, top);
  }
}

export const errorRing = new ErrorRing(200);
export const latencyTracker = new LatencyTracker(200);

function routeLabel(req: Request): string {
  const p = req.route?.path;
  if (typeof p === 'string') return `${req.baseUrl ?? ''}${p}`;
  return 'unmatched';
}

/** Record an error summary (used by the Express error handler). */
export function recordError(req: Request, res: Response, err: unknown, status: number): void {
  const s = errorSummary(err);
  errorRing.record({
    ts: new Date().toISOString(),
    route: routeLabel(req),
    method: req.method,
    status,
    name: s.name,
    message: s.message,
    reqId: typeof res.locals.requestId === 'string' ? res.locals.requestId : '',
  });
}

/** Access log + latency tracking. Place after requestIdMiddleware. */
export function accessLogMiddleware(log: Logger = logger, enabled = !process.env.NODE_TEST_CONTEXT) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100;
      const route = routeLabel(req);
      if (route !== 'unmatched') latencyTracker.record(route, durationMs);
      if (!enabled || !req.originalUrl.startsWith('/api')) return;
      log.info('request', {
        reqId: res.locals.requestId,
        method: req.method,
        path: redactUrl(req.originalUrl),
        route,
        status: res.statusCode,
        durationMs,
      });
    });
    next();
  };
}

let hooksInstalled = false;
export function installProcessHooks(log: Logger = logger): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  process.on('unhandledRejection', (reason) => {
    log.error('unhandledRejection', { error: errorSummary(reason) });
  });
  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', { error: errorSummary(err) });
  });
}
