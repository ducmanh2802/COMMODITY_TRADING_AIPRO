import type { FundamentalMacroRecord } from '../../shared/types/analysis';
import { fmtFixed, fmtNum, hasKey, type TFunction } from '../../i18n';

/** Series that FRED publishes monthly (period shown as "MM/YYYY"); everything else is shown as a day. */
const MONTHLY_SERIES = new Set(['FEDFUNDS', 'CPIAUCSL', 'PCOFFROBUSDM', 'PCOTTINDUSDM', 'PRUBBUSDM', 'PIORECRUSDM']);

export type MacroGroup = 'COMMODITY' | 'US_MACRO' | 'OTHER';

/** Series id out of "FRED Public CSV (PIORECRUSDM)" / "FRED (DGS10)". Null for non-FRED sources. */
export function fredSeriesId(source: string): string | null {
  if (!/FRED/i.test(source)) return null;
  const m = /\(([A-Z0-9]+)\)/.exec(source);
  return m ? m[1] : null;
}

export function macroGroup(r: Pick<FundamentalMacroRecord, 'dataset' | 'category'>): MacroGroup {
  if (r.dataset.startsWith('IMF_FRED_') || r.dataset.startsWith('EIA_FRED_') || r.category === 'GLOBAL_SD') return 'COMMODITY';
  if (r.dataset.startsWith('FRED_') || r.category === 'MACRO') return 'US_MACRO';
  return 'OTHER';
}

/** Friendly dataset name via i18n (`fr.ds.<CODE>`); the raw code is returned only when no name is known. */
export function datasetName(t: TFunction, dataset: string): string {
  const k = `fr.ds.${dataset}`;
  return hasKey(k) ? t(k) : dataset;
}

export function unitWords(t: TFunction, unit: string): string {
  const k = `fr.unit.${unit}`;
  return hasKey(k) ? t(k) : unit;
}

/** "FRED (IMF)" / "FRED (EIA)" / "FRED"; non-FRED sources are shown as stored. */
export function sourceLabel(r: Pick<FundamentalMacroRecord, 'dataset' | 'source'>): string {
  if (!/FRED/i.test(r.source)) return r.source;
  if (r.dataset.startsWith('IMF_FRED_')) return 'FRED (IMF)';
  if (r.dataset.startsWith('EIA_FRED_')) return 'FRED (EIA)';
  return 'FRED';
}

/** "Kỳ: 09/2026" for monthly series, "Kỳ: 17/11/2026" for daily. Falls back to the stored period text. */
export function periodLabel(t: TFunction, r: Pick<FundamentalMacroRecord, 'source' | 'dataPeriod' | 'observationDate'>): string {
  const raw = r.observationDate ?? r.dataPeriod;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw ?? '');
  if (!m) return t('fr.rec.period', { period: r.dataPeriod });
  const id = fredSeriesId(r.source);
  const monthly = id ? MONTHLY_SERIES.has(id) : m[3] === '01';
  return t('fr.rec.period', { period: monthly ? `${m[2]}/${m[1]}` : `${m[3]}/${m[2]}/${m[1]}` });
}

export interface RecordChange {
  abs: number;
  /** Null for percent-unit series (a % change of a rate is not meaningful). */
  pct: number | null;
  dir: 'UP' | 'DOWN' | 'FLAT';
}

export function recordChange(r: Pick<FundamentalMacroRecord, 'actualValue' | 'previousValue' | 'unit'>): RecordChange | null {
  const a = typeof r.actualValue === 'number' ? r.actualValue : null;
  const p = typeof r.previousValue === 'number' ? r.previousValue : null;
  if (a === null || p === null) return null;
  const abs = a - p;
  const pct = r.unit === 'PCT' || p === 0 ? null : (abs / Math.abs(p)) * 100;
  return { abs, pct, dir: abs > 0 ? 'UP' : abs < 0 ? 'DOWN' : 'FLAT' };
}

/** "Tăng 0,80% (+0,82 USD / tấn) so với kỳ trước" — descriptive only, no market-direction label. */
export function changeText(t: TFunction, r: FundamentalMacroRecord): string | null {
  const c = recordChange(r);
  if (!c) return null;
  if (c.dir === 'FLAT') return t('fr.rec.flat');
  const sign = c.abs > 0 ? '+' : '';
  const abs = `${sign}${fmtFixed(c.abs, 2)} ${unitWords(t, r.unit)}`;
  const word = c.dir === 'UP' ? t('fr.rec.up') : t('fr.rec.down');
  return c.pct !== null
    ? t('fr.rec.changePct', { word, pct: fmtFixed(Math.abs(c.pct), 2), abs })
    : t('fr.rec.changeAbs', { word, abs });
}

export function valueText(t: TFunction, v: number | string | null): string {
  if (typeof v === 'number') return fmtNum(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v ?? t('common.na');
}
