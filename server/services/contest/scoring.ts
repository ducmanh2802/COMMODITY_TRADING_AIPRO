/** T63 - discipline score (0-100), combined ranking and badges. Pure functions. */
import { createHash } from 'node:crypto';
import { ictDayKey } from './season.ts';

export const MAX_RISK_PCT_PER_TRADE = 2;
export const MAX_ORDERS_PER_DAY = 6;

export interface ScoredOrder {
  hasStop: boolean;
  /** Risk to the stop incl. fees, as % of starting capital. */
  riskPct: number | null;
  createdAtMs: number;
  /** Pre-trade checklist completed? null = not provided. */
  checklistDone: boolean | null;
}

export interface DisciplineBreakdown {
  score: number;
  stopPct: number;
  riskPct: number;
  drawdownPts: number;
  overtradingPts: number;
  checklistBonus: number;
}

/** Max drawdown (%, peak-to-trough of equity) over a series of equity values. */
export function maxDrawdownPct(equities: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const e of equities) {
    if (e > peak) peak = e;
    if (peak > 0) worst = Math.max(worst, ((peak - e) / peak) * 100);
  }
  return worst;
}

/**
 * Discipline: stop on every order (25), risk <= 2%/trade (30), max drawdown (25: full <= 5%, zero >= 20%),
 * overtrading (20: > 6 orders in one Vietnam day costs 5 points per extra order), plus up to +10 for plan
 * checklist usage when provided. Returns null when there are no orders.
 */
export function disciplineScore(orders: ScoredOrder[], maxDdPct: number): DisciplineBreakdown | null {
  if (orders.length === 0) return null;
  const n = orders.length;
  const stopPct = (orders.filter((o) => o.hasStop).length / n) * 100;
  const riskOk = (orders.filter((o) => o.riskPct !== null && o.riskPct <= MAX_RISK_PCT_PER_TRADE).length / n) * 100;
  const drawdownPts = maxDdPct <= 5 ? 100 : maxDdPct >= 20 ? 0 : ((20 - maxDdPct) / 15) * 100;
  const perDay = new Map<string, number>();
  for (const o of orders) perDay.set(ictDayKey(o.createdAtMs), (perDay.get(ictDayKey(o.createdAtMs)) ?? 0) + 1);
  let excess = 0;
  for (const c of perDay.values()) excess += Math.max(0, c - MAX_ORDERS_PER_DAY);
  const overtradingPts = Math.max(0, 100 - excess * 5);
  const provided = orders.filter((o) => o.checklistDone !== null);
  const checklistBonus = provided.length === 0 ? 0 : (provided.filter((o) => o.checklistDone).length / provided.length) * 10;
  const base = stopPct * 0.25 + riskOk * 0.3 + drawdownPts * 0.25 + overtradingPts * 0.2;
  const score = Math.round(Math.min(100, Math.max(0, base + checklistBonus)));
  return { score, stopPct, riskPct: riskOk, drawdownPts, overtradingPts, checklistBonus };
}

export interface RankInput {
  id: string;
  returnPct: number;
  discipline: number;
}
export interface RankedRow extends RankInput {
  returnRankPct: number;
  combined: number;
  rank: number;
}

/** Combined = 50% return percentile (0-100, ties share the average) + 50% discipline. */
export function combinedRanking(rows: RankInput[]): RankedRow[] {
  const n = rows.length;
  const sortedRet = [...rows].sort((a, b) => a.returnPct - b.returnPct);
  const pctile = (r: RankInput): number => {
    if (n === 1) return 100;
    const lo = sortedRet.findIndex((x) => x.returnPct === r.returnPct);
    const hi = n - 1 - [...sortedRet].reverse().findIndex((x) => x.returnPct === r.returnPct);
    return (((lo + hi) / 2) / (n - 1)) * 100;
  };
  const out = rows.map((r) => {
    const returnRankPct = pctile(r);
    return { ...r, returnRankPct, combined: Math.round((0.5 * returnRankPct + 0.5 * r.discipline) * 10) / 10, rank: 0 };
  });
  out.sort((a, b) => b.combined - a.combined || b.returnPct - a.returnPct || a.id.localeCompare(b.id));
  out.forEach((r, i) => (r.rank = i + 1));
  return out;
}

export type BadgeId = 'IRON_DISCIPLINE' | 'NO_BLOWUP' | 'STEADY';

export function computeBadges(s: { orders: number; closedTrades: number; discipline: number; maxDdPct: number; returnPct: number }): BadgeId[] {
  const b: BadgeId[] = [];
  if (s.orders >= 5 && s.discipline >= 90) b.push('IRON_DISCIPLINE');
  if (s.orders >= 1 && s.maxDdPct < 20 && s.returnPct > -20) b.push('NO_BLOWUP');
  if (s.closedTrades >= 5 && s.maxDdPct <= 10 && s.returnPct >= 0) b.push('STEADY');
  return b;
}

/** Public participant tag, stable per (season, uid) and not reversible to the uid. */
export function publicTag(season: string, uid: string): string {
  return createHash('sha256').update(`contest:${season}:${uid}`).digest('hex').slice(0, 10);
}

/** "Nhà đầu tư #1234" derived from the tag. */
export function anonymousName(tag: string): string {
  return `Nhà đầu tư #${1000 + (parseInt(tag.slice(0, 8), 16) % 9000)}`;
}

/** Optional display name: trimmed, control chars/markup removed, max 24 chars; '' -> null. */
export function sanitizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return s.length >= 2 ? s : null;
}
