/** T91 - GET /api/news?instrument=CBOT:ZC&limit=5 -> NewsResponse. Register before the `/api` 404 handler. */
import type { Express, NextFunction, Request, Response } from 'express';
import { NewsService, type ManualNews } from '../services/news/service.ts';
import { createNewsSummarizer } from '../services/news/summarizer.ts';

export interface NewsRouteDeps {
  service?: Pick<NewsService, 'getNews'>;
  manual?: () => ManualNews[];
}

export function registerNewsRoutes(app: Express, deps: NewsRouteDeps = {}): void {
  let instance = deps.service ?? null;
  app.get('/api/news', async (req: Request, res: Response, next: NextFunction) => {
    try {
      instance ??= new NewsService({ manual: deps.manual, summarizer: createNewsSummarizer() });
      const instrument = typeof req.query.instrument === 'string' ? req.query.instrument.slice(0, 40) : undefined;
      const limit = Number(req.query.limit);
      res.json(await instance.getNews({ instrument, limit: Number.isFinite(limit) ? limit : undefined }));
    } catch (err) {
      next(err);
    }
  });
}
