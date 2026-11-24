/**
 * "Vì sao & sắp tới" (T56): attribution of recent returns, statistical range cones, upcoming scheduled events and
 * seasonality for one instrument. Inputs: stored/Yahoo D1 history (scorecard history), FRED DTWEXBGS + DGS10 (read-only,
 * via marketPulse fetcher), USDA WASDE release dates (macro service). Never fabricates; thin data -> UNAVAILABLE.
 */
import type {
  DText,
  DriverAttribution,
  DriverScenarios,
  DriverSeasonality,
  DriverStatus,
  DriverUpcomingEvent,
  DriversResponse,
} from '../../../src/shared/types/drivers.ts';
import type { InstrumentDefinition } from '../../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../../src/shared/types/market.ts';
import type { WasdeResult } from '../../../src/shared/types/macro.ts';
import { seasonality } from '../../../src/shared/analytics/seasonality.ts';
import type { DatedValue } from '../marketPulse/math.ts';
import { fetchFredCsv, fredSeriesUrl, type FredFetcher } from '../marketPulse/service.ts';
import { addDays, decompose, empiricalCone, flagEventDays, parametricCone, realizedSigma, weekdayDates } from './math.ts';
import { DRIVERS_DISCLAIMER, attributionSentence, coneSentence, seasonalityHitText } from './text.ts';

const DRIVERS_TTL_MS = 10 * 60_000;
const FRED_TTL_MS = 6 * 3_600_000;
const FRED_FAIL_TTL_MS = 5 * 60_000;
const MAX_PEERS = 8;
const MIN_PEER_BARS = 260;
const VOL_WINDOW = 60;

interface DriversHistory {
  candles: MarketCandle[];
  source: string | null;
  quality: string | null;
}
export interface DriversDeps {
  findInstrument: (idOrSymbol: string) => Promise<InstrumentDefinition | null | undefined>;
  listInstruments: () => Promise<InstrumentDefinition[]>;
  getHistory: (inst: InstrumentDefinition) => Promise<DriversHistory>;
  fetchFred?: FredFetcher;
  getWasde?: () => Promise<WasdeResult>;
  now?: () => Date;
}

const t = (vi: string, en: string): DText => ({ vi, en });
const fredCache = new Map<string, { expiresAt: number; value: DatedValue[] }>();
const resultCache = new Map<string, { expiresAt: number; value: DriversResponse }>();

async function fred(fetcher: FredFetcher, id: string, nowMs: number): Promise<DatedValue[]> {
  const hit = fredCache.get(id);
  if (hit && hit.expiresAt > nowMs) return hit.value;
  let value: DatedValue[] = [];
  try {
    value = await fetcher(id);
  } catch {
    value = [];
  }
  fredCache.set(id, { expiresAt: nowMs + (value.length > 0 ? FRED_TTL_MS : FRED_FAIL_TTL_MS), value });
  return value;
}

const toDated = (candles: MarketCandle[]): DatedValue[] => {
  const byDate = new Map<string, number>();
  for (const c of candles) if (c.isComplete !== false && c.close > 0) byDate.set(c.timestamp.slice(0, 10), c.close);
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
};

export interface DriversComputeInput {
  inst: Pick<InstrumentDefinition, 'id' | 'exchangeSymbol' | 'productName' | 'category' | 'exchange'>;
  series: DatedValue[];
  source: string | null;
  peers: DatedValue[][];
  usd: DatedValue[] | null;
  y10: DatedValue[] | null;
  wasde: WasdeResult | null;
  now: Date;
}

