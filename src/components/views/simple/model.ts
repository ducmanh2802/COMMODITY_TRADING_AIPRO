import type { InstrumentDefinition } from '../../../shared/types/instrument';
import type { MarketQuote } from '../../../shared/types/market';
import type { TodayResponse } from '../../../shared/types/today';
import type { Scorecard } from '../../../shared/types/scorecard';
import type { CommodityCycleSummary } from '../../../shared/types/cycle';
import { getCommodityVisual } from '../../../shared/data/commodityVisuals';
import { convertToVnd, trafficLight, type Light, type VndConversion } from './units';

export interface UsdVnd {
  rate: number;
  asOf: string | null;
}

export interface SimpleRow {
  id: string;
  symbol: string;
  name: string;
  instrument: InstrumentDefinition;
  quote: MarketQuote | undefined;
  hasPrice: boolean;
  /** Percent change and which window it covers ('d1' = vs previous session, 'w1' = 1 week). */
  changePct: number | null;
  period: 'd1' | 'w1' | null;
  stale: boolean;
  light: Light;
  conv: VndConversion | null;
  scorecard: Scorecard | undefined;
  cycle: CommodityCycleSummary | undefined;
  familiar: boolean;
}

/** Order of the "Nông sản quen thuộc" group (Vietnam's well-known farm goods first). */
export const FAMILIAR_ORDER = ['RC', 'KC', 'JRU', 'ZC', 'ZS', 'ZM', 'ZR', 'SB', 'ZW', 'CT', 'CC', 'ZL'];

export function displayName(inst: InstrumentDefinition): string {
  return getCommodityVisual(inst.id)?.nameVi ?? inst.commodityProfile?.vietnameseName ?? inst.productName;
}

export function buildRows(
  instruments: InstrumentDefinition[],
  quotesBySymbol: Record<string, MarketQuote>,
  today: TodayResponse | null,
  fx: UsdVnd | null
): SimpleRow[] {
  const seen = new Set<string>();
  const rows: SimpleRow[] = [];
  for (const inst of instruments) {
    if (seen.has(inst.id)) continue;
    seen.add(inst.id);
    const quote = quotesBySymbol[inst.exchangeSymbol];
    const hasPrice = quote?.price !== null && quote?.price !== undefined && Number.isFinite(quote.price);
    const scorecard = today?.scorecard?.scorecards.find((s) => s.instrumentId === inst.id);
    const cycle = today?.cycle?.commodities.find((c) => c.instrument.id === inst.id);
    let changePct: number | null = null;
    let period: SimpleRow['period'] = null;
    if (hasPrice && scorecard?.price.changePct !== null && scorecard?.price.changePct !== undefined) {
      changePct = scorecard.price.changePct;
      period = 'd1';
    } else if (hasPrice && cycle?.returns.w1 !== null && cycle?.returns.w1 !== undefined) {
      changePct = cycle.returns.w1;
      period = 'w1';
    }
    const stale = quote?.status === 'STALE' || quote?.status === 'INVALID';
    rows.push({
      id: inst.id,
      symbol: inst.exchangeSymbol,
      name: displayName(inst),
      instrument: inst,
      quote,
      hasPrice,
      changePct,
      period,
      stale,
      light: trafficLight(hasPrice, changePct, stale),
      conv: quote ? convertToVnd(inst.exchangeSymbol, quote.unit, quote.currency, quote.price, fx?.rate ?? null) : null,
      scorecard,
      cycle,
      familiar: FAMILIAR_ORDER.includes(inst.exchangeSymbol),
    });
  }
  return rows;
}

export function sortFamiliar(rows: SimpleRow[]): SimpleRow[] {
  return rows
    .filter((r) => r.familiar)
    .sort((a, b) => FAMILIAR_ORDER.indexOf(a.symbol) - FAMILIAR_ORDER.indexOf(b.symbol));
}

/** Within a group: priced commodities first, original order kept. */
export function pricedFirst(rows: SimpleRow[]): SimpleRow[] {
  return [...rows].sort((a, b) => Number(b.hasPrice) - Number(a.hasPrice));
}
