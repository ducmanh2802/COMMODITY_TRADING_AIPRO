import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

/**
 * Cache-Control for a built-SPA file, given its URL path (e.g. "/assets/index-abc.js").
 * Hashed Vite output is immutable; entry points that reference hashed files (index.html, sw.js,
 * manifest) must always revalidate or users get stuck on stale builds.
 */
export function staticCacheControl(urlPath: string): string {
  if (urlPath.startsWith('/assets/')) return IMMUTABLE;
  if (urlPath.startsWith('/fonts/')) return 'public, max-age=2592000, immutable';
  const ext = path.extname(urlPath).toLowerCase();
  if (urlPath === '/' || ext === '' || ext === '.html' || ext === '.webmanifest') return REVALIDATE;
  if (/(^|\/)(sw|service-worker|workbox-[\w-]+)\.js$/.test(urlPath)) return REVALIDATE;
  if (urlPath.startsWith('/icons/')) return 'public, max-age=86400';
  return 'public, max-age=0, must-revalidate';
}

/** `setHeaders` hook for express.static (res.req.path is not set there, so derive from the absolute file path). */
export function staticSetHeaders(root: string) {
  const rootResolved = path.resolve(root);
  return (res: Response, filePath: string): void => {
    const rel = '/' + path.relative(rootResolved, filePath).split(path.sep).join('/');
    res.setHeader('Cache-Control', staticCacheControl(rel));
  };
}

/**
 * Slow-changing, non-user-specific API GETs. `private` so shared caches never store them; short max-age so
 * nothing market-price-like is ever held. Express' default weak ETag already gives 304 revalidation.
 */
const API_CACHE_RULES: Array<{ re: RegExp; maxAge: number }> = [
  { re: /^\/api\/strategies$/, maxAge: 3600 },
  { re: /^\/api\/architecture$/, maxAge: 3600 },
  { re: /^\/api\/cot\/markets$/, maxAge: 3600 },
  { re: /^\/api\/contracts\/[^/]+\/calendar-rule$/, maxAge: 3600 },
  { re: /^\/api\/macro\/(overview|eia|wasde)$/, maxAge: 60 },
];

export function apiCacheHints() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'GET' || req.headers.authorization || req.headers.cookie) return next();
    const rule = API_CACHE_RULES.find((r) => r.re.test(req.path));
    if (!rule) return next();
    res.setHeader('Cache-Control', `private, max-age=${rule.maxAge}`);
    const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => Response;
    res.writeHead = ((status: number, ...rest: unknown[]) => {
      // Never cache errors; keep a handler's own explicit policy if it changed it.
      if (status >= 400 && res.getHeader('Cache-Control') === `private, max-age=${rule.maxAge}`) {
        res.setHeader('Cache-Control', 'no-store');
      }
      return writeHead(status, ...rest);
    }) as Response['writeHead'];
    next();
  };
}
