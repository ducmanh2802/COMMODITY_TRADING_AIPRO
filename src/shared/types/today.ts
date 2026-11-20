import type { CycleMarketOverview } from './cycle';
import type { ScorecardListResponse } from './scorecard';

/** GET /api/today: everything the "Hôm nay nên chú ý gì" panel needs in one round-trip. */
export interface TodayResponse {
  /** Oldest `asOf` of the parts present (ISO), null when both are missing. */
  asOf: string | null;
  /** true when any part was served from an expired cache (refreshing in the background). */
  stale: boolean;
  scorecard: ScorecardListResponse | null;
  cycle: CycleMarketOverview | null;
}
