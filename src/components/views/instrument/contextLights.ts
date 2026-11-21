// Pure classification for the "Bảng 4 yếu tố" context lights. Colors describe how CLEAR / AGREEING the context is,
// never a buy/sell signal. No i18n or React here: callers map `msg` to dictionary keys.
export type LightTone = 'green' | 'yellow' | 'red' | 'grey';
export type LightId = 'trend' | 'fundamental' | 'seasonal' | 'cot';

export interface ContextLight {
  id: LightId;
  tone: LightTone;
  /** Message id suffix: dictionary key is `ins.ctx.<id>.<msg>`. */
  msg: string;
  params: Record<string, string | number>;
  /** ISO date (or period) of the underlying data when known. */
  asOf: string | null;
  source: string | null;
}

type Dir = 'UP' | 'DOWN' | 'SIDEWAYS' | 'UNAVAILABLE';
export interface TrendInput {
  available: boolean;
  trendDirection: Dir;
  asOf?: string | null;
}

const grey = (id: LightId, asOf: string | null = null, source: string | null = null): ContextLight => ({
  id,
  tone: 'grey',
  msg: 'none',
  params: {},
  asOf,
  source,
});

function dirOf(tf: TrendInput | null | undefined): 'UP' | 'DOWN' | 'SIDEWAYS' | null {
  if (!tf || !tf.available) return null;
  return tf.trendDirection === 'UP' || tf.trendDirection === 'DOWN' || tf.trendDirection === 'SIDEWAYS' ? tf.trendDirection : null;
}

export function trendLight(daily: TrendInput | null | undefined, weekly: TrendInput | null | undefined): ContextLight {
  const d = dirOf(daily);
  const w = dirOf(weekly);
  const asOf = daily?.asOf ?? null;
  const source = 'EMA20/50/200';
  const mk = (tone: LightTone, msg: string): ContextLight => ({ id: 'trend', tone, msg, params: {}, asOf, source });
  if (!d && !w) return grey('trend');
  if (d && w) {
    if (d === w) return d === 'UP' ? mk('green', 'bothUp') : d === 'DOWN' ? mk('red', 'bothDown') : mk('yellow', 'bothSide');
    return mk('yellow', 'mixed');
  }
  const only = (d ?? w) as 'UP' | 'DOWN' | 'SIDEWAYS';
  const which = d ? 'Daily' : 'Weekly';
  return only === 'UP' ? mk('green', `only${which}Up`) : only === 'DOWN' ? mk('red', `only${which}Down`) : mk('yellow', 'bothSide');
}

export interface FundamentalInput {
  bias: 'TIGHTENING' | 'BALANCED' | 'LOOSENING' | 'SURPLUS_PRESSURE' | 'DATA_UNAVAILABLE' | null | undefined;
  matrix?: Array<{ impact: string; state?: string; asOf?: string | null; sourceName?: string }> | null;
}

export function fundamentalLight(input: FundamentalInput | null | undefined): ContextLight {
  if (!input) return grey('fundamental');
  const live = (input.matrix ?? []).filter((m) => m.state !== 'NEEDS_KEY' && m.state !== 'LINK_ONLY' && m.state !== 'UNAVAILABLE');
  const dated = live.map((m) => m.asOf).filter((x): x is string => !!x).sort();
  const asOf = dated.length ? dated[dated.length - 1] : null;
  const source = live.find((m) => m.sourceName)?.sourceName ?? null;
  const mk = (tone: LightTone, msg: string): ContextLight => ({ id: 'fundamental', tone, msg, params: {}, asOf, source });
  const bull = live.filter((m) => m.impact === 'BULLISH').length;
  const bear = live.filter((m) => m.impact === 'BEARISH').length;
  switch (input.bias) {
    case 'TIGHTENING':
      return mk('green', 'tight');
    case 'SURPLUS_PRESSURE':
      return mk('red', 'surplus');
    case 'LOOSENING':
      return mk('yellow', 'loose');
    case 'BALANCED':
      return mk('yellow', 'balanced');
    default:
      break;
  }
  if (bull + bear === 0) return grey('fundamental');
  if (bull > 0 && bear > 0) return mk('yellow', 'mixed');
  return bull > 0 ? mk('green', 'tight') : mk('red', 'surplus');
}

export interface SeasonalInput {
  status: 'OK' | 'PARTIAL' | 'UNAVAILABLE';
  month: number | null;
  years: number;
  mean: number | null;
  hitUp: number;
  source?: string | null;
}

export const MIN_SEASONAL_YEARS = 5;

export function seasonalLight(s: SeasonalInput | null | undefined, asOf: string | null = null): ContextLight {
  if (!s || s.status === 'UNAVAILABLE' || s.mean === null || s.month === null || s.years <= 0) return grey('seasonal', asOf, s?.source ?? null);
  const hit = Math.round((s.hitUp / s.years) * 100);
  const params = { month: s.month, years: s.years, up: s.hitUp, hit, mean: s.mean.toFixed(1) };
  const mk = (tone: LightTone, msg: string): ContextLight => ({ id: 'seasonal', tone, msg, params, asOf, source: s.source ?? null });
  if (s.years < MIN_SEASONAL_YEARS) return mk('grey', 'few');
  if (s.mean > 0 && hit >= 65) return mk('green', 'up');
  if (s.mean < 0 && hit <= 35) return mk('red', 'down');
  return mk('yellow', 'mixed');
}

export interface CotInput {
  available: boolean;
  cotIndex: number | null;
  reportDate?: string | null;
}

export const COT_EXTREME_HIGH = 90;
export const COT_EXTREME_LOW = 10;

export function cotLight(c: CotInput | null | undefined): ContextLight {
  if (!c || !c.available || c.cotIndex === null || !Number.isFinite(c.cotIndex)) return grey('cot', c?.reportDate ?? null, 'CFTC');
  const idx = c.cotIndex;
  const params = { idx: Math.round(idx) };
  const mk = (tone: LightTone, msg: string): ContextLight => ({ id: 'cot', tone, msg, params, asOf: c.reportDate ?? null, source: 'CFTC' });
  if (idx >= COT_EXTREME_HIGH) return mk('yellow', 'extremeLong');
  if (idx <= COT_EXTREME_LOW) return mk('yellow', 'extremeShort');
  if (idx >= 70 || idx <= 30) return mk('green', 'lean');
  return mk('green', 'balanced');
}

/** Whole calendar days from `now` (UTC date) to an ISO date; negative if past; null if unparsable. */
export function daysUntil(dateIso: string | null | undefined, now: Date = new Date()): number | null {
  if (!dateIso) return null;
  const t = Date.parse(dateIso.slice(0, 10));
  if (!Number.isFinite(t)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((t - today) / 86_400_000);
}

export function upcomingWarningDays(dateIso: string | null | undefined, now: Date = new Date(), within = 3): number | null {
  const n = daysUntil(dateIso, now);
  return n !== null && n >= 0 && n <= within ? n : null;
}
