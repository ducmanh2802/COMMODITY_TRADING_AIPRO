import { ADVANCED_ITEMS, SETTINGS_ITEMS, resolveModule } from '../../layout/navMap';
import type { AppModuleId } from '../../../shared/types/risk';

/**
 * Optional modules built by other tasks (paper trading, hedging). A button is shown only when the module id is
 * registered in the app (navMap hub/tab, settings or advanced list); otherwise it is hidden, never a dead link.
 * `id` is cast because the AppModuleId union grows as those modules land.
 */
const PAPER_IDS = ['paper-trade', 'papertrade', 'paper'] as const;
const HEDGE_IDS = ['hedge', 'hedging'] as const;

function registered(id: string): boolean {
  const mid = id as AppModuleId;
  return resolveModule(mid) !== null || ADVANCED_ITEMS.includes(mid) || SETTINGS_ITEMS.includes(mid);
}

export function findModule(ids: readonly string[]): AppModuleId | null {
  const hit = ids.find(registered);
  return hit ? (hit as AppModuleId) : null;
}

export const paperModule = (): AppModuleId | null => findModule(PAPER_IDS);
export const hedgeModule = (): AppModuleId | null => findModule(HEDGE_IDS);
