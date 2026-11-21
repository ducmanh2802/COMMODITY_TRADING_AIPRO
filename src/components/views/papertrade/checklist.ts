/**
 * Pre-trade checklist ("Kiểm tra trước khi vào lệnh"): pure scoring + risk maths + record migration.
 * Based on the 5-step chart-reading process (lesson l8-combine). Education only — never blocks an order,
 * it only asks for a confirmation. No React / Firebase imports so it is unit-testable.
 */
import type { Side } from './paperMath';

export const CHECK_IDS = ['trend', 'zone', 'signal', 'volume', 'plan'] as const;
export type CheckId = (typeof CHECK_IDS)[number];
export type Answer = 'yes' | 'no' | null;
export type Answers = Record<CheckId, Answer>;
/** Auto-check on upcoming reports: 'clear' (none in 24h), 'event' (one is due), null (unknown -> manual item). */
export type EventState = 'clear' | 'event' | null;

export const DEFAULT_RISK_LIMIT_PCT = 2;
export const MIN_GOOD_R = 1.5;

export const EMPTY_ANSWERS: Answers = { trend: null, zone: null, signal: null, volume: null, plan: null };

export interface ChecklistScore {
  /** Items counted (5 manual + the events item). */
  total: number;
  passed: number;
  /** "Không" answers + unanswered items + a due event. */
  notMet: number;
  unanswered: number;
}

/** Events item: auto when `events` known; when unknown it is a manual item answered through `eventsManual`. */
export function scoreChecklist(answers: Answers, events: EventState, eventsManual: Answer = null): ChecklistScore {
  let passed = 0;
  let unanswered = 0;
  for (const id of CHECK_IDS) {
    if (answers[id] === 'yes') passed++;
    else if (answers[id] === null) unanswered++;
  }
  const ev: Answer = events === 'clear' ? 'yes' : events === 'event' ? 'no' : eventsManual;
  if (ev === 'yes') passed++;
  else if (ev === null) unanswered++;
  const total = CHECK_IDS.length + 1;
  return { total, passed, notMet: total - passed, unanswered };
}

export interface RiskInput {
  side: Side;
  fill: number;
  stopLoss: number | null;
  takeProfit: number | null;
  contracts: number;
  /** USD per 1.0 quoted price per contract. */
  pointValueUsd: number;
  feePerContractUsd: number;
  fx: number;
  equityVnd: number;
  limitPct: number;
}

export type RiskLevel = 'ok' | 'lowR' | 'overLimit';

export interface RiskResult {
  riskVnd: number;
  /** Risk as % of paper equity. */
  riskPct: number;
  /** Reward : risk after round-trip fees; null when no target. */
  r: number | null;
  level: RiskLevel;
}

/** Null when there is no valid stop (or inputs are unusable). Over-limit wins over low-R. */
export function computeRisk(i: RiskInput): RiskResult | null {
  if (i.stopLoss === null || !(i.equityVnd > 0) || !(i.fx > 0) || !(i.contracts >= 1) || !(i.pointValueUsd > 0)) return null;
  const long = i.side === 'LONG';
  if (long ? i.stopLoss >= i.fill : i.stopLoss <= i.fill) return null;
  const feeRoundTripVnd = i.feePerContractUsd * i.contracts * i.fx * 2;
  const riskVnd = Math.abs(i.fill - i.stopLoss) * i.pointValueUsd * i.contracts * i.fx + feeRoundTripVnd;
  const riskPct = (riskVnd / i.equityVnd) * 100;
  let r: number | null = null;
  if (i.takeProfit !== null && (long ? i.takeProfit > i.fill : i.takeProfit < i.fill)) {
    const rewardVnd = Math.abs(i.takeProfit - i.fill) * i.pointValueUsd * i.contracts * i.fx - feeRoundTripVnd;
    r = Math.round((rewardVnd / riskVnd) * 100) / 100;
  }
  const level: RiskLevel = riskPct > i.limitPct ? 'overLimit' : r !== null && r < MIN_GOOD_R ? 'lowR' : 'ok';
  return { riskVnd, riskPct, r, level };
}

/** Plan record stored on the position and copied onto the closed trade. Optional on old records. */
export interface PaperPlan {
  answers: Answers;
  /** Events item at order time (auto, or the manual answer); null = unanswered. */
  eventsOk: boolean | null;
  r: number | null;
  riskPct: number | null;
  limitPct: number;
  /** True when every item passed and risk is within limit. */
  onPlan: boolean;
}

export function buildPlan(answers: Answers, events: EventState, eventsManual: Answer, risk: RiskResult | null, limitPct: number): PaperPlan {
  const s = scoreChecklist(answers, events, eventsManual);
  const eventsOk = events === 'clear' ? true : events === 'event' ? false : eventsManual === null ? null : eventsManual === 'yes';
  return {
    answers: { ...answers },
    eventsOk,
    r: risk?.r ?? null,
    riskPct: risk ? Math.round(risk.riskPct * 100) / 100 : null,
    limitPct,
    onPlan: s.notMet === 0 && risk !== null && risk.level !== 'overLimit',
  };
}

/** Items to warn about before placing: not-met checklist items, plus 1 if the risk is over the limit. */
export function warnCount(score: ChecklistScore, risk: RiskResult | null): number {
  return score.notMet + (risk?.level === 'overLimit' ? 1 : 0);
}

const ANSWER = (v: unknown): Answer => (v === 'yes' || v === 'no' ? v : null);
const NUM = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Backward-compatible parse: undefined for old records (no `plan`) or garbage. */
export function normalizePlan(raw: unknown): PaperPlan | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const a = (o.answers && typeof o.answers === 'object' ? o.answers : {}) as Record<string, unknown>;
  const answers = { ...EMPTY_ANSWERS };
  for (const id of CHECK_IDS) answers[id] = ANSWER(a[id]);
  return {
    answers,
    eventsOk: typeof o.eventsOk === 'boolean' ? o.eventsOk : null,
    r: NUM(o.r),
    riskPct: NUM(o.riskPct),
    limitPct: NUM(o.limitPct) ?? DEFAULT_RISK_LIMIT_PCT,
    onPlan: o.onPlan === true,
  };
}

/** 'event' when any upcoming report (date 'YYYY-MM-DD' or ISO) falls from now to now+24h (date-level: today/tomorrow). */
export function eventsState(upcoming: { date: string }[] | null | undefined, nowMs: number): EventState {
  if (!upcoming) return null;
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const today = day(nowMs);
  const tomorrow = day(nowMs + 24 * 3600 * 1000);
  return upcoming.some((e) => typeof e.date === 'string' && (e.date.slice(0, 10) === today || e.date.slice(0, 10) === tomorrow)) ? 'event' : 'clear';
}
