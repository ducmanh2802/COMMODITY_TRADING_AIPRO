export type LearnGoal = 'understand' | 'hedge' | 'swing';

export const LEARN_GOALS: LearnGoal[] = ['understand', 'hedge', 'swing'];

/** Recommended lesson order per goal. A suggestion only: every level stays open. */
export const LEARN_PATHS: Record<LearnGoal, string[]> = {
  understand: [
    'l1-commodity', 'l1-spot-futures', 'l1-hedger-spec', 'l1-contract', 'l2-mxv', 'l3-grains', 'l3-precious', 'l3-oil',
    'l4-fundamental', 'l4-curve', 'l4-seasonal', 'l4-cot', 'l4-correlation', 'l6-data-labels', 'l5-mistakes', 'l5-who-profits', 'l5-scam',
  ],
  hedge: [
    'l1-commodity', 'l1-spot-futures', 'l1-hedger-spec', 'l1-contract', 'l1-margin', 'l1-expiry-roll', 'l2-mxv', 'l2-fx-fees',
    'l3-grains', 'l3-soy', 'l3-coffee', 'l4-fundamental', 'l4-curve', 'l5-sizing', 'l5-mistakes', 'l5-who-profits', 'l10-contract', 'l10-costs', 'l10-account',
  ],
  swing: [
    'l1-spot-futures', 'l1-contract', 'l1-margin', 'l1-pnl', 'l8-dow', 'l8-price-action', 'l8-volume', 'l8-combine',
    'l5-sizing', 'l5-stop', 'l5-mistakes', 'l5-who-profits', 'l7-swing', 'l7-backtest', 'l9-expectancy', 'l9-setups', 'l10-account', 'l10-margin', 'l9-plan',
  ],
};

function isLearnGoal(v: unknown): v is LearnGoal {
  return v === 'understand' || v === 'hedge' || v === 'swing';
}

export interface PathStatus {
  total: number;
  doneCount: number;
  /** 1-based step number of the next unfinished lesson (total when all done). */
  step: number;
  /** Next unfinished lesson id, or null when the whole path is done. */
  nextId: string | null;
}

/** Next unfinished lesson of a goal path. `lessons` is the `lessons` map of LearnProgress. */
export function nextLesson(goal: LearnGoal, lessons: Record<string, { done?: boolean } | undefined>): PathStatus {
  const path = LEARN_PATHS[goal];
  const doneCount = path.filter((id) => lessons[id]?.done).length;
  const idx = path.findIndex((id) => !lessons[id]?.done);
  return { total: path.length, doneCount, step: idx < 0 ? path.length : idx + 1, nextId: idx < 0 ? null : path[idx] };
}

const KEY = 'ctap.learnGoal';

export function loadGoal(): LearnGoal | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return isLearnGoal(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveGoal(goal: LearnGoal | null) {
  try {
    if (goal) window.localStorage.setItem(KEY, goal);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: choice lives for this session only.
  }
}