/** Pure composition (offline-testable). */
export function computeDrivers(x: DriversComputeInput): DriversResponse {
  const { inst, series, now } = x;
  const today = now.toISOString().slice(0, 10);
  const asOf = series.length > 0 ? series[series.length - 1].date : null;
  const closes = series.map((p) => p.value);
  const hasCot = inst.exchange !== 'MXV';
  const pastWasde = new Set<string>();
  for (const r of x.wasde?.releases ?? []) if (r.releasedAt) pastWasde.add(r.releasedAt.slice(0, 10));

  // 1. Attribution
  const dec = decompose({ target: series, peers: x.peers, usd: x.usd, y10: x.y10 });
  const factors: DriverAttribution['factors'] = [];
  if (dec?.used.includes('group'))
    factors.push({ id: 'group', label: t('Trung bình nhóm', 'Group average'), source: `${x.peers.length} mã cùng nhóm (lịch sử D1)`, asOf });
  if (dec?.used.includes('usd'))
    factors.push({ id: 'usd', label: t('USD diện rộng', 'Broad USD'), source: 'FRED DTWEXBGS', asOf: x.usd?.at(-1)?.date ?? null });
  if (dec?.used.includes('rates'))
    factors.push({ id: 'rates', label: t('Lợi suất 10 năm Mỹ', 'US 10Y yield'), source: 'FRED DGS10', asOf: x.y10?.at(-1)?.date ?? null });
  const attribution: DriverAttribution = dec
    ? {
        status: dec.used.length === 3 ? 'OK' : 'PARTIAL',
        rSquared: dec.r2,
        sampleDays: dec.sampleDays,
        factors,
        horizons: dec.horizons.map((h) => {
          const events = flagEventDays(h.dates, inst.category, pastWasde, hasCot);
          return {
            days: h.days,
            startDate: h.startDate,
            endDate: h.endDate,
            totalPct: h.totalPct,
            parts: h.parts,
            events,
            sentence: attributionSentence({
              name: inst.productName,
              category: inst.category,
              days: h.days,
              endsToday: h.endDate === today,
              endDate: h.endDate,
              totalPct: h.totalPct,
              parts: h.parts,
              events,
            }),
          };
        }),
        note: t(
          `Hồi quy OLS ${dec.sampleDays} ngày gần nhất (R² = ${(dec.r2 * 100).toFixed(0)}%). Phần "riêng mã này" gồm cả những gì mô hình không giải thích. Đây là mô tả quá khứ, không nói lên nguyên nhân chắc chắn.`,
          `OLS on the last ${dec.sampleDays} days (R² = ${(dec.r2 * 100).toFixed(0)}%). "Specific to this instrument" includes everything the model does not explain. A description of the past, not proof of cause.`
        ),
        ...(dec.used.length < 3 ? { reason: t('Thiếu một số yếu tố (USD/lợi suất/nhóm) nên chỉ dùng phần có dữ liệu.', 'Some factors (USD/yield/group) are missing; only available ones are used.') } : {}),
      }
    : {
        status: 'UNAVAILABLE',
        reason: t('Chưa đủ lịch sử (cần ít nhất ~120 phiên có đủ yếu tố).', 'Not enough history (about 120 sessions with all factors needed).'),
        rSquared: null,
        sampleDays: 0,
        factors: [],
        horizons: [],
        note: t('', ''),
      };

  // 2. Scenarios
  const last = closes.length > 0 ? closes[closes.length - 1] : null;
  const sigma = realizedSigma(closes, VOL_WINDOW);
  const scenarios: DriverScenarios =
    last !== null && sigma !== null
      ? {
          status: 'OK',
          lastClose: last,
          asOf,
          sigmaDaily: sigma,
          volWindowDays: VOL_WINDOW,
          horizons: ([5, 21] as const).map((days) => {
            const parametric = parametricCone(last, sigma, days);
            return { days, parametric, empirical: empiricalCone(closes, last, days), sentence: coneSentence(days, parametric.b80) };
          }),
          path: Array.from({ length: 22 }, (_, d) => {
            const c = parametricCone(last, sigma, Math.max(d, 0));
            return { d, lo50: c.b50.lo, hi50: c.b50.hi, lo80: c.b80.lo, hi80: c.b80.hi };
          }),
          recent: series.slice(-63).map((p) => ({ date: p.date, close: p.value })),
          source: x.source,
          disclaimer: DRIVERS_DISCLAIMER,
        }
      : {
          status: 'UNAVAILABLE',
          reason: t('Chưa đủ lịch sử giá để tính biên độ (cần ít nhất 20 phiên).', 'Not enough price history (at least 20 sessions needed).'),
          lastClose: last,
          asOf,
          sigmaDaily: null,
          volWindowDays: VOL_WINDOW,
          horizons: [],
          path: [],
          recent: [],
          source: x.source,
          disclaimer: DRIVERS_DISCLAIMER,
        };

  // Upcoming events (next 14 days)
  const from = addDays(today, 0);
  const to = addDays(today, 14);
  const upcoming: DriverUpcomingEvent[] = [];
  if (inst.category === 'AGRICULTURE')
    for (const r of x.wasde?.upcoming ?? []) {
      const d = r.releasedAt?.slice(0, 10);
      if (d && d >= from && d <= to)
        upcoming.push({ date: d, kind: 'WASDE', label: t('Báo cáo WASDE (USDA)', 'WASDE report (USDA)'), source: 'USDA ESMIS', scheduled: 'official' });
    }
  if (inst.category === 'ENERGY')
    for (const d of weekdayDates(from, to, 3))
      upcoming.push({ date: d, kind: 'EIA', label: t('Tồn kho dầu thô EIA (hằng tuần)', 'EIA weekly petroleum stocks'), source: 'EIA (lịch tuần, có thể lệch khi nghỉ lễ)', scheduled: 'weekly-rule' });
  if (hasCot)
    for (const d of weekdayDates(from, to, 5))
      upcoming.push({ date: d, kind: 'COT', label: t('Báo cáo COT của CFTC (hằng tuần)', 'CFTC COT report (weekly)'), source: 'CFTC (lịch tuần, có thể lệch khi nghỉ lễ)', scheduled: 'weekly-rule' });
  upcoming.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const notes: DText[] = [
    t('Chưa có nguồn máy đọc được chính thức cho lịch CPI và FOMC, vì vậy không hiển thị ngày cụ thể.', 'No official machine-readable source for CPI and FOMC dates is wired in, so no dates are shown.'),
  ];
  if (inst.category === 'AGRICULTURE' && (x.wasde?.upcoming.length ?? 0) === 0)
    notes.push(t('ESMIS chưa công bố ngày WASDE sắp tới trong dữ liệu; không ước tính.', 'ESMIS lists no upcoming WASDE date; none is estimated.'));

  // 3. Seasonality: next calendar month after the last bar
  const seas = computeSeasonality(series, asOf, x.source);

  return {
    instrumentId: inst.id,
    symbol: inst.exchangeSymbol,
    name: inst.productName,
    asOf,
    attribution,
    scenarios,
    events: { status: 'OK', upcoming, notes },
    seasonality: seas,
    disclaimer: DRIVERS_DISCLAIMER,
  };
}

