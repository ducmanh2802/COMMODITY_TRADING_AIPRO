/**
 * T49 — FX source adapters (fail-closed; a value is never synthesized).
 *
 *   ECB daily reference rates XML (https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml)
 *     OFFICIAL — European Central Bank, published ~16:00 CET, EUR as base currency
 *   FRED daily series via fredgraph.csv (DEXUSEU, DEXJPUS, DEXCHUS, DEXBZUS, DEXUSAL)
 *     OFFICIAL — Federal Reserve Board, H.10 release, daily, USD as base (or inverse)
 *
 * Every function fails closed: on any HTTP/shape/validation problem it returns status UNAVAILABLE or
 * INVALID with value null and a reason — it never substitutes a default or a previous number.
 */
import type { DataQualityStatus } from '../../../src/shared/types/market.ts';
import type {
  MacroDatapoint,
  MacroDatapointId,
} from '../../../src/shared/types/macro.ts';
import { DAY_MS, errMessage, isIsoDate, TIMEOUT_MS, unavailable, type FetchLike } from '../../macro/sources.ts';

export type { FetchLike };
export const ECB_DAILY_XML_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const ECB_HISTORICAL_XML_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml';

/** FX pairs we expose, with their commodity relevance notes (vi/en). */
export const FX_PAIRS = [
  {
    id: 'EURUSD' as const,
    label: { vi: 'EUR/USD', en: 'EUR/USD' },
    unit: 'USD per EUR',
    ecbCode: 'USD',
    fredId: 'DEXUSEU',
    note: {
      vi: 'Ảnh hưởng giá dầu, kim loại, nông sản định giá USD',
      en: 'Affects USD-denominated oil, metals, agriculture',
    },
  },
  {
    id: 'USDJPY' as const,
    label: { vi: 'USD/JPY', en: 'USD/JPY' },
    unit: 'JPY per USD',
    ecbCode: 'JPY',
    fredId: 'DEXJPUS',
    note: {
      vi: 'Ảnh hưởng xuất khẩu Nhật, dòng vốn an toàn',
      en: 'Affects Japan exports, safe-haven flows',
    },
  },
  {
    id: 'USDCNY' as const,
    label: { vi: 'USD/CNY', en: 'USD/CNY' },
    unit: 'CNY per USD',
    ecbCode: 'CNY',
    fredId: 'DEXCHUS',
    note: {
      vi: 'Nhu cầu Trung Quốc → đậu tương, ngô, sắt, dầu',
      en: 'China demand → soybeans, corn, iron ore, oil',
    },
  },
  {
    id: 'USDBRL' as const,
    label: { vi: 'USD/BRL', en: 'USD/BRL' },
    unit: 'BRL per USD',
    ecbCode: 'BRL',
    fredId: 'DEXBZUS',
    note: {
      vi: 'Xuất khẩu Brazil: cà phê, đường, đậu tương',
      en: 'Brazil exports: coffee, sugar, soybeans',
    },
  },
  {
    id: 'AUDUSD' as const,
    label: { vi: 'AUD/USD', en: 'AUD/USD' },
    unit: 'USD per AUD',
    ecbCode: 'AUD',
    fredId: 'DEXUSAL',
    note: {
      vi: 'Xuất khẩu Úc: quặng sắt, than, LNG',
      en: 'Australia exports: iron ore, coal, LNG',
    },
  },
] as const;

export type FxPairId = (typeof FX_PAIRS)[number]['id'];

export function ecbPairFor(pair: FxPairId): { ecbCode: string; invert: boolean } | null {
  const p = FX_PAIRS.find((x) => x.id === pair);
  if (!p) return null;
  // ECB quotes EUR as base. For EURUSD, USD is the quote (no invert).
  // For others quoted vs USD, we need EUR/XXX from ECB and EUR/USD, then cross.
  // Simpler: ECB gives EUR/XXX. We want XXX/USD or USD/XXX.
  // For AUDUSD: we want AUD/USD = (EUR/USD) / (EUR/AUD) → invert EUR/AUD then multiply by EUR/USD.
  // For USDJPY, USDCNY, USDBRL: we want USD/XXX = (EUR/XXX) / (EUR/USD).
  // For EURUSD: direct EUR/USD from ECB.
  if (pair === 'EURUSD') return { ecbCode: 'USD', invert: false };
  if (pair === 'AUDUSD') return { ecbCode: 'AUD', invert: true }; // We'll compute: EURUSD / EURAUD
  return { ecbCode: p.ecbCode, invert: false }; // USD/XXX = EURXXX / EURUSD
}

