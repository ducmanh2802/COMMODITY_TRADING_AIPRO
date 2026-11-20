import type { MarketQuote } from '../../src/shared/types/market.ts';

/**
 * Free public benchmarks (FRED fredgraph.csv, no key) used ONLY as a clearly-labelled reference price
 * for instruments that have no free futures feed. A benchmark is NOT a futures quote: it is never
 * CURRENT/DELAYED, never written as a candle, and always carries `kind: 'BENCHMARK'`.
 */
export interface FredBenchmarkDef {
  seriesId: string;
  dataset: string;
  /** Instrument exchange symbols this benchmark stands in for. */
  symbols: string[];
  periodicity: 'MONTHLY' | 'DAILY';
  nativeUnit: string;
  nativeCurrency: 'USD';
  /** Exact conversion to the instrument's own unit, when one exists. */
  conversion?: { toUnit: string; factor: number; note: string };
  /** Who really produces the number (shown to the user). */
  publisher: 'IMF' | 'EIA';
  label: string;
}

/** 1 metric ton = 1000 / 0.45359237 lb (exact, international pound) => cents/lb x 22.0462262185 = USD/MT. */
export const CENTS_PER_LB_TO_USD_PER_MT = 1000 / 0.45359237 / 100;

export const FRED_BENCHMARK_DEFS: FredBenchmarkDef[] = [
  {
    seriesId: 'DCOILBRENTEU',
    dataset: 'EIA_FRED_BRENT_SPOT_FOB',
    symbols: ['BRN'],
    periodicity: 'DAILY',
    nativeUnit: 'USD/barrel',
    nativeCurrency: 'USD',
    publisher: 'EIA',
    label: 'Europe Brent spot FOB (EIA qua FRED)',
  },
  {
    seriesId: 'PCOFFROBUSDM',
    dataset: 'IMF_FRED_ROBUSTA_BENCHMARK',
    symbols: ['RC'],
    periodicity: 'MONTHLY',
    nativeUnit: 'cents/lb',
    nativeCurrency: 'USD',
    conversion: {
      toUnit: 'USD/MT',
      factor: CENTS_PER_LB_TO_USD_PER_MT,
      note: 'cent/lb x 22,0462 = USD/tấn (1 tấn = 2.204,62 lb, chính xác)',
    },
    publisher: 'IMF',
    label: 'Cà phê Robusta - giá bình quân tháng (IMF qua FRED)',
  },
  {
    seriesId: 'PCOTTINDUSDM',
    dataset: 'IMF_FRED_COTTON_BENCHMARK',
    symbols: ['CT'],
    periodicity: 'MONTHLY',
    nativeUnit: 'cents/lb',
    nativeCurrency: 'USD',
    publisher: 'IMF',
    label: 'Bông (Cotlook A Index) - giá bình quân tháng (IMF qua FRED)',
  },
  {
    seriesId: 'PRUBBUSDM',
    dataset: 'IMF_FRED_RUBBER_BENCHMARK',
    symbols: ['JRU'],
    periodicity: 'MONTHLY',
    nativeUnit: 'cents/lb',
    nativeCurrency: 'USD',
    publisher: 'IMF',
    label: 'Cao su (RSS3 Singapore) - giá bình quân tháng (IMF qua FRED)',
  },
  {
    seriesId: 'PIORECRUSDM',
    dataset: 'IMF_FRED_IRON_ORE_BENCHMARK',
    symbols: ['TIO', 'FEF'],
    periodicity: 'MONTHLY',
    nativeUnit: 'USD/MT',
    nativeCurrency: 'USD',
    publisher: 'IMF',
    label: 'Quặng sắt 62% Fe CFR Trung Quốc - giá bình quân tháng (IMF qua FRED)',
  },
];

export interface FredObs {
  date: string;
  val: number;
}

/** Parses fredgraph.csv text; skips "." / blank / non-positive rows. Returns [] on an unexpected header. */
export function parseFredCsv(text: string): FredObs[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || !/DATE/i.test(lines[0])) return [];
  const out: FredObs[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [rawDate, rawVal] = lines[i].split(',');
    const d = rawDate?.trim();
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const s = rawVal?.trim();
    if (!s || s === '.') continue;
    const v = Number(s);
    if (Number.isFinite(v) && v > 0) out.push({ date: d, val: v });
  }
  return out;
}

const DAY_MS = 86_400_000;

/** HISTORICAL while the latest observation is recent enough for its periodicity, else STALE. Never live. */
export function benchmarkStatus(periodicity: 'MONTHLY' | 'DAILY', observationDate: string, now: Date): 'HISTORICAL' | 'STALE' {
  const ageDays = (now.getTime() - Date.parse(`${observationDate}T00:00:00Z`)) / DAY_MS;
  // Monthly averages are published ~1-2 months after the month starts; allow 120 days from period start.
  return ageDays > (periodicity === 'MONTHLY' ? 120 : 7) ? 'STALE' : 'HISTORICAL';
}

export function buildBenchmarkQuote(
  def: FredBenchmarkDef,
  symbol: string,
  latest: FredObs,
  now: Date
): MarketQuote {
  const conv = def.conversion;
  const price = conv ? Math.round(latest.val * conv.factor * 100) / 100 : latest.val;
  const unit = conv ? conv.toUnit : def.nativeUnit;
  const status = benchmarkStatus(def.periodicity, latest.date, now);
  const period = def.periodicity === 'MONTHLY' ? latest.date.slice(0, 7) : latest.date;
  return {
    symbol,
    exchange: '',
    contractMonth: null,
    price,
    bid: null,
    ask: null,
    volume: null,
    openInterest: null,
    currency: def.nativeCurrency,
    unit,
    source: `FRED_MACRO:${def.seriesId}`,
    sourceQuality: 'OFFICIAL',
    timestamp: `${latest.date}T00:00:00.000Z`,
    retrievedAt: now.toISOString(),
    status,
    kind: 'BENCHMARK',
    reasonCode: def.periodicity === 'MONTHLY' ? 'BENCHMARK_MONTHLY' : 'BENCHMARK_DAILY',
    benchmark: {
      seriesId: def.seriesId,
      publisher: def.publisher,
      periodicity: def.periodicity,
      period,
      nativeValue: latest.val,
      nativeUnit: def.nativeUnit,
      conversion: conv ? conv.note : null,
      url: `https://fred.stlouisfed.org/series/${def.seriesId}`,
    },
    statusReason:
      `${def.label}, kỳ ${period}. Giá tham chiếu — không phải giá hợp đồng tương lai.` +
      (conv ? ` Quy đổi: ${conv.note}; gốc ${latest.val} ${def.nativeUnit}.` : ''),
  };
}
