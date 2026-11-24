/**
 * Market pulse ("Tình hình tài chính thế giới"): US macro from public FRED CSV (OFFICIAL, cached) plus
 * commodity breadth/volatility from daily history of the instruments already in the Instrument Master.
 * Never fabricates: a series/instrument that cannot be loaded stays null and is reported in `warnings`.
 */
import type {
  MarketPulse,
  PulseGroupStats,
  PulseIndicator,
  PulseMover,
  PulseQuality,
} from '../../../src/shared/types/marketPulse.ts';
import type { InstrumentDefinition } from '../../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../../src/shared/types/market.ts';
import {
  type DatedValue,
  averageReturns,
  breadth,
  changeOver,
  correlationLast,
  parseFredSeries,
  pctChange,
  percentileRank,
  realizedVolSeries,
  returnsByDate,
  spreadSeries,
  volLevel,
  yoySeries,
} from './math.ts';
import { FOMC_CALENDAR_URL, FOMC_NOTE, PULSE_DISCLAIMER, PULSE_EXPLANATIONS, buildPulseSummary } from './templates.ts';

export type FredFetcher = (seriesId: string) => Promise<DatedValue[]>;

interface PulseHistory {
  candles: MarketCandle[];
  source: string | null;
  quality: string | null;
}

export interface MarketPulseDeps {
  listInstruments: () => Promise<InstrumentDefinition[]>;
  getHistory: (inst: InstrumentDefinition) => Promise<PulseHistory>;
  fetchFred?: FredFetcher;
  now?: () => Date;
}

export const PULSE_TTL_MS = 10 * 60_000;
const FRED_TTL_MS = 6 * 3_600_000;
const FRED_FAIL_TTL_MS = 5 * 60_000;
const fredCache = new Map<string, { expiresAt: number; value: DatedValue[] }>();

export function clearMarketPulseCache(): void {
  fredCache.clear();
  resultCache = null;
}

export const fredSeriesUrl = (id: string): string => `https://fred.stlouisfed.org/series/${id}`;

