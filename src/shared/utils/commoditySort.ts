import type { CommodityCycleSummary, CyclePhase } from '../types/cycle';

const PHASE_PRIORITY: Record<CyclePhase, number> = {
  PHASE_2_EARLY_RECOVERY: 4,
  PHASE_1_ACCUMULATION: 3,
  PHASE_3_MARKUP: 2,
  PHASE_4_DISTRIBUTION: 1,
  DATA_UNAVAILABLE: 0,
};

/**
 * Deterministic comparator placing high-potential commodities first:
 * 1. Commodities with verified cycle/bottom metrics ahead of DATA_UNAVAILABLE.
 * 2. Higher AI Opportunity Score (combines Bottom Score + Recovery/Accumulation cycle phase).
 * 3. Higher Bottom Score (0-100).
 * 4. Higher Phase priority (Early Recovery > Accumulation > Markup > Distribution).
 * 5. Active price quote available (`quote.price !== null`).
 * 6. MXV-listed tie-breaker, then symbol alphabetical.
 */
export function compareCommoditiesByPotential(
  a: CommodityCycleSummary,
  b: CommodityCycleSummary
): number {
  const aHasCycle = a.opportunityScore !== null || a.bottomScore !== null || a.cyclePhase !== 'DATA_UNAVAILABLE';
  const bHasCycle = b.opportunityScore !== null || b.bottomScore !== null || b.cyclePhase !== 'DATA_UNAVAILABLE';
  if (aHasCycle !== bHasCycle) return aHasCycle ? -1 : 1;

  const aOpp = a.opportunityScore ?? -1;
  const bOpp = b.opportunityScore ?? -1;
  if (bOpp !== aOpp) return bOpp - aOpp;

  const aBottom = a.bottomScore ?? -1;
  const bBottom = b.bottomScore ?? -1;
  if (bBottom !== aBottom) return bBottom - aBottom;

  const aPhaseRank = PHASE_PRIORITY[a.cyclePhase] ?? 0;
  const bPhaseRank = PHASE_PRIORITY[b.cyclePhase] ?? 0;
  if (bPhaseRank !== aPhaseRank) return bPhaseRank - aPhaseRank;

  const aHasPrice = a.quote.price !== null;
  const bHasPrice = b.quote.price !== null;
  if (aHasPrice !== bHasPrice) return aHasPrice ? -1 : 1;

  if (a.instrument.isMvxListed !== b.instrument.isMvxListed) {
    return a.instrument.isMvxListed ? -1 : 1;
  }

  return a.instrument.exchangeSymbol.localeCompare(b.instrument.exchangeSymbol);
}

/** Returns a new array ordered with highest-potential commodities first. */
export function sortCommoditiesByPotential(
  items: readonly CommodityCycleSummary[]
): CommodityCycleSummary[] {
  return [...items].sort(compareCommoditiesByPotential);
}
