/**
 * Paper trading discipline — mistake tags on closed practice trades and monthly mistake statistics (pure).
 * Education only: it helps the learner see which habits cost the most in simulation. Not advice.
 */

export const MISTAKE_TAGS = ['noStop', 'movedStop', 'oversized', 'fomo', 'revenge', 'offPlan', 'ignoredNews', 'heldTooLong', 'other'] as const;
export type MistakeTag = (typeof MISTAKE_TAGS)[number];
export const MISTAKE_NOTE_MAX = 140;

const TAG_SET = new Set<string>(MISTAKE_TAGS);

/** Keeps known tags only, deduplicated, in canonical order. Returns [] for anything else. */
export function normalizeMistakeTags(v: unknown): MistakeTag[] {
  if (!Array.isArray(v)) return [];
  const got = new Set(v.filter((x): x is string => typeof x === 'string' && TAG_SET.has(x)));
  return MISTAKE_TAGS.filter((t) => got.has(t));
}

export function normalizeMistakeNote(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, MISTAKE_NOTE_MAX) : '';
}

export interface MistakeStatTrade {
  pnlVnd: number;
  closedAtMs: number;
  mistakeTags?: MistakeTag[];
}

export interface MistakeRow {
  tag: MistakeTag;
  count: number;
  /** Loss (positive VND) attributed to this tag: each losing trade's loss is split equally among its tags. */
  lossVnd: number;
}

export interface MonthMistakeStats {
  /** 'YYYY-MM' (Vietnam time). */
  month: string;
  /** Closed trades in the month / of which tagged. */
  trades: number;
  taggedTrades: number;
  /** Sum of all attributed losses (equals the total loss of tagged losing trades). */
  attributedLossVnd: number;
  /** Tags used this month, most frequent first (ties: larger loss first). */
  rows: MistakeRow[];
  top3: MistakeRow[];
}

const VN_OFFSET_MS = 7 * 3600_000;

/** Calendar month key 'YYYY-MM' in Asia/Ho_Chi_Minh (fixed UTC+7). */
export function vnMonthKey(ms: number): string {
  const d = new Date(ms + VN_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Month key shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function computeMonthMistakes(trades: MistakeStatTrade[], month: string): MonthMistakeStats {
  const inMonth = trades.filter((t) => vnMonthKey(t.closedAtMs) === month);
  const acc = new Map<MistakeTag, MistakeRow>();
  let tagged = 0;
  let attributed = 0;
  for (const t of inMonth) {
    const tags = normalizeMistakeTags(t.mistakeTags);
    if (tags.length === 0) continue;
    tagged++;
    const loss = t.pnlVnd < 0 ? -t.pnlVnd : 0;
    attributed += loss;
    for (const tag of tags) {
      const row = acc.get(tag) ?? { tag, count: 0, lossVnd: 0 };
      row.count++;
      row.lossVnd += loss / tags.length;
      acc.set(tag, row);
    }
  }
  const rows = [...acc.values()].sort((a, b) => b.count - a.count || b.lossVnd - a.lossVnd || MISTAKE_TAGS.indexOf(a.tag) - MISTAKE_TAGS.indexOf(b.tag));
  return { month, trades: inMonth.length, taggedTrades: tagged, attributedLossVnd: attributed, rows, top3: rows.slice(0, 3) };
}
