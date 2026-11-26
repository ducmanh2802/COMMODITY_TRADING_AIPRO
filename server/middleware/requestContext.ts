import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SAFE_INCOMING_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Returns the request id assigned by `requestIdMiddleware` (empty string if absent). */
export function getRequestId(res: Response): string {
  const value = res.locals.requestId;
  return typeof value === 'string' ? value : '';
}

/**
 * Assigns a request id (reusing a well-formed incoming X-Request-Id, else a UUID)
 * and echoes it in the X-Request-Id response header for log correlation.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get('x-request-id');
  const requestId =
    incoming && SAFE_INCOMING_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

/**
 * Security headers safe for a Vite SPA using Firebase Auth popups.
 * Intentionally no script/style/connect CSP and no Cross-Origin-Opener-Policy (both can break auth popups,
 * Vite HMR, Google Fonts, YouTube embeds). Only non-fetch directives that cannot break any of those are set.
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://*.google.com https://localhost.corp.google.com:26001; base-uri 'self'; object-src 'none'; form-action 'self'"
  );
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}
