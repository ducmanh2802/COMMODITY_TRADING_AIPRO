/**
 * "Đánh giá các mã" scorecard routes:
 *   GET  /api/scorecard                    all instruments (cached ~5 min)
 *   GET  /api/scorecard/:instrumentId      one instrument
 *   POST /api/scorecard/:instrumentId/summary   narrative (rules by default; gemini/ollama per AI_PROVIDER, falls back to rules; cached per scorecard)
 */
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { AiLanguage, AiResearchSummary } from '../../src/shared/types/analysis.ts';
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import type { Scorecard, ScorecardListResponse, ScorecardNarrative, ScorecardNarrativeProvider } from '../../src/shared/types/scorecard.ts';
import { buildNarrative, resolveAiProvider, type OllamaOptions } from '../services/scorecard/narrativeProvider.ts';
import { SCORECARD_DISCLAIMER } from '../services/scorecard/scoring.ts';
import { SCORECARD_TTL_MS, type ScorecardService } from '../services/scorecard/scorecardService.ts';

const Param = z.string().min(1).max(24).regex(/^[a-zA-Z0-9:_-]+$/);
const SummaryBody = z.object({ language: z.enum(['vi', 'en']).default('vi') });

export interface ScorecardRouteDeps {
  service: ScorecardService;
  /** AI_PROVIDER override (default: env, then 'rules'). */
  provider?: ScorecardNarrativeProvider;
  ollama?: OllamaOptions;
  /** Gemini path for one instrument (used only when provider = gemini; failures fall back to rules). */
  summarize?: (inst: InstrumentDefinition, language: AiLanguage) => Promise<AiResearchSummary>;
  rateLimiter?: RequestHandler;
}

export function registerScorecardRoutes(app: Express, deps: ScorecardRouteDeps): void {
  const provider = deps.provider ?? resolveAiProvider();
  const withProvider = (c: Scorecard): Scorecard => ({ ...c, aiProvider: provider });
  // Narrative cache: per instrument + language, valid until the scorecard (generatedAt) changes.
  const narrativeCache = new Map<string, { generatedAt: string; narrative: ScorecardNarrative }>();

  app.get('/api/scorecard', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const scorecards = await deps.service.getAll();
      const body: ScorecardListResponse = {
        generatedAt: new Date().toISOString(),
        cacheTtlSeconds: SCORECARD_TTL_MS / 1000,
        count: scorecards.length,
        scorecards: scorecards.map(withProvider),
        disclaimer: SCORECARD_DISCLAIMER,
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/scorecard/:instrumentId', async (req: Request, res: Response, next: NextFunction) => {
    const id = Param.safeParse(req.params.instrumentId);
    if (!id.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid instrumentId parameter.' });
      return;
    }
    try {
      const inst = await deps.service.find(id.data);
      if (!inst) {
        res.status(404).json({ error: 'INSTRUMENT_NOT_FOUND', message: `Instrument ${id.data} is not registered.` });
        return;
      }
      res.json(withProvider(await deps.service.get(inst)));
    } catch (err) {
      next(err);
    }
  });

  const limiter: RequestHandler = deps.rateLimiter ?? ((_req, _res, next) => next());
  app.post('/api/scorecard/:instrumentId/summary', limiter, async (req: Request, res: Response, next: NextFunction) => {
    const id = Param.safeParse(req.params.instrumentId);
    const body = SummaryBody.safeParse(req.body ?? {});
    if (!id.success || !body.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid request.' });
      return;
    }
    try {
      const inst = await deps.service.find(id.data);
      if (!inst) {
        res.status(404).json({ error: 'INSTRUMENT_NOT_FOUND', message: `Instrument ${id.data} is not registered.` });
        return;
      }
      const card = await deps.service.get(inst);
      const key = `${inst.id}|${body.data.language}|${provider}`;
      let hit = narrativeCache.get(key);
      if (!hit || hit.generatedAt !== card.generatedAt) {
        const language = body.data.language;
        const narrative = await buildNarrative(card, language, {
          provider,
          inst,
          ollama: deps.ollama,
          gemini: deps.summarize ? (l) => deps.summarize!(inst, l) : undefined,
        });
        hit = { generatedAt: card.generatedAt, narrative };
        narrativeCache.set(key, hit);
      }
      res.json({ narrative: hit.narrative, provider: hit.narrative.provider, generatedAt: hit.narrative.generatedAt });
    } catch (err) {
      next(err);
    }
  });
}
