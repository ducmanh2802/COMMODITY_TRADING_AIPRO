/**
 * Exact unit conversion for the "Dễ dùng" (easy) mode: international quote -> VND per kg / per tonne.
 * Only definitional factors are used (1 lb = 0.45359237 kg, short ton = 2000 lb, cwt = 100 lb, metric ton = 1000 kg,
 * trade bushel weights corn 56 lb / soybean & wheat 60 lb). Anything else returns null (show the native unit in words).
 * The result is an international price converted to VND - NOT a Vietnamese farm-gate / purchase price.
 */
export const KG_PER_LB = 0.45359237;
export const KG_PER_SHORT_TON = 2000 * KG_PER_LB;
export const KG_PER_CWT = 100 * KG_PER_LB;

/** Trade weight of one bushel in lb, per CBOT contract symbol (definitional, not measured). */
const BUSHEL_LB: Record<string, number> = { ZC: 56, ZS: 60, ZW: 60 };

export interface VndConversion {
  vndPerKg: number;
  vndPerTon: number;
  /** Plain steps, shown on tap. Numbers use `.` decimals; the UI does not re-localise this string. */
  formula: string;
}

function r(n: number, d = 4): string {
  return String(Math.round(n * 10 ** d) / 10 ** d);
}

/** kg of the physical unit that one quote unit refers to + how the quoted number becomes USD per that unit. */
function usdPerKg(symbol: string, unit: string, price: number): { usdKg: number; steps: string } | null {
  switch (unit) {
    case 'cents/lb':
      return { usdKg: price / 100 / KG_PER_LB, steps: `${r(price)} cent/lb ÷ 100 ÷ ${KG_PER_LB} kg/lb` };
    case 'USD/lb':
      return { usdKg: price / KG_PER_LB, steps: `${r(price)} USD/lb ÷ ${KG_PER_LB} kg/lb` };
    case 'USD/MT':
    case 'USD/metric ton':
    case 'USD/DMT':
      return { usdKg: price / 1000, steps: `${r(price)} USD/tấn ÷ 1000 kg/tấn` };
    case 'USD/short ton':
      return { usdKg: price / KG_PER_SHORT_TON, steps: `${r(price)} USD/short ton ÷ ${r(KG_PER_SHORT_TON, 3)} kg` };
    case 'USD/cwt':
      return { usdKg: price / KG_PER_CWT, steps: `${r(price)} USD/cwt ÷ ${r(KG_PER_CWT, 3)} kg` };
    case 'cents/bushel': {
      const lb = BUSHEL_LB[symbol];
      if (!lb) return null;
      const kgBu = lb * KG_PER_LB;
      return { usdKg: price / 100 / kgBu, steps: `${r(price)} cent/bushel ÷ 100 ÷ ${r(kgBu, 3)} kg/bushel (${lb} lb)` };
    }
    default:
      return null;
  }
}

/** Convert a quote to VND/kg and VND/tonne, or null when no exact conversion or no USD/VND rate. */
export function convertToVnd(
  symbol: string,
  unit: string,
  currency: string,
  price: number | null,
  usdVnd: number | null
): VndConversion | null {
  if (price === null || !Number.isFinite(price) || currency !== 'USD') return null;
  if (usdVnd === null || !Number.isFinite(usdVnd) || usdVnd <= 0) return null;
  const base = usdPerKg(symbol, unit, price);
  if (!base) return null;
  const vndPerKg = base.usdKg * usdVnd;
  return {
    vndPerKg,
    vndPerTon: vndPerKg * 1000,
    formula: `${base.steps} × ${r(usdVnd, 2)} đ/USD = ${Math.round(vndPerKg)} đ/kg`,
  };
}

export type Light = 'green' | 'red' | 'yellow' | 'gray';

/** Threshold (in %) under which a move is "gần như đi ngang". */
export const FLAT_PCT = 0.3;

/** Traffic light: gray = no price; yellow = no comparison / flat / old data; green up; red down. */
export function trafficLight(hasPrice: boolean, changePct: number | null, stale: boolean): Light {
  if (!hasPrice) return 'gray';
  if (stale || changePct === null || !Number.isFinite(changePct)) return 'yellow';
  if (changePct > FLAT_PCT) return 'green';
  if (changePct < -FLAT_PCT) return 'red';
  return 'yellow';
}
