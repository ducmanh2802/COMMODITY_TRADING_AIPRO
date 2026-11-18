import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed per client key within one window (mutating methods; all methods when `readMax` is unset). */
  max: number;
  /**
   * Separate, higher budget for read-only requests (GET/HEAD/OPTIONS), counted in their own bucket so
   * UI page loads can never starve imports/syncs and vice versa. Omitted → reads share `max`.
   */
  readMax?: number;
  /** Derive the client key; defaults to req.ip (respects the app's `trust proxy` setting). */
  keyGenerator?: (req: Request) => string;
  /** Injectable clock for tests. */
  now?: () => number;
}

interface WindowEntry {
  windowStart: number;
  count: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 300;
/**
 * Reads are cheap (in-memory / indexed SQLite) and one terminal load fans out to ~6–10 GETs per view;
 * several tabs, React StrictMode double effects or a shared proxy IP (no TRUST_PROXY) can multiply that.
 */
const DEFAULT_READ_MAX = 1200;
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Reads rate limit configuration from the environment.
 * - API_RATE_LIMIT_DISABLED=true disables the limiter (returns null).
 * - API_RATE_LIMIT_WINDOW_MS (default 60000)
 * - API_RATE_LIMIT_MAX (default 300) — mutating requests (POST/PUT/PATCH/DELETE)
 * - API_RATE_LIMIT_READ_MAX (default 1200) — GET/HEAD/OPTIONS, separate bucket
 */
export function rateLimitOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): RateLimitOptions | null {
  if ((env.API_RATE_LIMIT_DISABLED ?? '').trim().toLowerCase() === 'true') {
    return null;
  }
  return {
    windowMs: parsePositiveInt(env.API_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS),
    max: parsePositiveInt(env.API_RATE_LIMIT_MAX, DEFAULT_MAX),
    readMax: parsePositiveInt(env.API_RATE_LIMIT_READ_MAX, DEFAULT_READ_MAX),
  };
}

/**
 * Lightweight fixed-window, in-memory rate limiter (per process, per client key).
 * Suitable for a single-instance deployment; use a shared store behind a load balancer.
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const windowMs = Math.max(1, Math.floor(options.windowMs));
  const writeMax = Math.max(1, Math.floor(options.max));
  const readMax = options.readMax === undefined ? null : Math.max(1, Math.floor(options.readMax));
  const now = options.now ?? Date.now;
  const keyGenerator =
    options.keyGenerator ?? ((req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown');

  const store = new Map<string, WindowEntry>();
  let lastSweep = now();

  const sweep = (current: number): void => {
    if (current - lastSweep < windowMs) return;
    lastSweep = current;
    for (const [key, entry] of store) {
      if (current - entry.windowStart >= windowMs) store.delete(key);
    }
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const current = now();
    sweep(current);

    const isRead = readMax !== null && READ_METHODS.has(req.method.toUpperCase());
    const max = isRead ? (readMax as number) : writeMax;
    const key = `${isRead ? 'r' : 'w'}|${keyGenerator(req)}`;
    let entry = store.get(key);
    if (!entry || current - entry.windowStart >= windowMs) {
      entry = { windowStart: current, count: 0 };
      store.set(key, entry);
    }
    entry.count += 1;

    const resetMs = entry.windowStart + windowMs - current;
    const remaining = Math.max(0, max - entry.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(resetMs / 1000)));

    if (entry.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil(resetMs / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Too many requests. Please retry later.',
        retryAfterSeconds,
      });
      return;
    }

    next();
  };
}
