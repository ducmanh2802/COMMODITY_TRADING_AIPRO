import zlib from 'node:zlib';
import type { NextFunction, Request, Response } from 'express';

const MIN_BYTES = 2048;

/**
 * Compresses large JSON API responses (brotli/gzip) when the client accepts it. /api/today alone is ~315 KB of JSON,
 * which dominated the returning-user load on mobile networks. Only string JSON bodies (res.json) are touched;
 * streams (SSE), already-encoded responses and small bodies pass through unchanged.
 */
export function apiCompress() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const accept = String(req.headers['accept-encoding'] ?? '');
    const useBr = /\bbr\b/.test(accept);
    if ((!useBr && !/\bgzip\b/.test(accept)) || req.method === 'HEAD') return next();
    const send = res.send.bind(res) as (body?: unknown) => Response;
    res.send = ((body?: unknown): Response => {
      const type = String(res.getHeader('Content-Type') ?? '');
      if (
        typeof body === 'string' &&
        body.length >= MIN_BYTES &&
        type.includes('application/json') &&
        !res.getHeader('Content-Encoding') &&
        !res.headersSent
      ) {
        const raw = Buffer.from(body, 'utf8');
        const out = useBr
          ? zlib.brotliCompressSync(raw, {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
              },
            })
          : zlib.gzipSync(raw, { level: 6 });
        res.setHeader('Content-Encoding', useBr ? 'br' : 'gzip');
        res.vary('Accept-Encoding');
        return send(out);
      }
      return send(body);
    }) as Response['send'];
    next();
  };
}
