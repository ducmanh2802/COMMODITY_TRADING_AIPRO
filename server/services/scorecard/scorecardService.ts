/**
 * Scorecard service: composes quote, D1 history (stored first, Yahoo UNOFFICIAL fallback), the technical
 * engine, shared analytics and COT into per-dimension descriptive labels (see ./scoring.ts).
 * Results are cached ~5 minutes per instrument. Never fabricates; missing inputs → UNAVAILABLE.
 */
import type { Scorecard, ScorecardDimension, ScorecardDimensionId } from '../../../src/shared/types/scorecard.ts';
import type { BriefText } from '../../../src/shared/types/brief.ts';
import type { InstrumentDefinition } from '../../../src/shared/types/instrument.ts';
import type { MarketCandle, MarketQuote } from '../../../src/shared/types/market.ts';
import { seasonality } from '../../../src/shared/analytics/seasonality.ts';
import { realizedVolatility } from '../../../src/shared/analytics/volatility.ts';
import { analyzeTechnicalSnapshot, calculateSMA } from '../../engines/technicalEngine.ts';
import { loadEngineCandles } from '../engineCandles.ts';
import { cotInput, qualityFromSource, type BriefDeps } from '../brief/briefService.ts';
import type { CotInput } from '../brief/templates.ts';
import {
  SCORECARD_DISCLAIMER,
  overallTrendClarity,
  overallVolatilityRisk,
  scoreCot,
  scoreDataQuality,
  scoreDrawdown,
  scoreMomentum,
  scoreSeasonality,
  scoreTrend,
  scoreVolatility,
} from './scoring.ts';
import { generateRulesNarrative } from './narrative.ts';
import { computeValuationStats, scoreValuation } from './valuation.ts';

export const SCORECARD_TTL_MS = 5 * 60_000;
const HISTORY_TTL_MS = 30 * 60_000;
const HISTORY_FAIL_TTL_MS = 5 * 60_000;

export interface ScorecardDeps extends Omit<BriefDeps, 'findInstrument'> {
  findInstrument: BriefDeps['findInstrument'];
  listInstruments: () => Promise<InstrumentDefinition[]>;
}

export interface ScorecardHistory {
  candles: MarketCandle[];
  origin: Scorecard['dataQuality']['historyOrigin'];
  source: string | null;
  quality: string | null;
}

export interface ScorecardInputs {
  inst: InstrumentDefinition;
  quote: MarketQuote | null;
  quoteError?: string | null;
  history: ScorecardHistory;
  cot: CotInput;
  now: Date;
}

const t = (vi: string, en: string): BriefText => ({ vi, en });

