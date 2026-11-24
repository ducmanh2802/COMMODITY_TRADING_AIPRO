/**
 * Weekly auto review of PAPER trades (pure, no React). ISO week Monday 00:00 -> next Monday 00:00 in Vietnam time
 * (Asia/Ho_Chi_Minh, fixed UTC+7, no DST). Simulation only: describes practice trades, never a forecast or advice.
 * Observations / focus points are i18n keys + params so they render in vi and en.
 */
import { equityCurve, maxDrawdown } from './paperStats';

const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
/** A single loss above this share of week-start equity is treated as an oversized position. */
export const BIG_LOSS_PCT = 5;
/** Fewer closed trades than this -> the week is a small sample. */
export const SMALL_SAMPLE = 5;
/** More closed trades than this in one week -> overtrading hint. */
export const MANY_TRADES = 15;

export interface WeeklyTrade {
  instrumentId: string;
  pnlVnd: number;
  rMultiple: number | null;
  stopLoss: number | null;
  closedAtMs: number;
  plan?: { riskPct: number | null; limitPct: number; onPlan: boolean; eventsOk?: boolean | null };
  /** Optional mistake tags (added by the trade journal feature; tolerated when absent). */
  mistakeTags?: readonly string[];
}

export type ReviewKey =
  | 'wr.obs.noTrades'
  | 'wr.obs.posExp'
  | 'wr.obs.negExp'
  | 'wr.obs.flat'
  | 'wr.obs.lossBigger'
  | 'wr.obs.noStop'
  | 'wr.obs.allStops'
  | 'wr.obs.oversized'
  | 'wr.obs.oneBigLoss'
  | 'wr.obs.manyTrades'
  | 'wr.obs.fewTrades'
  | 'wr.obs.topTag'
  | 'wr.obs.eventTrades'
  | 'wr.focus.practice'
  | 'wr.focus.alwaysStop'
  | 'wr.focus.size'
  | 'wr.focus.cutLosses'
  | 'wr.focus.tag'
  | 'wr.focus.fewerTrades'
  | 'wr.focus.keepJournal';

export interface ReviewLine {
  key: ReviewKey;
  params?: Record<string, string | number>;
}

export interface WeeklyReview {
  /** Vietnam calendar dates (YYYY-MM-DD) of Monday and Sunday. */
  weekStart: string;
  weekEnd: string;
  startMs: number;
  endMs: number;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
  avgWinVnd: number | null;
  avgLossVnd: number | null;
  totalPnlVnd: number;
  /** Mean P&L per trade (VND). */
  expectancyVnd: number | null;
  /** Mean R over trades with an R. */
  expectancyR: number | null;
  maxDrawdownVnd: number;
  maxDrawdownPct: number;
  /** Share of trades that had a stop-loss (0-100). */
  stopLossPct: number | null;
  biggestLoss: { vnd: number; instrumentId: string } | null;
  flags: { noStop: number; oversized: number; offPlan: number; eventTrades: number };
  topMistakeTag: { tag: string; count: number } | null;
  observations: ReviewLine[];
  focus: ReviewLine[];
}

const round = (v: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

const vnDate = (ms: number) => new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);

/** [start, end) UTC ms of the Vietnam ISO week containing `nowMs`, shifted by `weekOffset` weeks. */
export function vnWeekBounds(nowMs: number, weekOffset = 0): { startMs: number; endMs: number } {
  const dayNum = Math.floor((nowMs + VN_OFFSET_MS) / DAY_MS);
  const wd = (((dayNum + 4) % 7) + 7) % 7; // 0 = Sunday (1970-01-01 was a Thursday)
  const monday = dayNum - ((wd + 6) % 7) + 7 * weekOffset;
  const startMs = monday * DAY_MS - VN_OFFSET_MS;
  return { startMs, endMs: startMs + 7 * DAY_MS };
}

