/**
 * Admin guard for mutating endpoints (POST /api/data/import, DELETE /api/data/datasets/:id,
 * POST /api/cot/sync).
 *
 * - ADMIN_API_TOKEN set   → every request must send `Authorization: Bearer <token>` (constant-time
 *                           compare), else 401. Applies to loopback requests too.
 * - ADMIN_API_TOKEN unset → only direct loopback requests (127.0.0.1 / ::1 / ::ffff:127.0.0.1) are
 *                           allowed, else 403. The TCP peer address is used (never req.ip /
 *                           X-Forwarded-For, which a client can spoof when `trust proxy` is on), and a
 *                           request carrying proxy headers is treated as non-loopback so that a reverse
 *                           proxy on the same host does not turn every remote client into "localhost".
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface AdminAuthOptions {
  /**
   * Admin token. `undefined` → read `process.env.ADMIN_API_TOKEN` on every request (so the default
   * middleware follows the environment). `null` or '' → explicitly no token (loopback-only mode).
   */
  token?: string | null;
  /** Override the loopback test (tests). Default: TCP peer is loopback and no proxy headers. */
  isLoopback?: (req: Request) => boolean;
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const PROXY_HEADERS = ['x-forwarded-for', 'forwarded', 'x-real-ip'];

export const ADMIN_TOKEN_ENV = 'ADMIN_API_TOKEN';

function normalizeToken(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** The configured admin token (trimmed), or null when unset/empty. */
export function resolveAdminToken(token?: string | null): string | null {
  return token === undefined ? normalizeToken(process.env[ADMIN_TOKEN_ENV]) : normalizeToken(token);
}

export function isDirectLoopbackRequest(req: Request): boolean {
  const remote = req.socket?.remoteAddress ?? '';
  if (!LOOPBACK_ADDRESSES.has(remote)) return false;
  return !PROXY_HEADERS.some((h) => req.headers[h] !== undefined);
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Constant-time comparison (hashing first so lengths do not leak through timing). */
export function tokensMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(sha256(presented), sha256(expected));
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header);
  return m ? m[1] : null;
}

export function createRequireAdminToken(options: AdminAuthOptions = {}): RequestHandler {
  const isLoopback = options.isLoopback ?? isDirectLoopbackRequest;
  return function requireAdminTokenMiddleware(req: Request, res: Response, next: NextFunction): void {
    const expected = resolveAdminToken(options.token);
    if (expected !== null) {
      const presented = bearerToken(req);
      if (presented !== null && tokensMatch(presented, expected)) {
        next();
        return;
      }
      res.setHeader('WWW-Authenticate', 'Bearer realm="admin"');
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'This endpoint requires the header "Authorization: Bearer <ADMIN_API_TOKEN>".',
      });
      return;
    }
    if (isLoopback(req)) {
      next();
      return;
    }
    res.status(403).json({
      error: 'FORBIDDEN',
      message:
        'ADMIN_API_TOKEN is not configured, so mutating endpoints only accept direct requests from localhost. ' +
        'Set ADMIN_API_TOKEN on the server and send "Authorization: Bearer <token>" to use this endpoint remotely.',
    });
  };
}

/** Default guard: follows process.env.ADMIN_API_TOKEN at request time. */
export const requireAdminToken: RequestHandler = createRequireAdminToken();

/** Startup message describing the admin-auth mode, or null when a token is configured properly. */
export function adminAuthStartupWarning(token?: string | null): string | null {
  const resolved = resolveAdminToken(token);
  if (resolved === null) {
    return `[security] ${ADMIN_TOKEN_ENV} is not set: mutating endpoints (POST /api/data/import, DELETE /api/data/datasets/:id, POST /api/cot/sync) accept only direct localhost requests. Set ${ADMIN_TOKEN_ENV} to enable token auth.`;
  }
  if (resolved.length < 16) {
    return `[security] ${ADMIN_TOKEN_ENV} is shorter than 16 characters; use a long random value.`;
  }
  return null;
}