/** Parse ECB daily XML for a single currency code (e.g., USD, JPY). Returns rate: 1 EUR = X currency. */
export function parseEcbDailyXml(xml: string, code: string, now: Date, fetchedAt: string): MacroDatapoint | null {
  const base = {
    id: `ECB_${code}` as MacroDatapointId,
    label: `ECB EUR/${code}`,
    unit: `${code} per EUR`,
    sourceName: 'European Central Bank daily reference rates (OFFICIAL)',
    sourceUrl: ECB_DAILY_XML_URL,
    sourceQuality: 'OFFICIAL' as const,
    fetchedAt,
  };
  // ECB XML format: <Cube time="2026-11-20"><Cube currency="USD" rate="1.0483"/></Cube>
  const timeMatch = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']/.exec(xml);
  if (!timeMatch) return null;
  const asOf = timeMatch[1];
  if (!isIsoDate(asOf)) return null;
  const rateMatch = new RegExp(`<Cube\\s+currency=["']${code}["']\\s+rate=["']([^"']+)["']`).exec(xml);
  if (!rateMatch) return null;
  const rate = Number(rateMatch[1]);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const ageH = (now.getTime() - Date.parse(`${asOf}T00:00:00Z`)) / 3_600_000;
  return {
    ...base,
    value: rate,
    asOf,
    releasedAt: asOf,
    status: ageH <= 48 ? 'DELAYED' : 'STALE',
    reason: 'ECB reference rates published ~16:00 CET; for official use only.',
  };
}

/** Parse ECB historical XML for a single currency code, returns array of (date, rate). */
export function parseEcbHistoricalXml(xml: string, code: string): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  // <Cube time="2026-11-20"><Cube currency="USD" rate="1.0483"/></Cube>
  const cubeRegex = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g;
  let match: RegExpExecArray | null;
  while ((match = cubeRegex.exec(xml)) !== null) {
    const date = match[1];
    const inner = match[2];
    const rateMatch = new RegExp(`<Cube\\s+currency=["']${code}["']\\s+rate=["']([^"']+)["']`).exec(inner);
    if (rateMatch) {
      const rate = Number(rateMatch[1]);
      if (Number.isFinite(rate) && rate > 0) {
        out.push({ date, value: rate });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Parse FRED CSV for FX series. FRED uses "." for missing values. */
export function parseFredFxCsv(text: string): { date: string; value: number }[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const out: { date: string; value: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, val] = lines[i].split(',');
    if (!date || !val || val === '.') continue;
    const v = Number(val);
    if (Number.isFinite(v) && v > 0) {
      out.push({ date: date.trim(), value: v });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Build MacroDatapoint from latest FRED FX observation. */
export function buildFredFxDatapoint(
  pair: FxPairId,
  series: { date: string; value: number }[],
  now: Date,
  fetchedAt: string
): MacroDatapoint {
  const p = FX_PAIRS.find((x) => x.id === pair)!;
  const base = {
    id: `FRED_${p.fredId}` as MacroDatapointId,
    label: p.label.en,
    unit: p.unit,
    sourceName: `FRED ${p.fredId} (OFFICIAL, H.10)`,
    sourceUrl: `https://fred.stlouisfed.org/series/${p.fredId}`,
    sourceQuality: 'OFFICIAL' as const,
    fetchedAt,
  };
  if (series.length === 0) {
    return unavailable(base, `FRED ${p.fredId} returned no valid observations.`);
  }
  const last = series[series.length - 1];
  if (!isIsoDate(last.date)) {
    return unavailable(base, `FRED ${p.fredId} latest date invalid.`, 'INVALID');
  }
  const ageH = (now.getTime() - Date.parse(`${last.date}T00:00:00Z`)) / 3_600_000;
  return {
    ...base,
    value: last.value,
    asOf: last.date,
    releasedAt: last.date,
    status: ageH <= 48 ? 'DELAYED' : 'STALE',
    reason: 'FRED H.10 daily rates; released on business days.',
  };
}

/** Fetch ECB daily XML. */
export async function fetchEcbDaily(fetchFn: FetchLike, now: Date): Promise<string> {
  const res = await fetchFn(ECB_DAILY_XML_URL, {
    headers: { Accept: 'application/xml' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ECB HTTP ${res.status}`);
  return res.text();
}

/** Fetch ECB historical XML (for sparklines). */
export async function fetchEcbHistorical(fetchFn: FetchLike, now: Date): Promise<string> {
  const res = await fetchFn(ECB_HISTORICAL_XML_URL, {
    headers: { Accept: 'application/xml' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ECB historical HTTP ${res.status}`);
  return res.text();
}

/** Fetch FRED FX CSV for a series ID. */
export async function fetchFredFxCsv(fetchFn: FetchLike, seriesId: string, now: Date): Promise<string> {
  const cosd = new Date(now.getTime() - 2 * 365 * DAY_MS).toISOString().slice(0, 10);
  const res = await fetchFn(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}&cosd=${cosd}`,
    {
      headers: { 'User-Agent': 'commodity-research-tool', Accept: 'text/csv' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  if (!res.ok) throw new Error(`FRED ${seriesId} HTTP ${res.status}`);
  return res.text();
}