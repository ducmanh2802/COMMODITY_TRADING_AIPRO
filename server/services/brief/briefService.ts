/**
 * Composes the "Phân tích chi tiết" brief for one instrument from EXISTING engines/services only:
 * ProviderRegistry quote, engine candles (SQLite / in-memory) with a Yahoo UNOFFICIAL daily fallback,
 * technicalEngine indicators, shared analytics (volatility, drawdown, seasonality), CFTC COT, the
 * contract chain and the Instrument Master. All sentences come from ./templates.ts (pure, tested).
 *
 * Never fabricates: every missing input stays null and the section says so.
 */
import type { AnalysisBrief, BriefFactQuality, BriefText } from '../../../src/shared/types/brief.ts';
import type { InstrumentDefinition } from '../../../src/shared/types/instrument.ts';
import type { DataQualityStatus, MarketCandle, MarketQuote } from '../../../src/shared/types/market.ts';
import { buildContractChain } from '../../../src/shared/contracts/chain.ts';
import { parseContractCode } from '../../../src/shared/contracts/monthCodes.ts';
import { buildTermStructure } from '../../../src/shared/contracts/termStructure.ts';
import { drawdown } from '../../../src/shared/analytics/returns.ts';
import { seasonality } from '../../../src/shared/analytics/seasonality.ts';
import { realizedVolatility } from '../../../src/shared/analytics/volatility.ts';
import { median } from '../../../src/shared/analytics/core.ts';
import type { CotReportType } from '../../../src/shared/cot/analytics.ts';
import { analyzeTechnicalSnapshot, calculateSMA } from '../../engines/technicalEngine.ts';
import { getCotMapping } from '../../cot/mapping.ts';
import type { CotService } from '../../cot/service.ts';
import { VENDOR_CONTRACT_PREFIX } from '../../providers/syncPersistence.ts';
import { CONTINUOUS_CONTRACT_CODE, type ICandleRepository } from '../../storage/candleRepository.ts';
import { CONTRACT_CALENDAR_RULES } from '../instrumentRegistry.ts';
import { loadEngineCandles } from '../engineCandles.ts';
import {
  BRIEF_DISCLAIMER,
  buildContractSection,
  buildCotSection,
  buildMissingSection,
  buildMomentumSection,
  buildPriceSection,
  buildRiskSection,
  buildSeasonalitySection,
  buildSummary,
  buildTermStructureSection,
  buildTrendSection,
  decimalsForTick,
  type BuiltSection,
  type CotInput,
  type SeasonalMonth,
  type TermStructureInput,
} from './templates.ts';

export type HistoryFetcher = (
  instrument: InstrumentDefinition
) => Promise<{ candles: MarketCandle[]; status: DataQualityStatus; reason?: string } | null>;

export interface BriefDeps {
  findInstrument: (idOrSymbol: string) => Promise<InstrumentDefinition | null | undefined>;
  getQuote: (instrument: InstrumentDefinition) => Promise<MarketQuote>;
  candles: ICandleRepository | null;
  /** Daily-history fallback (Yahoo UNOFFICIAL) when no stored D1 series exists; null → none. */
  fetchHistory?: HistoryFetcher | null;
  /** COT reader; null → COT not looked up. */
  getCot?: () => Pick<CotService, 'query'> | null;
  now?: () => Date;
}

const QUALITIES: BriefFactQuality[] = ['OFFICIAL', 'LICENSED_VENDOR', 'UNOFFICIAL', 'USER_PROVIDED'];

function qualityFromSource(source: string | null | undefined, fallback: BriefFactQuality): BriefFactQuality {
  if (!source) return fallback;
  const m = /\((OFFICIAL|LICENSED_VENDOR|UNOFFICIAL|USER_PROVIDED)\)/.exec(source);
  return m && QUALITIES.includes(m[1] as BriefFactQuality) ? (m[1] as BriefFactQuality) : fallback;
}

