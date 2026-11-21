/**
 * Vietnam domestic prices.
 *
 *   GET  /api/domestic-prices        → overview (latest per commodity + 90-day history + basis vs international)
 *   POST /api/domestic-prices        → body { entries: [...] } or { csv: "..." }; every entry needs source + sourceUrl + date
 *
 * Data is MANUAL/CSV-entered (no automatic scraper: see docs/VN_DOMESTIC_PRICES.md).
 * Must be registered before the app's `/api` 404 handler.
 */
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { parseDomesticCsv, validateDomesticEntry, type DomesticPricePoint } from '../../src/shared/domestic/basis.ts';
import { SqliteDomesticRepository, type DomesticRepositoryLike } from '../domestic/repository.ts';
import { buildDomesticOverview, type DomesticServiceDeps } from '../domestic/service.ts';

export interface DomesticRouteDeps {
  repo?: DomesticRepositoryLike;
  candles?: DomesticServiceDeps['candles'];
  macro?: DomesticServiceDeps['macro'];
  now?: () => Date;
}

export function registerDomesticRoutes(app: Express, deps: DomesticRouteDeps = {}): void {
  let repo: DomesticRepositoryLike | null = deps.repo ?? null;
  const getRepo = (): DomesticRepositoryLike => (repo ??= new SqliteDomesticRepository());
  const json = express.json({ limit: '1mb' });

  app.get('/api/domestic-prices', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await buildDomesticOverview({ repo: getRepo(), candles: deps.candles, macro: deps.macro, now: deps.now }));
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/domestic-prices', json, (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as { entries?: unknown; csv?: unknown };
      const points: DomesticPricePoint[] = [];
      const errors: Array<{ line: number; error: string }> = [];
      if (typeof body.csv === 'string') {
        const r = parseDomesticCsv(body.csv);
        points.push(...r.points);
        errors.push(...r.errors);
      } else if (Array.isArray(body.entries)) {
        body.entries.forEach((e, i) => {
          const r = validateDomesticEntry((e ?? {}) as Record<string, unknown>);
          if (r.ok) points.push(r.point);
          else errors.push({ line: i + 1, error: r.error });
        });
      } else {
        res.status(400).json({ error: 'Provide { entries: [...] } or { csv: "..." }' });
        return;
      }
      if (errors.length || !points.length) {
        res.status(400).json({ error: 'Invalid entries; nothing was saved.', errors });
        return;
      }
      res.json({ ...getRepo().upsert(points), total: points.length });
    } catch (err) {
      next(err);
    }
  });
}
