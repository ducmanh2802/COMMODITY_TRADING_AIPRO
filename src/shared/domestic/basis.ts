/**
 * Pure helpers for Vietnam domestic prices vs international prices (basis). No I/O.
 * basis = domestic - international equivalent (VND/kg); pct = basis / international equivalent.
 */

export const DOMESTIC_COMMODITIES = ['coffee', 'pepper', 'rubber', 'corn', 'soymeal'] as const;
export type DomesticCommodity = (typeof DOMESTIC_COMMODITIES)[number];
export const DOMESTIC_QUALITIES = ['OFFICIAL', 'UNOFFICIAL', 'MANUAL'] as const;
export type DomesticQuality = (typeof DOMESTIC_QUALITIES)[number];
export const DOMESTIC_UNITS = ['VND/kg', 'USD/t'] as const;

export interface DomesticPricePoint {
  commodity: DomesticCommodity;
  region: string;
  price: number;
  unit: string;
  currency: 'VND' | 'USD';
  /** YYYY-MM-DD */
  date: string;
  source: string;
  sourceUrl: string;
  quality: DomesticQuality;
}

export type IntlUnit = 'USD/t' | 'USc/bu' | 'USD/st';

/** International reference per commodity: which futures series and its quoted unit. */
export const INTL_REFERENCE: Partial<Record<DomesticCommodity, { instrumentId: string; unit: IntlUnit }>> = {
  coffee: { instrumentId: 'ICE:RC', unit: 'USD/t' },
  corn: { instrumentId: 'CBOT:ZC', unit: 'USc/bu' },
  soymeal: { instrumentId: 'CBOT:ZM', unit: 'USD/st' },
};

const KG_PER_BUSHEL_CORN = 25.4012;
const KG_PER_SHORT_TON = 907.18474;

/** International futures quote -> USD per kg. */
export function intlToUsdPerKg(value: number, unit: IntlUnit): number {
  if (unit === 'USD/t') return value / 1000;
  if (unit === 'USc/bu') return value / 100 / KG_PER_BUSHEL_CORN;
  return value / KG_PER_SHORT_TON;
}

/** International futures quote -> VND/kg using the given USD/VND rate. */
export function intlToVndPerKg(value: number, unit: IntlUnit, usdVnd: number): number {
  return intlToUsdPerKg(value, unit) * usdVnd;
}

/** Domestic price in its own unit -> VND/kg (null if unit unsupported or FX needed but missing). */
export function domesticToVndPerKg(price: number, unit: string, usdVnd: number | null): number | null {
  if (unit === 'VND/kg') return price;
  if (unit === 'USD/t') return usdVnd && usdVnd > 0 ? (price / 1000) * usdVnd : null;
  return null;
}

export interface Basis {
  basisVndPerKg: number;
  basisPct: number | null;
}

export function computeBasis(domesticVndPerKg: number, intlVndPerKg: number): Basis | null {
  if (![domesticVndPerKg, intlVndPerKg].every((x) => Number.isFinite(x)) || intlVndPerKg <= 0) return null;
  const basis = domesticVndPerKg - intlVndPerKg;
  return { basisVndPerKg: basis, basisPct: (basis / intlVndPerKg) * 100 };
}

/** Validates one entry; returns the cleaned point or an error message. */
export function validateDomesticEntry(
  raw: Record<string, unknown>
): { ok: true; point: DomesticPricePoint } | { ok: false; error: string } {
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string).trim() : '');
  const commodity = str('commodity') as DomesticCommodity;
  if (!DOMESTIC_COMMODITIES.includes(commodity)) return { ok: false, error: `commodity must be one of ${DOMESTIC_COMMODITIES.join(', ')}` };
  const price = typeof raw.price === 'number' ? raw.price : Number(String(raw.price ?? '').replace(/,/g, ''));
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'price must be a positive number' };
  const unit = str('unit') || 'VND/kg';
  if (!(DOMESTIC_UNITS as readonly string[]).includes(unit)) return { ok: false, error: `unit must be one of ${DOMESTIC_UNITS.join(', ')}` };
  const date = str('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { ok: false, error: 'date must be YYYY-MM-DD' };
  const source = str('source');
  if (!source) return { ok: false, error: 'source name is required' };
  const sourceUrl = str('sourceUrl');
  if (!/^https?:\/\/\S+$/i.test(sourceUrl)) return { ok: false, error: 'sourceUrl must be an http(s) URL' };
  const q = str('quality') || 'MANUAL';
  if (!DOMESTIC_QUALITIES.includes(q as DomesticQuality)) return { ok: false, error: 'quality must be OFFICIAL, UNOFFICIAL or MANUAL' };
  return {
    ok: true,
    point: {
      commodity,
      region: str('region') || 'Toàn quốc',
      price,
      unit,
      currency: unit.startsWith('USD') ? 'USD' : 'VND',
      date,
      source,
      sourceUrl,
      quality: q as DomesticQuality,
    },
  };
}

/** Parses CSV text with header: commodity,region,price,unit,date,source,sourceUrl[,quality]. Simple (no quoted commas). */
export function parseDomesticCsv(text: string): { points: DomesticPricePoint[]; errors: Array<{ line: number; error: string }> } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const points: DomesticPricePoint[] = [];
  const errors: Array<{ line: number; error: string }> = [];
  if (!lines.length) return { points, errors };
  const header = lines[0].split(',').map((h) => h.trim());
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const row: Record<string, unknown> = {};
    header.forEach((h, idx) => (row[h] = (cells[idx] ?? '').trim()));
    const r = validateDomesticEntry(row);
    if (r.ok) points.push(r.point);
    else errors.push({ line: i + 1, error: r.error });
  }
  return { points, errors };
}