/** Pure: builds a scorecard from already-loaded inputs (unit-testable, offline). */
export function computeScorecard(x: ScorecardInputs): Scorecard {
  const { inst, quote, history, now } = x;
  const bars = history.candles.filter((c) => c.isComplete !== false);
  const closes = bars.map((c) => c.close);
  const n = closes.length;
  const lastBar = n > 0 ? bars[n - 1] : null;
  const src = history.source ?? 'NONE';
  const asOf = lastBar ? lastBar.timestamp.slice(0, 10) : null;

  const sma50s = n >= 50 ? calculateSMA(closes, 50) : [];
  const sma200s = n >= 200 ? calculateSMA(closes, 200) : [];
  const sma50 = sma50s[n - 1] ?? null;
  const sma200 = sma200s[n - 1] ?? null;
  const sma50Prev = n >= 70 ? (sma50s[n - 21] ?? null) : null;
  const snap = n >= 15 ? analyzeTechnicalSnapshot(bars, inst.exchangeSymbol, inst.exchange, 'D1') : null;
  const close = lastBar?.close ?? null;
  const ret20 = n > 20 && closes[n - 21] > 0 ? closes[n - 1] / closes[n - 21] - 1 : null;
  const range = bars.slice(-252);
  const high52w = range.length > 0 ? Math.max(...range.map((b) => b.high)) : null;

  let vol20: number | null = null;
  let volHistory: number[] = [];
  if (n >= 21) {
    const rv = realizedVolatility(bars.map((b) => ({ t: b.timestamp, v: b.close })), { window: 20 });
    if (rv.status === 'OK') {
      const vals = rv.values.filter((v): v is number => v !== null);
      vol20 = rv.values[rv.values.length - 1] ?? null;
      volHistory = vals.slice(-252);
    }
  }

  // Seasonality (>= 3 years of history).
  const years = n >= 2 ? (Date.parse(bars[n - 1].timestamp) - Date.parse(bars[0].timestamp)) / (365.25 * 86_400_000) : 0;
  const month = now.getUTCMonth() + 1;
  let seasonIn = { ok: false, yearsCovered: 0, month, count: 0, mean: null as number | null, pctPositive: null as number | null, source: src, asOf };
  if (years >= 3) {
    const s = seasonality(bars.map((b) => ({ t: b.timestamp, v: b.close })), { minYears: 3 });
    const m = s.status === 'OK' ? s.months.find((mm) => mm.month === month) : undefined;
    if (s.status === 'OK' && m && m.count > 0) {
      seasonIn = { ...seasonIn, ok: true, yearsCovered: s.yearsCovered, count: m.count, mean: m.mean, pctPositive: m.pctPositive };
    }
  }

  const trend = scoreTrend({ close, sma50, sma200, sma50Prev, source: src, asOf });
  const momentum = scoreMomentum({ rsi14: snap?.rsi14 ?? null, ret20, source: src, asOf });
  const volatility = scoreVolatility({ vol20, volHistory, source: src, asOf });
  const drawdown = scoreDrawdown({ close, high52w, bars: range.length, source: src, asOf });
  const cot = scoreCot({
    available: x.cot.available,
    reason: x.cot.reason,
    cotIndex: x.cot.cotIndex,
    cotIndexWeeks: x.cot.cotIndexWeeks,
    mmNetPctOi: x.cot.mmNetPctOi,
    reportDate: x.cot.reportDate,
    stale: x.cot.stale,
    source: x.cot.source,
  });
  const season = scoreSeasonality(seasonIn);
  const valuation = scoreValuation(computeValuationStats(bars), src, asOf);
  const dimensions: ScorecardDimension[] = [trend, momentum, volatility, drawdown, cot, season, valuation];

  // Price: live quote when present, else last stored close labelled HISTORICAL.
  const hasQuote = quote !== null && quote.price !== null;
  let price: Scorecard['price'];
  if (hasQuote && quote) {
    price = {
      value: quote.price,
      status: quote.status,
      source: quote.source,
      sourceQuality: quote.sourceQuality ?? qualityFromSource(quote.source, 'LICENSED_VENDOR'),
      asOf: quote.timestamp,
      changePct: null,
      note: quote.statusReason ?? null,
    };
  } else if (lastBar) {
    price = { value: lastBar.close, status: 'HISTORICAL', source: src, sourceQuality: history.quality, asOf: lastBar.timestamp, changePct: null, note: x.quoteError ?? quote?.statusReason ?? null };
  } else {
    price = { value: null, status: 'UNAVAILABLE', source: quote?.source ?? 'NONE', sourceQuality: null, asOf: null, changePct: null, note: x.quoteError ?? quote?.statusReason ?? 'No quote and no stored history.' };
  }
  // Day change only from two stored closes (never invented): last close vs previous close, when price is the last bar.
  if (price.status === 'HISTORICAL' && n >= 2 && closes[n - 2] > 0) price.changePct = closes[n - 1] / closes[n - 2] - 1;

  const used = dimensions.filter((d) => d.status === 'OK').map((d) => d.id);
  const excluded = dimensions.filter((d) => d.status !== 'OK').map((d) => d.id) as ScorecardDimensionId[];
  const dq = scoreDataQuality({ quotePrice: hasQuote && quote ? quote.price : null, quoteStatus: quote?.status ?? 'UNAVAILABLE', historyBars: n });

  const card: Scorecard = {
    instrumentId: inst.id,
    exchangeSymbol: inst.exchangeSymbol,
    productName: inst.productName,
    vietnameseName: inst.commodityProfile?.vietnameseName ?? null,
    category: inst.category,
    generatedAt: now.toISOString(),
    price,
    dimensions,
    overall: {
      trendClarity: overallTrendClarity(trend, momentum),
      volatilityRisk: overallVolatilityRisk(volatility, drawdown),
      dimensionsUsed: used,
      dimensionsExcluded: excluded,
    },
    dataQuality: {
      ...dq,
      quoteStatus: quote?.status ?? 'UNAVAILABLE',
      quoteSource: quote?.source ?? 'NONE',
      historyOrigin: history.origin,
      historySource: history.source,
      historyQuality: history.quality,
      historyBars: n,
      historyFrom: bars[0]?.timestamp.slice(0, 10) ?? null,
      historyTo: asOf,
    },
    disclaimer: SCORECARD_DISCLAIMER,
  };
  card.narrative = generateRulesNarrative(card, inst, now);
  return card;
}