/** Default fetcher: public fredgraph.csv, last ~3 years (needed for YoY and 1y context). */
export async function fetchFredCsv(seriesId: string): Promise<DatedValue[]> {
  const cosd = new Date(Date.now() - 3.2 * 365 * 86_400_000).toISOString().slice(0, 10);
  const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}&cosd=${cosd}`, {
    headers: { 'User-Agent': 'commodity-research-tool', Accept: 'text/csv' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  return parseFredSeries(await res.text());
}

async function cachedFred(fetcher: FredFetcher, id: string, nowMs: number, warnings: string[]): Promise<DatedValue[]> {
  const hit = fredCache.get(id);
  if (hit && hit.expiresAt > nowMs) return hit.value;
  let value: DatedValue[] = [];
  try {
    value = await fetcher(id);
  } catch (err) {
    warnings.push(`FRED ${id}: ${err instanceof Error ? err.message : 'fetch failed'}`);
  }
  if (value.length === 0 && !warnings.some((w) => w.startsWith(`FRED ${id}`))) warnings.push(`FRED ${id}: no data`);
  fredCache.set(id, { expiresAt: nowMs + (value.length > 0 ? FRED_TTL_MS : FRED_FAIL_TTL_MS), value });
  return value;
}

function indicator(
  base: Pick<PulseIndicator, 'id' | 'label' | 'unit' | 'changeKind' | 'formula' | 'source' | 'sourceUrl'> & { note?: string },
  series: DatedValue[]
): PulseIndicator {
  const last = series.length > 0 ? series[series.length - 1] : null;
  return {
    ...base,
    value: last ? last.value : null,
    asOf: last ? last.date : null,
    change1m: changeOver(series, 30, base.changeKind),
    change3m: changeOver(series, 91, base.changeKind),
    quality: 'OFFICIAL' as PulseQuality,
    spark: series.slice(-120).map((p) => ({ date: p.date, value: p.value })),
  };
}

const t = (vi: string, en: string) => ({ vi, en });
const GROUPS: { group: PulseGroupStats['group']; label: { vi: string; en: string } }[] = [
  { group: 'AGRI', label: t('Nông sản', 'Agriculture') },
  { group: 'METALS', label: t('Kim loại', 'Metals') },
  { group: 'ENERGY', label: t('Năng lượng', 'Energy') },
];

function groupOf(cat: InstrumentDefinition['category']): PulseGroupStats['group'] {
  return cat === 'METALS' ? 'METALS' : cat === 'ENERGY' ? 'ENERGY' : 'AGRI';
}

interface InstData {
  inst: InstrumentDefinition;
  group: PulseGroupStats['group'];
  points: DatedValue[];
  source: string | null;
  quality: string | null;
}

const avg = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Pure: commodity section from loaded per-instrument daily series (+ optional USD series). */
export function computeCommodityPulse(data: InstData[], usd: DatedValue[]): MarketPulse['commodities'] {
  const closes = (d: InstData) => d.points.map((p) => p.value);
  const ch = (d: InstData, n: number) => pctChange(closes(d), n);
  const usable = data.filter((d) => d.points.length >= 2);
  const b1 = breadth(usable.map((d) => ch(d, 1)));
  const b5 = breadth(usable.map((d) => ch(d, 5)));
  const asOfs = usable.map((d) => d.points[d.points.length - 1].date).sort();
  const usdReturns = usd.length > 1 ? returnsByDate(usd) : null;

  const groups: PulseGroupStats[] = GROUPS.map(({ group, label }) => {
    const members = usable.filter((d) => d.group === group);
    // Group volatility = realized vol of the equal-weight average daily return index of its members.
    const retMaps = members.map((m) => returnsByDate(m.points));
    const avgRet = averageReturns(retMaps, Math.max(1, Math.ceil(members.length / 2)));
    const dates = [...avgRet.keys()].sort();
    let level = 100;
    const idx = dates.map((d) => {
      level *= 1 + (avgRet.get(d) as number);
      return level;
    });
    const vols = realizedVolSeries(idx, 20);
    const volNow = vols.length > 0 ? vols[vols.length - 1] : null;
    const volHist = vols.filter((v): v is number => v !== null).slice(-252);
    const pctile = volNow !== null ? percentileRank(volNow, volHist) : null;
    const corr = usdReturns ? correlationLast(avgRet, usdReturns, 60) : { r: null, n: 0 };
    return {
      group,
      label,
      count: members.length,
      avg1d: avg(members.map((m) => ch(m, 1))),
      avg5d: avg(members.map((m) => ch(m, 5))),
      avg20d: avg(members.map((m) => ch(m, 20))),
      vol20: volNow,
      volPercentile: pctile,
      volLevel: volLevel(pctile),
      corrUsd60d: corr.r,
      corrObservations: corr.n,
    };
  });

  const movers: PulseMover[] = usable
    .map((d) => ({ d, c: ch(d, 1) }))
    .filter((x): x is { d: InstData; c: number } => x.c !== null)
    .map(({ d, c }) => ({
      symbol: d.inst.exchangeSymbol,
      name: d.inst.productName,
      group: d.group,
      changePct: c,
      asOf: d.points[d.points.length - 1].date,
    }));
  const sorted = [...movers].sort((a, b) => b.changePct - a.changePct);
  const sources = [...new Set(usable.map((d) => d.source).filter((s): s is string => Boolean(s)))];
  const qualities = usable.map((d) => d.quality);
  const quality: PulseQuality = qualities.length > 0 && qualities.every((q) => q === 'OFFICIAL') ? 'OFFICIAL' : qualities.some((q) => q === 'UNOFFICIAL') ? 'UNOFFICIAL' : 'USER_PROVIDED';

  return {
    breadth: {
      instrumentsWithData: usable.length,
      up1d: b1.up,
      down1d: b1.down,
      flat1d: b1.flat,
      up5d: b5.up,
      down5d: b5.down,
      flat5d: b5.flat,
      asOf: asOfs.length > 0 ? asOfs[asOfs.length - 1] : null,
    },
    groups,
    moversUp: sorted.filter((m) => m.changePct > 0).slice(0, 3),
    moversDown: sorted.filter((m) => m.changePct < 0).reverse().slice(0, 3),
    avg1d: avg(usable.map((d) => ch(d, 1))),
    avg5d: avg(usable.map((d) => ch(d, 5))),
    avg20d: avg(usable.map((d) => ch(d, 20))),
    historySources: sources,
    quality,
    note:
      usable.length === 0
        ? t('Chưa có dữ liệu giá ngày cho mã nào; hãy nhập CSV hoặc bật nguồn Yahoo (UNOFFICIAL).', 'No daily history for any instrument; import CSV or enable the Yahoo (UNOFFICIAL) source.')
        : null,
  };
}

let resultCache: { expiresAt: number; value: MarketPulse } | null = null;

export async function buildMarketPulse(deps: MarketPulseDeps): Promise<MarketPulse> {
  const now = (deps.now ?? (() => new Date()))();
  if (resultCache && resultCache.expiresAt > now.getTime()) return resultCache.value;
  const fetcher = deps.fetchFred ?? fetchFredCsv;
  const warnings: string[] = [];
  const ids = ['DFF', 'DGS2', 'DGS10', 'DFII10', 'CPIAUCSL', 'DTWEXBGS'];
  const loaded = await Promise.all(ids.map((id) => cachedFred(fetcher, id, now.getTime(), warnings)));
  const [dff, dgs2, dgs10, dfii10, cpi, usd] = loaded;

  const src = (id: string) => ({ source: `FRED ${id} (OFFICIAL)`, sourceUrl: fredSeriesUrl(id) });
  const spread = spreadSeries(dgs10, dgs2);
  const cpiYoy = yoySeries(cpi);
  const fed: PulseIndicator[] = [
    indicator({ id: 'FED_FUNDS', label: t('Lãi suất Fed funds hiệu dụng', 'Effective Fed funds rate'), unit: '%', changeKind: 'pp', formula: null, ...src('DFF') }, dff),
    indicator({ id: 'DGS2', label: t('Lợi suất trái phiếu 2 năm', '2-year Treasury yield'), unit: '%', changeKind: 'pp', formula: null, ...src('DGS2') }, dgs2),
    indicator({ id: 'DGS10', label: t('Lợi suất trái phiếu 10 năm', '10-year Treasury yield'), unit: '%', changeKind: 'pp', formula: null, ...src('DGS10') }, dgs10),
    indicator(
      {
        id: 'SPREAD_10Y2Y',
        label: t('Chênh lệch 10Y - 2Y', '10Y - 2Y spread'),
        unit: 'pp',
        changeKind: 'pp',
        formula: t('Lợi suất 10 năm trừ lợi suất 2 năm, cùng ngày (điểm %)', '10Y yield minus 2Y yield on the same date (percentage points)'),
        source: 'FRED DGS10 - DGS2 (OFFICIAL, tự tính)',
        sourceUrl: fredSeriesUrl('DGS10'),
      },
      spread
    ),
    indicator(
      {
        id: 'CPI_YOY',
        label: t('Lạm phát CPI Mỹ (so với cùng kỳ)', 'US CPI inflation (year over year)'),
        unit: '%',
        changeKind: 'pp',
        formula: t('CPI YoY = (CPIAUCSL tháng này / CPIAUCSL cùng tháng năm trước - 1) x 100', 'CPI YoY = (CPIAUCSL this month / CPIAUCSL same month last year - 1) x 100'),
        source: 'FRED CPIAUCSL (OFFICIAL, tự tính)',
        sourceUrl: fredSeriesUrl('CPIAUCSL'),
        note: 'Monthly, published with a lag; changes are in percentage points of YoY.',
      },
      cpiYoy
    ),
    indicator({ id: 'REAL_10Y', label: t('Lợi suất thực 10 năm (TIPS)', '10-year real yield (TIPS)'), unit: '%', changeKind: 'pp', formula: null, ...src('DFII10') }, dfii10),
    indicator(
      {
        id: 'USD_BROAD',
        label: t('Chỉ số USD diện rộng (danh nghĩa)', 'Nominal broad US dollar index'),
        unit: 'index',
        changeKind: 'pct',
        formula: null,
        ...src('DTWEXBGS'),
        note: 'Federal Reserve broad index (trade-weighted); not the ICE DXY.',
      },
      usd
    ),
  ];

  // Commodity history for each distinct instrument (bounded concurrency is unnecessary: history is cached upstream).
  let instruments: InstrumentDefinition[] = [];
  try {
    instruments = await deps.listInstruments();
  } catch (err) {
    warnings.push(`instruments: ${err instanceof Error ? err.message : 'list failed'}`);
  }
  const seen = new Set<string>();
  const distinct = instruments.filter((i) => (seen.has(i.exchangeSymbol) ? false : (seen.add(i.exchangeSymbol), true)));
  const data: InstData[] = (
    await Promise.all(
      distinct.map(async (inst): Promise<InstData | null> => {
        try {
          const h = await deps.getHistory(inst);
          const bars = h.candles.filter((c) => c.isComplete !== false && c.close > 0);
          if (bars.length < 2) return null;
          return {
            inst,
            group: groupOf(inst.category),
            points: bars.map((c) => ({ date: c.timestamp.slice(0, 10), value: c.close })),
            source: h.source,
            quality: h.quality,
          };
        } catch {
          return null;
        }
      })
    )
  ).filter((d): d is InstData => d !== null);

  const commodities = computeCommodityPulse(data, usd);
  const value: MarketPulse = {
    generatedAt: now.toISOString(),
    fed,
    fomc: { available: false, calendarUrl: FOMC_CALENDAR_URL, note: FOMC_NOTE },
    commodities,
    summary: buildPulseSummary({ fed, commodities }),
    explanations: PULSE_EXPLANATIONS,
    disclaimer: PULSE_DISCLAIMER,
    warnings,
  };
  resultCache = { expiresAt: now.getTime() + PULSE_TTL_MS, value };
  return value;
}
