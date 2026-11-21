/**
 * T76 - benchmark reference series (not contract prices).
 *   GET /api/benchmarks                -> { items: [{ instrumentId, symbol, seriesId, label, frequency }] }
 *   GET /api/benchmarks/:instrumentId  -> BenchmarkSeries (200; `points` empty + `reason` when upstream is unreadable) | 404 if no mapping
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { BenchmarkSeriesService } from '../services/benchmarkSeries.ts';

export type BenchmarkServiceLike = Pick<BenchmarkSeriesService, 'get' | 'list'>;

export function registerBenchmarkRoutes(app: Express, deps: { service?: BenchmarkServiceLike } = {}): void {
  let instance: BenchmarkServiceLike | null = deps.service ?? null;
  const svc = (): BenchmarkServiceLike => (instance ??= new BenchmarkSeriesService());

  app.get('/api/benchmarks', (_req: Request, res: Response) => {
    res.json({ items: svc().list() });
  });
  app.get('/api/benchmarks/:instrumentId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const series = await svc().get(String(req.params.instrumentId));
      if (!series) {
        res.status(404).json({ error: 'NO_BENCHMARK', message: 'Mã này không có chuỗi giá tham chiếu.' });
        return;
      }
      res.json(series);
    } catch (err) {
      next(err);
    }
  });
}