export class ScorecardService {
  private readonly cache = new Map<string, { expiresAt: number; value: Scorecard }>();
  private readonly inflight = new Map<string, Promise<Scorecard>>();
  private readonly historyCache = new Map<string, { expiresAt: number; value: ScorecardHistory }>();

  constructor(private readonly deps: ScorecardDeps) {}

  clearCache(): void {
    this.cache.clear();
    this.historyCache.clear();
  }

  async history(inst: InstrumentDefinition): Promise<ScorecardHistory> {
    const nowMs = (this.deps.now ?? (() => new Date()))().getTime();
    const hit = this.historyCache.get(inst.id);
    if (hit && hit.expiresAt > nowMs) return hit.value;
    const value = await this.loadHistory(inst);
    this.historyCache.set(inst.id, { expiresAt: nowMs + (value.candles.length >= 2 ? HISTORY_TTL_MS : HISTORY_FAIL_TTL_MS), value });
    return value;
  }

  private async loadHistory(inst: InstrumentDefinition): Promise<ScorecardHistory> {
    const engine = await loadEngineCandles(this.deps.candles, inst, 'D1');
    if (engine.candles.length >= 2) {
      const source = engine.meta?.source ?? engine.candles[engine.candles.length - 1].source;
      return { candles: engine.candles, origin: engine.origin === 'SQLITE' ? 'SQLITE' : 'MEMORY', source, quality: qualityFromSource(source, 'USER_PROVIDED') };
    }
    if (this.deps.fetchHistory) {
      try {
        const y = await this.deps.fetchHistory(inst);
        if (y && y.candles.length >= 2) {
          return { candles: y.candles, origin: 'YAHOO', source: y.candles[y.candles.length - 1].source || 'YAHOO_UNOFFICIAL', quality: 'UNOFFICIAL' };
        }
      } catch {
        // fall through: no history
      }
    }
    return { candles: [], origin: 'NONE', source: null, quality: null };
  }

  async get(inst: InstrumentDefinition): Promise<Scorecard> {
    const now = (this.deps.now ?? (() => new Date()))();
    const hit = this.cache.get(inst.id);
    if (hit && hit.expiresAt > now.getTime()) return hit.value;
    const pending = this.inflight.get(inst.id);
    if (pending) return pending;
    const p = (async () => {
      let quote: MarketQuote | null = null;
      let quoteError: string | null = null;
      try {
        quote = await this.deps.getQuote(inst);
      } catch (err) {
        quoteError = err instanceof Error ? err.message : 'quote failed';
      }
      const history = await this.history(inst);
      let cot: CotInput;
      try {
        cot = cotInput(this.deps as unknown as BriefDeps, inst, now);
      } catch {
        cot = { available: false, reason: t('Không đọc được COT.', 'COT could not be read.'), reportDate: null, expectedReleaseDate: null, openInterest: null, mmNet: null, mmNetPctOi: null, mmChange: null, cotIndex: null, cotIndexWeeks: null, producerNet: null, stale: false, source: 'CFTC COT', weeksStored: 0 };
      }
      const value = computeScorecard({ inst, quote, quoteError, history, cot, now });
      this.cache.set(inst.id, { expiresAt: now.getTime() + SCORECARD_TTL_MS, value });
      return value;
    })().finally(() => this.inflight.delete(inst.id));
    this.inflight.set(inst.id, p);
    return p;
  }

  async getAll(): Promise<Scorecard[]> {
    const list = await this.deps.listInstruments();
    const out: Scorecard[] = new Array(list.length);
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await this.get(list[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, list.length) }, worker));
    return out;
  }

  async find(idOrSymbol: string): Promise<InstrumentDefinition | null> {
    return (await this.deps.findInstrument(idOrSymbol)) ?? null;
  }
}