export function computeWeeklyReview(allTrades: readonly WeeklyTrade[], startingCapitalVnd: number, nowMs: number, weekOffset = 0): WeeklyReview {
  const { startMs, endMs } = vnWeekBounds(nowMs, weekOffset);
  const valid = allTrades.filter((t) => Number.isFinite(t.pnlVnd) && Number.isFinite(t.closedAtMs));
  const before = valid.filter((t) => t.closedAtMs < startMs);
  const week = valid.filter((t) => t.closedAtMs >= startMs && t.closedAtMs < endMs).sort((a, b) => a.closedAtMs - b.closedAtMs);
  const startEquity = (Number.isFinite(startingCapitalVnd) ? startingCapitalVnd : 0) + before.reduce((s, t) => s + t.pnlVnd, 0);

  const n = week.length;
  const winsArr = week.filter((t) => t.pnlVnd > 0);
  const lossArr = week.filter((t) => t.pnlVnd < 0);
  const total = week.reduce((s, t) => s + t.pnlVnd, 0);
  const rs = week.map((t) => t.rMultiple).filter((r): r is number => r !== null && Number.isFinite(r));
  const dd = maxDrawdown(equityCurve(week.map((t) => ({ instrumentId: t.instrumentId, pnlVnd: t.pnlVnd, rMultiple: t.rMultiple, closedAtMs: t.closedAtMs })), startEquity));

  const withStop = week.filter((t) => t.stopLoss !== null && Number.isFinite(t.stopLoss)).length;
  const bigLossLimit = startEquity > 0 ? (startEquity * BIG_LOSS_PCT) / 100 : Infinity;
  const oversized = week.filter((t) => (t.plan && t.plan.riskPct !== null && t.plan.riskPct > t.plan.limitPct) || -t.pnlVnd > bigLossLimit).length;
  const offPlan = week.filter((t) => t.plan && !t.plan.onPlan).length;
  const eventTrades = week.filter((t) => t.plan?.eventsOk === false).length;

  let biggest: WeeklyTrade | null = null;
  for (const t of lossArr) if (!biggest || t.pnlVnd < biggest.pnlVnd) biggest = t;

  const tagCount = new Map<string, number>();
  for (const t of week) {
    if (!Array.isArray(t.mistakeTags)) continue;
    for (const tag of new Set(t.mistakeTags)) if (typeof tag === 'string' && tag) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
  }
  let topTag: { tag: string; count: number } | null = null;
  for (const [tag, count] of tagCount) if (!topTag || count > topTag.count || (count === topTag.count && tag < topTag.tag)) topTag = { tag, count };

  const avgWin = winsArr.length ? round(winsArr.reduce((s, t) => s + t.pnlVnd, 0) / winsArr.length) : null;
  const avgLoss = lossArr.length ? round(lossArr.reduce((s, t) => s + t.pnlVnd, 0) / lossArr.length) : null;

  const base = {
    weekStart: vnDate(startMs),
    weekEnd: vnDate(endMs - DAY_MS),
    startMs,
    endMs,
    trades: n,
    wins: winsArr.length,
    losses: lossArr.length,
    winRatePct: n ? round((winsArr.length / n) * 100, 1) : null,
    avgWinVnd: avgWin,
    avgLossVnd: avgLoss,
    totalPnlVnd: round(total),
    expectancyVnd: n ? round(total / n) : null,
    expectancyR: rs.length ? round(rs.reduce((s, r) => s + r, 0) / rs.length, 2) : null,
    maxDrawdownVnd: round(dd.vnd),
    maxDrawdownPct: dd.pct,
    stopLossPct: n ? round((withStop / n) * 100, 0) : null,
    biggestLoss: biggest ? { vnd: round(biggest.pnlVnd), instrumentId: biggest.instrumentId } : null,
    flags: { noStop: n - withStop, oversized, offPlan, eventTrades },
    topMistakeTag: topTag,
  };
  const { observations, focus } = buildLines(base);
  return { ...base, observations, focus };
}

type Base = Omit<WeeklyReview, 'observations' | 'focus'>;