function localDate(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** Trading date the quote belongs to (so the "previous close" is the bar before it). */
export function quoteSessionDate(quote: MarketQuote, timeZone: string): string | null {
  if (quote.price === null) return null;
  if (quote.status === 'HISTORICAL') return quote.timestamp ? quote.timestamp.slice(0, 10) : null;
  const end = quote.tradingPeriod?.end;
  if (typeof end === 'number' && end > 0) return localDate(end * 1000, timeZone);
  return quote.timestamp ? localDate(Date.parse(quote.timestamp), timeZone) : null;
}

const HISTORY_TTL_MS = 30 * 60_000;
const HISTORY_FAIL_TTL_MS = 5 * 60_000;
const historyCache = new Map<string, { expiresAt: number; value: Awaited<ReturnType<HistoryFetcher>> }>();

async function cachedHistory(fetcher: HistoryFetcher, inst: InstrumentDefinition, nowMs: number) {
  const hit = historyCache.get(inst.id);
  if (hit && hit.expiresAt > nowMs) return hit.value;
  let value: Awaited<ReturnType<HistoryFetcher>> = null;
  try {
    value = await fetcher(inst);
  } catch (err) {
    value = { candles: [], status: 'UNAVAILABLE', reason: err instanceof Error ? err.message : 'history fetch failed' };
  }
  const ok = Boolean(value && value.candles.length > 0);
  historyCache.set(inst.id, { expiresAt: nowMs + (ok ? HISTORY_TTL_MS : HISTORY_FAIL_TTL_MS), value });
  return value;
}

/** Clears the Yahoo history cache (tests). */
export function clearBriefHistoryCache(): void {
  historyCache.clear();
}

interface HistoryInfo {
  candles: MarketCandle[];
  origin: AnalysisBrief['history']['origin'];
  source: string | null;
  quality: BriefFactQuality | null;
  note: string | null;
}

async function loadHistory(deps: BriefDeps, inst: InstrumentDefinition, nowMs: number): Promise<HistoryInfo> {
  const engine = await loadEngineCandles(deps.candles, inst, 'D1');
  const complete = engine.candles.filter((c) => c.isComplete !== false);
  if (complete.length >= 2) {
    const source = engine.meta?.source ?? complete[complete.length - 1].source;
    return {
      candles: complete,
      origin: engine.origin === 'SQLITE' ? 'SQLITE' : 'MEMORY',
      source,
      quality: qualityFromSource(source, 'USER_PROVIDED'),
      note: engine.meta?.warnings?.join(' ') || null,
    };
  }
  if (deps.fetchHistory) {
    const y = await cachedHistory(deps.fetchHistory, inst, nowMs);
    if (y && y.candles.length >= 2) {
      return {
        candles: y.candles.filter((c) => c.isComplete !== false),
        origin: 'YAHOO',
        source: y.candles[y.candles.length - 1].source || 'YAHOO_UNOFFICIAL',
        quality: 'UNOFFICIAL',
        note: y.reason ?? null,
      };
    }
    return { candles: [], origin: 'NONE', source: null, quality: null, note: y?.reason ?? engine.reason ?? null };
  }
  return { candles: [], origin: 'NONE', source: null, quality: null, note: engine.reason ?? null };
}

const txt = (vi: string, en: string): BriefText => ({ vi, en });

function cotInput(deps: BriefDeps, inst: InstrumentDefinition, now: Date): CotInput {
  const empty = (reason: BriefText): CotInput => ({
    available: false,
    reason,
    reportDate: null,
    expectedReleaseDate: null,
    openInterest: null,
    mmNet: null,
    mmNetPctOi: null,
    mmChange: null,
    cotIndex: null,
    cotIndexWeeks: null,
    producerNet: null,
    stale: false,
    source: 'CFTC COT',
    weeksStored: 0,
  });
  const mapping = getCotMapping(inst.id);
  if (!mapping || mapping.status !== 'REPORTED' || mapping.reportTypes.length === 0) {
    return empty(
      txt(
        'CFTC (Mỹ) không công bố báo cáo COT cho hợp đồng này (ví dụ sàn ICE châu Âu, SGX, MXV), nên không có dữ liệu vị thế dòng tiền lớn.',
        'The US CFTC does not publish a COT report for this contract (e.g. ICE Europe, SGX, MXV), so there is no large-trader positioning data.'
      )
    );
  }
  const service = deps.getCot?.() ?? null;
  if (!service) return empty(txt('Kho dữ liệu COT chưa sẵn sàng trên máy chủ.', 'The COT store is not available on the server.'));
  const reportType: CotReportType = mapping.reportTypes.includes('DISAGGREGATED') ? 'DISAGGREGATED' : mapping.reportTypes[0];
  try {
    const base = service.query(inst.id, { reportType, lookbackWeeks: 156, maxMissingWeeks: 8 });
    const latest = base.analytics.latest;
    if (base.rows.length === 0 || !latest) {
      return empty(
        txt(
          `Chưa đồng bộ dữ liệu COT cho ${inst.exchangeSymbol}. Vào trang "COT" và bấm Đồng bộ để tải báo cáo từ CFTC.`,
          `No COT data synced for ${inst.exchangeSymbol} yet. Open the "COT" page and press Sync to download CFTC reports.`
        )
      );
    }
    const cats = latest.categories as Record<string, { net: number; netPctOi: number | null; netChangeWoW: number | null; cotIndex: number | null } | undefined>;
    const spec = reportType === 'DISAGGREGATED' ? 'managedMoney' : 'nonCommercial';
    const hedger = reportType === 'DISAGGREGATED' ? 'producerMerchant' : 'commercial';
    let cotIndex = cats[spec]?.cotIndex ?? null;
    let weeks: number | null = cotIndex !== null ? 156 : null;
    for (const [w, miss] of [
      [52, 4],
      [26, 2],
    ] as const) {
      if (cotIndex !== null) break;
      const alt = service.query(inst.id, { reportType, lookbackWeeks: w, maxMissingWeeks: miss });
      const v = (alt.analytics.latest?.categories as typeof cats | undefined)?.[spec]?.cotIndex ?? null;
      if (v !== null) {
        cotIndex = v;
        weeks = w;
      }
    }
    const ageDays = (now.getTime() - Date.parse(`${latest.reportDate}T00:00:00Z`)) / 86_400_000;
    return {
      available: true,
      reason: null,
      reportDate: latest.reportDate,
      expectedReleaseDate: latest.expectedReleaseDate ?? null,
      openInterest: latest.openInterest ?? null,
      mmNet: cats[spec]?.net ?? null,
      mmNetPctOi: cats[spec]?.netPctOi ?? null,
      mmChange: cats[spec]?.netChangeWoW ?? null,
      cotIndex,
      cotIndexWeeks: weeks,
      producerNet: cats[hedger]?.net ?? null,
      stale: ageDays > 17,
      source: `CFTC COT ${reportType === 'DISAGGREGATED' ? 'Disaggregated' : 'Legacy'} (${base.provenance.sources[0] ?? 'cftc.gov'})`,
      weeksStored: base.rows.length,
    };
  } catch (err) {
    return empty(
      txt(
        `Không đọc được dữ liệu COT: ${err instanceof Error ? err.message : 'lỗi không rõ'}.`,
        `Could not read COT data: ${err instanceof Error ? err.message : 'unknown error'}.`
      )
    );
  }
}

async function termStructureInput(
  deps: BriefDeps,
  inst: InstrumentDefinition,
  asOf: string,
  decimals: number
): Promise<TermStructureInput> {
  const base: TermStructureInput = {
    available: false,
    reason: null,
    shape: null,
    valuationDate: null,
    points: [],
    unit: inst.specification.quotationUnit,
    decimals,
    source: 'Imported per-contract D1 datasets',
    quality: 'USER_PROVIDED',
  };
  if (!deps.candles) return base;
  const datasets = (await deps.candles.listDatasets({ instrumentId: inst.id })).filter(
    (d) => d.timeframe === 'D1' && d.contractCode !== CONTINUOUS_CONTRACT_CODE && !d.contractCode.startsWith(VENDOR_CONTRACT_PREFIX)
  );
  const codes = [...new Set(datasets.map((d) => d.contractCode))];
  if (codes.length < 2) return base;

  const mxv = inst.mxvMapping;
  const chain = buildContractChain({
    instrumentId: inst.id,
    root: inst.exchangeSymbol,
    mxvRoot: mxv && mxv.mappingStatus === 'VERIFIED' ? mxv.mxvSymbol : null,
    asOf,
    count: 24,
    calendarStatus: CONTRACT_CALENDAR_RULES[inst.id]?.verificationStatus ?? 'UNVERIFIED',
  });
  if (chain.status !== 'OK') return base;
  const refYear = Number(asOf.slice(0, 4));
  const ltdByCode = new Map<string, string>();
  for (const c of chain.contracts) {
    if (c.lastTradingDay.status === 'COMPUTED' && 'date' in c.lastTradingDay && c.lastTradingDay.date) {
      ltdByCode.set(`${c.month}-${c.year}`, c.lastTradingDay.date);
    }
  }
  const byDate = new Map<string, Array<{ contract: string; price: number; timestamp: string; lastTradingDay: string }>>();
  for (const code of codes) {
    const parsed = parseContractCode(code, { referenceYear: refYear });
    if (!parsed) continue;
    const ltd = ltdByCode.get(`${parsed.month}-${parsed.year}`);
    if (!ltd) continue;
    const { rows } = await deps.candles.queryCandles({ instrumentId: inst.id, contractCode: code, timeframe: 'D1' }, { limit: 10 });
    for (const r of rows) {
      const ts = new Date(r.timestampMs).toISOString();
      const day = ts.slice(0, 10);
      const list = byDate.get(day) ?? [];
      list.push({ contract: code, price: r.close, timestamp: ts, lastTradingDay: ltd });
      byDate.set(day, list);
    }
  }
  const candidates = [...byDate.entries()].filter(([, l]) => l.length >= 2).sort((a, b) => b[0].localeCompare(a[0]));
  if (candidates.length === 0) {
    return {
      ...base,
      reason: txt(
        'Có dữ liệu nhiều hợp đồng nhưng không có ngày nào mà ít nhất 2 hợp đồng (còn hạn) cùng có giá đóng cửa.',
        'Several contracts are imported, but no day has closes for at least 2 live contracts.'
      ),
    };
  }
  const [day, inputs] = candidates[0];
  const result = buildTermStructure(inputs);
  if (result.status !== 'OK') {
    return { ...base, reason: txt(`Không dựng được đường cong: ${result.errors.join('; ')}`, `Curve not built: ${result.errors.join('; ')}`) };
  }
  return {
    ...base,
    available: true,
    shape: result.shape,
    valuationDate: day,
    points: result.points.map((p) => ({ contract: p.contract, price: p.price, lastTradingDay: p.lastTradingDay })),
    quality: qualityFromSource(datasets[0] ? `(${datasets[0].sourceQuality})` : null, 'USER_PROVIDED'),
  };
}

function monthStats(s: ReturnType<typeof seasonality>, month: number): SeasonalMonth | null {
  const m = s.months.find((x) => x.month === month);
  if (!m || m.count === 0) return null;
  return { month: m.month, count: m.count, mean: m.mean, pctPositive: m.pctPositive };
}

export async function buildAnalysisBrief(deps: BriefDeps, idOrSymbol: string): Promise<AnalysisBrief | null> {
  const inst = await deps.findInstrument(idOrSymbol);
  if (!inst) return null;
  const now = (deps.now ?? (() => new Date()))();
  const nowMs = now.getTime();
  const asOf = now.toISOString().slice(0, 10);
  const spec = inst.specification;
  const unit = spec.quotationUnit;
  const decimals = decimalsForTick(spec.minimumTickSize, 2);

  let quote: MarketQuote | null = null;
  let quoteError: string | null = null;
  try {
    quote = await deps.getQuote(inst);
  } catch (err) {
    quoteError = err instanceof Error ? err.message : 'quote failed';
  }

  const history = await loadHistory(deps, inst, nowMs);
  const bars = history.candles;
  const closes = bars.map((c) => c.close);
  const n = closes.length;
  const lastBar = n > 0 ? bars[n - 1] : null;
  const histSource = history.source ?? 'NONE';
  const histQuality: BriefFactQuality = history.quality ?? 'USER_PROVIDED';
  const lastBarDate = lastBar ? lastBar.timestamp.slice(0, 10) : null;

  const snap = n > 0 ? analyzeTechnicalSnapshot(bars, inst.exchangeSymbol, inst.exchange, 'D1') : null;
  const atr = snap?.atr14 ?? null;
  const sma50Series = n >= 50 ? calculateSMA(closes, 50) : [];
  const sma200Series = n >= 200 ? calculateSMA(closes, 200) : [];
  const sma50 = sma50Series[n - 1] ?? null;
  const sma200 = sma200Series[n - 1] ?? null;
  const sma50Prev = n >= 70 ? (sma50Series[n - 21] ?? null) : null;
  const ret = (k: number) => (n > k && closes[n - 1 - k] > 0 ? closes[n - 1] / closes[n - 1 - k] - 1 : null);
  const rangeBars = bars.slice(-252);
  const rangeHigh = rangeBars.length ? Math.max(...rangeBars.map((b) => b.high)) : null;
  const rangeLow = rangeBars.length ? Math.min(...rangeBars.map((b) => b.low)) : null;

  // --- price & today's move ---
  const quoteHasPrice = quote !== null && quote.price !== null;
  let price: number | null = null;
  let prevClose: number | null = null;
  let prevCloseDate: string | null = null;
  let quoteStatus = 'UNAVAILABLE';
  let quoteSource = quote?.source ?? 'NONE';
  let quoteQuality: BriefFactQuality = 'UNOFFICIAL';
  let quoteAsOf: string | null = null;
  if (quoteHasPrice && quote) {
    price = quote.price;
    quoteStatus = quote.status;
    quoteAsOf = quote.timestamp;
    quoteQuality = quote.sourceQuality ?? qualityFromSource(quote.source, quote.status === 'HISTORICAL' ? 'USER_PROVIDED' : 'LICENSED_VENDOR');
    const session = quoteSessionDate(quote, spec.tradingHoursTimezone);
    const prevBar = session ? [...bars].reverse().find((b) => b.timestamp.slice(0, 10) < session) : null;
    if (prevBar) {
      prevClose = prevBar.close;
      prevCloseDate = prevBar.timestamp.slice(0, 10);
    }
  } else if (lastBar) {
    // No quote: last stored close, labelled HISTORICAL with its own date and source.
    price = lastBar.close;
    quoteStatus = 'HISTORICAL';
    quoteSource = histSource;
    quoteQuality = histQuality;
    quoteAsOf = lastBar.timestamp;
    if (n >= 2) {
      prevClose = bars[n - 2].close;
      prevCloseDate = bars[n - 2].timestamp.slice(0, 10);
    }
  }
  const built: Partial<Record<string, BuiltSection>> = {};
  built.price = buildPriceSection({
    price,
    unit,
    decimals,
    quoteStatus,
    quoteSource,
    quoteQuality,
    quoteAsOf,
    quoteDelayMinutes: quote?.delayMinutes ?? null,
    prevClose,
    prevCloseDate,
    historySource: histSource,
    historyQuality: histQuality,
    atr,
    quoteReason: quoteError ?? quote?.statusReason ?? null,
  });

  built.trend = buildTrendSection({
    close: lastBar?.close ?? null,
    sma50,
    sma200,
    sma50Prev,
    rangeHigh,
    rangeLow,
    rangeBars: rangeBars.length,
    unit,
    decimals,
    source: histSource,
    quality: histQuality,
    asOf: lastBarDate,
  });

  built.momentum = buildMomentumSection({
    rsi14: n >= 15 ? (snap?.rsi14 ?? null) : null,
    ret20: ret(20),
    ret60: ret(60),
    source: histSource,
    asOf: lastBarDate,
  });

  // --- volatility & drawdown ---
  const series = bars.map((b) => ({ t: b.timestamp, v: b.close }));
  let vol20: number | null = null;
  let volMedian: number | null = null;
  if (n >= 21) {
    const rv = realizedVolatility(series, { window: 20 });
    if (rv.status === 'OK') {
      const vals = rv.values.filter((v): v is number => v !== null);
      vol20 = rv.values[rv.values.length - 1] ?? null;
      const lastYear = vals.slice(-252);
      volMedian = lastYear.length >= 60 ? median(lastYear) : null;
    }
  }
  const dd = n >= 2 ? drawdown(series) : null;
  const maxDd =
    dd && dd.status === 'OK' && dd.max && dd.max.maxDrawdown < 0
      ? { value: dd.max.maxDrawdown, peakT: dd.max.peakT, troughT: dd.max.troughT, recovered: dd.max.recoveryT !== null }
      : null;
  const specOk = spec.verificationStatus !== 'UNVERIFIED';
  built.risk = buildRiskSection({
    price,
    atr14: atr,
    tickSize: specOk ? spec.minimumTickSize : null,
    tickValue: specOk ? spec.tickValue : null,
    currency: spec.tradingCurrency,
    unit,
    decimals,
    vol20,
    volMedian,
    maxDrawdown: maxDd,
    historyFrom: bars[0]?.timestamp.slice(0, 10) ?? null,
    historyTo: lastBarDate,
    source: histSource,
    specSource: spec.dataSource || 'Instrument Master',
    asOf: lastBarDate,
  });

  // --- seasonality (needs >= 3 years) ---
  const yearsAvailable = n >= 2 ? (Date.parse(bars[n - 1].timestamp) - Date.parse(bars[0].timestamp)) / (365.25 * 86_400_000) : 0;
  const month = now.getUTCMonth() + 1;
  let seasonInput = {
    ok: false,
    yearsCovered: 0,
    yearsAvailable,
    reason: null as string | null,
    current: null as SeasonalMonth | null,
    next: null as SeasonalMonth | null,
    source: histSource,
    asOf: lastBarDate,
    profileNote: inst.commodityProfile?.seasonalPattern ?? null,
  };
  if (yearsAvailable >= 3) {
    const s = seasonality(series, { minYears: 3 });
    if (s.status === 'OK') {
      seasonInput = {
        ...seasonInput,
        ok: true,
        yearsCovered: s.yearsCovered,
        current: monthStats(s, month),
        next: monthStats(s, (month % 12) + 1),
      };
    } else {
      seasonInput.reason = s.reason ?? null;
    }
  }
  built.seasonality = buildSeasonalitySection(seasonInput);

  built.cot = buildCotSection(cotInput(deps, inst, now));

  let tsInput: TermStructureInput;
  try {
    tsInput = await termStructureInput(deps, inst, asOf, decimals);
  } catch {
    tsInput = { available: false, reason: null, shape: null, valuationDate: null, points: [], unit, decimals, source: 'NONE', quality: 'USER_PROVIDED' };
  }
  built.termStructure = buildTermStructureSection(tsInput);

  // --- contract specs & MXV ---
  const mxv = inst.mxvMapping;
  const chain = buildContractChain({
    instrumentId: inst.id,
    root: inst.exchangeSymbol,
    mxvRoot: mxv && mxv.mappingStatus === 'VERIFIED' ? mxv.mxvSymbol : null,
    asOf,
    count: 1,
    calendarStatus: CONTRACT_CALENDAR_RULES[inst.id]?.verificationStatus ?? 'UNVERIFIED',
  });
  const next = chain.status === 'OK' ? chain.contracts[0] : null;
  const ltd = next && next.lastTradingDay.status === 'COMPUTED' && 'date' in next.lastTradingDay ? (next.lastTradingDay.date ?? null) : null;
  built.contract = buildContractSection({
    symbol: inst.exchangeSymbol,
    exchange: inst.exchange,
    contractSize: specOk ? spec.contractSize : null,
    contractSizeUnit: spec.contractSizeUnit ?? null,
    tickSize: specOk ? spec.minimumTickSize : null,
    tickValue: specOk ? spec.tickValue : null,
    currency: spec.tradingCurrency,
    unit,
    settlement: spec.settlementMethod ?? null,
    verification: spec.verificationStatus,
    specSource: spec.dataSource || 'Instrument Master',
    tradingHoursIct: inst.commodityProfile?.vietnamTradingSessionsIct ?? null,
    contractCycle: inst.commodityProfile?.contractCycleSummary ?? null,
    mxv: mxv && mxv.mappingStatus === 'VERIFIED' && mxv.mxvSymbol ? { symbol: mxv.mxvSymbol, status: mxv.mappingStatus, source: mxv.mxvContractSpec?.sourceUrl ?? null } : null,
    isMxvListed: inst.isMvxListed,
    nextContract: next
      ? {
          code: next.code,
          mxvCode: next.mxvCode,
          lastTradingDay: ltd,
          daysToLastTrade: next.calendarDaysToLastTrade,
          ltdSource: next.lastTradingDay.sourceUrl ?? null,
        }
      : null,
    chainAsOf: asOf,
  });

  const order = ['price', 'trend', 'momentum', 'risk', 'seasonality', 'cot', 'termStructure', 'contract'] as const;
  const sections = order.map((id) => built[id]!.section);
  sections.push(buildMissingSection(sections));

  const chartBars = bars.slice(-130);
  const chartOffset = n - chartBars.length;
  return {
    instrumentId: inst.id,
    exchangeSymbol: inst.exchangeSymbol,
    productName: inst.productName,
    vietnameseName: inst.commodityProfile?.vietnameseName ?? null,
    generatedAt: now.toISOString(),
    history: {
      origin: history.origin,
      source: history.source,
      quality: history.quality,
      bars: n,
      firstDate: bars[0]?.timestamp.slice(0, 10) ?? null,
      lastDate: lastBarDate,
      note: history.note,
    },
    summary: buildSummary(built),
    sections,
    chart:
      chartBars.length >= 10
        ? {
            unit,
            points: chartBars.map((b, i) => ({ t: b.timestamp.slice(0, 10), close: b.close, ma50: sma50Series[chartOffset + i] ?? null })),
          }
        : null,
    disclaimer: BRIEF_DISCLAIMER,
  };
}
