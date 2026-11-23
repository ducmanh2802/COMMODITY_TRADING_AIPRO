import type { Express, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import type { InstrumentDefinition } from '../../src/shared/types/instrument.ts';
import { CONTINUOUS_CONTRACT_CODE, type DatasetRecord, type ICandleRepository } from '../storage/candleRepository.ts';
import { YAHOO_HISTORY_CONTRACT_CODE } from '../services/yahooHistory.ts';
import { summarizeSessions, type SessionSeries, type SessionSourceTimeframe } from '../services/sessions/sessionSummary.ts';

export interface SessionRoutesDeps {
  findInstrument: (idOrSymbol: string) => Promise<InstrumentDefinition | null>;
  candles: ICandleRepository;
  now?: () => number;
}

const ParamsSchema = z.object({ symbol: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9:_-]+$/) });
const QuerySchema = z.object({ count: z.coerce.number().int().min(1).max(60).default(20) });

/** Daily bars needed for ATR context behind the listed sessions. */
const DAILY_LIMIT = 400;
const INTRADAY_LIMIT = 20_000;

async function loadSeries(
  repo: ICandleRepository,
  inst: InstrumentDefinition,
  timeframe: SessionSourceTimeframe,
  limit: number
): Promise<SessionSeries | null> {
  // CSV (CONTINUOUS) is canonical; Yahoo UNOFFICIAL is the fallback, same precedence as the engines.
  for (const contractCode of [CONTINUOUS_CONTRACT_CODE, YAHOO_HISTORY_CONTRACT_CODE]) {
    const { rows } = await repo.queryCandles({ instrumentId: inst.id, contractCode, timeframe }, { limit });
    if (rows.length === 0) continue;
    const datasets: DatasetRecord[] = (await repo.listDatasets({ instrumentId: inst.id })).filter(
      (d) => d.contractCode === contractCode && d.timeframe === timeframe
    );
    const labels = [...new Set(datasets.map((d) => `${d.sourceLabel} (${d.sourceQuality})`))];
    return {
      timeframe,
      source: `${labels.join(' | ') || contractCode} ${timeframe}`,
      bars: rows.map((r) => ({
        timestampMs: r.timestampMs,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      })),
    };
  }
  return null;
}

/** GET /api/market/sessions/:symbol?count=20 - per-trading-session summary, intraday-first, never invented. */
export function registerSessionRoutes(app: Express, deps: SessionRoutesDeps): void {
  app.get('/api/market/sessions/:symbol', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const p = ParamsSchema.safeParse(req.params);
      const q = QuerySchema.safeParse(req.query);
      if (!p.success || !q.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid symbol or count (1-60).',
          details: [...(p.success ? [] : p.error.issues), ...(q.success ? [] : q.error.issues)],
        });
        return;
      }
      const inst = await deps.findInstrument(p.data.symbol);
      if (!inst) {
        res.status(404).json({ error: 'INSTRUMENT_NOT_FOUND', message: `Instrument ${p.data.symbol} is not registered.` });
        return;
      }
      const nowMs = (deps.now ?? Date.now)();
      const [m15, h1, d1] = await Promise.all([
        loadSeries(deps.candles, inst, 'M15', INTRADAY_LIMIT),
        loadSeries(deps.candles, inst, 'H1', INTRADAY_LIMIT),
        loadSeries(deps.candles, inst, 'D1', DAILY_LIMIT),
      ]);
      const intraday = [m15, h1].filter((s): s is SessionSeries => s !== null);
      const sessions = summarizeSessions({
        instrument: inst,
        intraday,
        daily: d1,
        count: q.data.count,
        nowMs,
      });
      const used = new Set(sessions.map((s) => s.timeframe));
      res.json({
        retrievedAt: new Date(nowMs).toISOString(),
        instrumentId: inst.id,
        symbol: inst.exchangeSymbol,
        exchange: inst.exchange,
        priceUnit: inst.specification.quotationUnit,
        requestedCount: q.data.count,
        count: sessions.length,
        status: sessions.length === 0 ? 'UNAVAILABLE' : sessions.length < q.data.count ? 'PARTIAL' : 'HISTORICAL',
        reason:
          sessions.length === 0
            ? 'DATA_UNAVAILABLE - no stored intraday or daily candles for this instrument.'
            : sessions.length < q.data.count
              ? `Only ${sessions.length} session(s) stored; missing sessions are not invented.`
              : undefined,
        sourcesUsed: [...used],
        note:
          'Session = exchange trading day (overnight Globex/electronic sessions belong to the next day). Intraday bars preferred (M15, then H1); the earliest session of an intraday series is skipped as possibly partial; D1 fills older sessions (fromDaily). gapWeekdaysBefore counts weekdays without a session (exchange holidays or missing data).',
        sessions,
      });
    } catch (err) {
      next(err);
    }
  });
}