export function computeSeasonality(series: DatedValue[], asOf: string | null, source: string | null): DriverSeasonality {
  const none = (reason: DText, month: number | null = null): DriverSeasonality => ({
    status: 'UNAVAILABLE', reason, month, years: 0, mean: null, hitUp: 0, hitText: null, min: null, max: null, samples: [], source,
  });
  if (!asOf) return none(t('Chưa có dữ liệu giá.', 'No price data.'));
  const month = (Number(asOf.slice(5, 7)) % 12) + 1;
  const res = seasonality(series.map((p) => ({ t: p.date, v: p.value })), { minYears: 5 });
  const m = res.months[month - 1];
  if (res.status !== 'OK' || !m || m.count < 5)
    return none(t('Cần ít nhất 5 năm dữ liệu cho tháng này; hiện chưa đủ.', 'At least 5 years of data for this month are needed; not enough yet.'), month);
  const up = m.samples.filter((s) => s.ret > 0).length;
  return {
    status: 'OK',
    month,
    years: m.count,
    mean: m.mean === null ? null : m.mean * 100,
    hitUp: up,
    hitText: seasonalityHitText(up, m.count),
    min: m.min === null ? null : m.min * 100,
    max: m.max === null ? null : m.max * 100,
    samples: m.samples.map((s) => ({ year: s.year, ret: s.ret * 100 })),
    source,
  };
}

export async function buildDrivers(deps: DriversDeps, idOrSymbol: string): Promise<DriversResponse | null> {
  const now = (deps.now ?? (() => new Date()))();
  const inst = await deps.findInstrument(idOrSymbol);
  if (!inst) return null;
  const hit = resultCache.get(inst.id);
  if (hit && hit.expiresAt > now.getTime()) return hit.value;
  const fetcher = deps.fetchFred ?? fetchFredCsv;
  const [own, usd, y10, wasde, all] = await Promise.all([
    deps.getHistory(inst),
    fred(fetcher, 'DTWEXBGS', now.getTime()),
    fred(fetcher, 'DGS10', now.getTime()),
    deps.getWasde ? deps.getWasde().catch(() => null) : Promise.resolve(null),
    deps.listInstruments().catch(() => [] as InstrumentDefinition[]),
  ]);
  const seen = new Set<string>([inst.exchangeSymbol]);
  const peerInsts = all.filter((i) => i.category === inst.category && !seen.has(i.exchangeSymbol) && seen.add(i.exchangeSymbol)).slice(0, MAX_PEERS);
  const peers = (await Promise.all(peerInsts.map((p) => deps.getHistory(p).then((h) => toDated(h.candles)).catch(() => [] as DatedValue[]))))
    .filter((s) => s.length >= MIN_PEER_BARS);
  const value = computeDrivers({
    inst,
    series: toDated(own.candles),
    source: own.source,
    peers,
    usd: usd.length > 0 ? usd : null,
    y10: y10.length > 0 ? y10 : null,
    wasde,
    now,
  });
  resultCache.set(inst.id, { expiresAt: now.getTime() + DRIVERS_TTL_MS, value });
  return value;
}

export type { DriverStatus };
export { fredSeriesUrl };