/** 2-4 observations and 1-2 focus points, in priority order. */
function buildLines(r: Base): { observations: ReviewLine[]; focus: ReviewLine[] } {
  if (r.trades === 0) return { observations: [{ key: 'wr.obs.noTrades' }], focus: [{ key: 'wr.focus.practice' }] };
  const obs: ReviewLine[] = [];
  const exp = r.expectancyVnd ?? 0;
  obs.push({ key: exp > 0 ? 'wr.obs.posExp' : exp < 0 ? 'wr.obs.negExp' : 'wr.obs.flat', params: { n: r.trades, win: r.winRatePct ?? 0 } });

  const lossBigger = r.avgWinVnd !== null && r.avgLossVnd !== null && Math.abs(r.avgLossVnd) > r.avgWinVnd;
  if (r.flags.noStop > 0) obs.push({ key: 'wr.obs.noStop', params: { n: r.flags.noStop } });
  if (r.flags.oversized > 0) obs.push({ key: 'wr.obs.oversized', params: { n: r.flags.oversized, pct: BIG_LOSS_PCT } });
  if (lossBigger) obs.push({ key: 'wr.obs.lossBigger', params: { ratio: round(Math.abs(r.avgLossVnd!) / r.avgWinVnd!, 1) } });
  if (r.topMistakeTag) obs.push({ key: 'wr.obs.topTag', params: { tag: r.topMistakeTag.tag, n: r.topMistakeTag.count } });
  if (r.flags.eventTrades > 0) obs.push({ key: 'wr.obs.eventTrades', params: { n: r.flags.eventTrades } });
  if (r.losses >= 2 && r.biggestLoss) {
    const totalLoss = Math.abs(r.avgLossVnd! * r.losses);
    if (totalLoss > 0 && Math.abs(r.biggestLoss.vnd) / totalLoss >= 0.5) obs.push({ key: 'wr.obs.oneBigLoss' });
  }
  if (r.trades > MANY_TRADES) obs.push({ key: 'wr.obs.manyTrades', params: { n: r.trades } });
  if (r.flags.noStop === 0) obs.push({ key: 'wr.obs.allStops' });
  if (r.trades < SMALL_SAMPLE) obs.push({ key: 'wr.obs.fewTrades', params: { min: SMALL_SAMPLE } });

  const focus: ReviewLine[] = [];
  if (r.flags.noStop > 0) focus.push({ key: 'wr.focus.alwaysStop' });
  if (r.flags.oversized > 0) focus.push({ key: 'wr.focus.size' });
  if (lossBigger) focus.push({ key: 'wr.focus.cutLosses' });
  if (r.topMistakeTag) focus.push({ key: 'wr.focus.tag', params: { tag: r.topMistakeTag.tag } });
  if (r.trades > MANY_TRADES) focus.push({ key: 'wr.focus.fewerTrades' });
  if (focus.length === 0) focus.push({ key: 'wr.focus.keepJournal' });

  // Keep the small-sample caveat when it applies (it changes how the rest should be read).
  let observations = obs.slice(0, 4);
  const few = obs.find((o) => o.key === 'wr.obs.fewTrades');
  if (few && !observations.includes(few)) observations = [...observations.slice(0, 3), few];
  return { observations, focus: focus.slice(0, 2) };
}

/** Numbers-only summary for the optional AI narrative (no names, ids, journals or instruments). */
export function reviewSummaryForAi(r: WeeklyReview): Record<string, number | string | null> {
  return {
    trades: r.trades,
    wins: r.wins,
    losses: r.losses,
    winRatePct: r.winRatePct,
    avgWinVnd: r.avgWinVnd,
    avgLossVnd: r.avgLossVnd,
    totalPnlVnd: r.totalPnlVnd,
    expectancyVnd: r.expectancyVnd,
    expectancyR: r.expectancyR,
    maxDrawdownPct: r.maxDrawdownPct,
    stopLossPct: r.stopLossPct,
    biggestLossVnd: r.biggestLoss?.vnd ?? null,
    noStop: r.flags.noStop,
    oversized: r.flags.oversized,
    offPlan: r.flags.offPlan,
    eventTrades: r.flags.eventTrades,
    topMistakeTag: r.topMistakeTag?.tag ?? null,
  };
}
