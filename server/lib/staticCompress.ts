import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { NextFunction, Request, Response } from 'express';

/**
 * Serves pre-compressed (brotli/gzip) copies of the built SPA's text assets (js/css/svg/json/html).
 * Compressed bodies are computed once per file (keyed by mtime) and kept in memory. Falls through to
 * express.static for everything else (images, fonts, missing files, clients without br/gzip support).
 */
const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

interface Entry {
  mtimeMs: number;
  etag: string;
  br: Buffer;
  gz: Buffer;
}

export function staticCompress(root: string) {
  const cache = new Map<string, Entry>();
  const rootResolved = path.resolve(root);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const accept = String(req.headers['accept-encoding'] ?? '');
    const useBr = /\bbr\b/.test(accept);
    if (!useBr && !/\bgzip\b/.test(accept)) return next();
    let rel: string;
    try {
      rel = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    if (rel.endsWith('/')) return next();
    const ext = path.extname(rel).toLowerCase();
    const type = TYPES[ext];
    if (!type || (ext === '.json' && rel.startsWith('/api/'))) return next();
    const file = path.resolve(rootResolved, '.' + rel);
    if (!file.startsWith(rootResolved + path.sep)) return next();
    let st: fs.Stats;
    try {
      st = fs.statSync(file);
    } catch {
      return next();
    }
    if (!st.isFile() || st.size < 1024) return next();
    let entry = cache.get(file);
    if (!entry || entry.mtimeMs !== st.mtimeMs) {
      const raw = fs.readFileSync(file);
      entry = {
        mtimeMs: st.mtimeMs,
        etag: `W/"${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`,
        br: zlib.brotliCompressSync(raw, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length },
        }),
        gz: zlib.gzipSync(raw, { level: 9 }),
      };
      cache.set(file, entry);
    }
    const body = useBr ? entry.br : entry.gz;
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Encoding', useBr ? 'br' : 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('ETag', entry.etag + (useBr ? '-br' : '-gz'));
    // Vite emits content-hashed names under /assets: safe to cache forever. Everything else must revalidate.
    res.setHeader('Cache-Control', rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0');
    if (req.headers['if-none-match'] === res.getHeader('ETag')) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Length', body.length);
    res.status(200);
    if (req.method === 'HEAD') res.end();
    else res.end(body);
  };
}
