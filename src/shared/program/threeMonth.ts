/**
 * "Lộ trình 3 tháng": a 12-week learning + paper-trading programme built from existing app data.
 * Pure (no React, storage injected). Education only: thresholds are practice heuristics, not guarantees and not advice.
 * Discipline score mirrors server/services/contest/scoring.ts (that file imports node:crypto so it cannot be shared).
 */
import { computePerformance, type StatTrade } from '../../components/views/papertrade/paperStats';

export const PROGRAM_WEEKS = 12;
export const PROGRAM_KEY = 'ctap.program.v1';
const DAY_MS = 86_400_000;

export type Phase = 1 | 2 | 3;
export const phaseOfWeek = (week: number): Phase => (week <= 4 ? 1 : week <= 8 ? 2 : 3);

// --------------------------------------------------------------------------- thresholds (educational heuristics)

export const THRESHOLDS = {
  quizPct: 80,
  maxAvgRiskPct: 2,
  minStopPct: 95,
  expectancyWindow: 30,
  maxDrawdownPct: 15,
  minDiscipline: 70,
  readinessTrades: 50,
} as const;

// --------------------------------------------------------------------------- task model

export type TaskLink = 'lesson' | 'learn' | 'paper' | 'lab' | 'contest' | 'journal' | 'review' | 'exam';

export type TaskSpec =
  | { id: string; kind: 'lessons'; lessonIds: string[]; link: TaskLink }
  | { id: string; kind: 'quiz'; lessonIds: string[]; link: TaskLink }
  | { id: string; kind: 'trades'; n: number; link: TaskLink }
  | { id: string; kind: 'stopTrades'; n: number; link: TaskLink }
  | { id: string; kind: 'journal'; n: number; link: TaskLink }
  | { id: string; kind: 'review'; link: TaskLink }
  | { id: string; kind: 'exam'; examId: string; link: TaskLink }
  /** Not provable from local data: only the user can tick it ("tự đánh dấu"). */
  | { id: string; kind: 'manual'; link: TaskLink };

export type MetricId = 'lessons' | 'trades' | 'stopPct' | 'avgRisk' | 'expectancy' | 'drawdown' | 'winRate' | 'discipline';

export interface WeekSpec {
  week: number;
  phase: Phase;
  lessonIds: string[];
  tasks: TaskSpec[];
  metrics: MetricId[];
}

const L = (week: number, lessonIds: string[], extra: TaskSpec[], metrics: MetricId[], opts: { review?: boolean } = {}): WeekSpec => ({
  week,
  phase: phaseOfWeek(week),
  lessonIds,
  tasks: [
    { id: `w${week}.lessons`, kind: 'lessons', lessonIds, link: 'lesson' },
    { id: `w${week}.quiz`, kind: 'quiz', lessonIds, link: 'lesson' },
    ...extra,
    ...(opts.review === false ? [] : ([{ id: `w${week}.review`, kind: 'review', link: 'review' }] as TaskSpec[])),
  ],
  metrics,
});

const trades = (week: number, n: number): TaskSpec => ({ id: `w${week}.trades`, kind: 'trades', n, link: 'paper' });
const stopTrades = (week: number, n: number): TaskSpec => ({ id: `w${week}.stopTrades`, kind: 'stopTrades', n, link: 'paper' });
const journal = (week: number, n: number): TaskSpec => ({ id: `w${week}.journal`, kind: 'journal', n, link: 'paper' });
const manual = (week: number, key: string, link: TaskLink): TaskSpec => ({ id: `w${week}.${key}`, kind: 'manual', link });
const exam = (week: number, examId: string): TaskSpec => ({ id: `w${week}.exam.${examId}`, kind: 'exam', examId, link: 'exam' });

/** Lesson ids are real curriculum ids (validated in tests). Trade/journal targets are cumulative since the start date. */
export const PROGRAM: WeekSpec[] = [
  // Tháng 1: Nền tảng
  L(1, ['l1-commodity', 'l1-spot-futures', 'l1-hedger-spec', 'l1-contract'], [], ['lessons'], { review: false }),
  L(2, ['l1-margin', 'l1-pnl', 'l1-expiry-roll', 'l2-mxv'], [trades(2, 1)], ['lessons', 'trades']),
  L(3, ['l2-brokers', 'l2-hours', 'l2-fx-fees', 'l2-account', 'l2-legal'], [trades(3, 3)], ['lessons', 'trades', 'stopPct']),
  L(4, ['l4-technical', 'l4-fundamental', 'l3-grains', 'l3-precious'], [trades(4, 5), exam(4, 'l1')], ['lessons', 'trades', 'stopPct', 'avgRisk']),
  // Tháng 2: Phương pháp
  L(5, ['l8-dow', 'l8-price-action', 'l8-volume', 'l8-combine'], [stopTrades(5, 8), journal(5, 3)], ['trades', 'stopPct', 'avgRisk']),
  L(6, ['l5-sizing', 'l5-stop', 'l5-journal'], [stopTrades(6, 12), journal(6, 5)], ['trades', 'stopPct', 'avgRisk', 'winRate']),
  L(7, ['l5-mistakes', 'l5-who-profits', 'l5-scam', 'l6-data-labels', 'l6-indicators'], [stopTrades(7, 16), journal(7, 8)], ['stopPct', 'avgRisk', 'expectancy', 'drawdown']),
  L(
    8,
    ['l7-swing', 'l7-backtest', 'l4-seasonal', 'l4-curve'],
    [stopTrades(8, 20), journal(8, 11), manual(8, 'backtest', 'lab'), manual(8, 'walkForward', 'lab'), exam(8, 'l5')],
    ['trades', 'stopPct', 'expectancy', 'drawdown']
  ),
  // Tháng 3: Kỷ luật & đánh giá
  L(9, ['l6-process', 'l6-example', 'l7-roadmap', 'l9-living'], [stopTrades(9, 24), journal(9, 15), manual(9, 'contest', 'contest')], ['avgRisk', 'expectancy', 'discipline']),
  L(10, ['l9-expectancy', 'l9-money', 'l9-setups', 'l9-mtf'], [stopTrades(10, 30), journal(10, 20), manual(10, 'weeklyReview', 'paper')], ['expectancy', 'drawdown', 'discipline']),
  L(11, ['l9-psychology', 'l9-plan', 'l9-review', 'l10-account'], [stopTrades(11, 40), journal(11, 28), manual(11, 'weeklyReview', 'paper')], ['stopPct', 'expectancy', 'drawdown', 'discipline']),
  L(
    12,
    ['l10-contract', 'l10-margin', 'l10-costs', 'l10-ways', 'l10-ready'],
    [stopTrades(12, 50), journal(12, 36), manual(12, 'weeklyReview', 'paper'), exam(12, 'final')],
    ['stopPct', 'avgRisk', 'expectancy', 'drawdown', 'discipline']
  ),
];

export const weekSpec = (week: number): WeekSpec => PROGRAM[Math.min(PROGRAM_WEEKS, Math.max(1, week)) - 1];

// --------------------------------------------------------------------------- start date + week calculation

export interface ProgramState {
  /** YYYY-MM-DD, null = not started. */
  startDate: string | null;
  /** Manually ticked task ids ("tự đánh dấu"). Stored separately from data-proven checks. */
  manual: Record<string, boolean>;
}

export const EMPTY_PROGRAM: ProgramState = { startDate: null, manual: {} };

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Local midnight of a YYYY-MM-DD date. */
export function startMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function todayDate(now: number = Date.now()): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface WeekInfo {
  /** Current week 1..12 (clamped). */
  week: number;
  /** Whole days since the start date (negative when the start is in the future). */
  daysElapsed: number;
  /** True when the 12 weeks are over (the user can keep going: content is never blocked). */
  pastEnd: boolean;
  /** True when the start date is still in the future. */
  notYet: boolean;
}

/** Week = floor(days since start / 7) + 1, clamped to 1..12. */
export function weekInfo(startDate: string, now: number = Date.now()): WeekInfo {
  const days = Math.floor((now - startMs(startDate)) / DAY_MS);
  const raw = Math.floor(days / 7) + 1;
  return { week: Math.min(PROGRAM_WEEKS, Math.max(1, raw)), daysElapsed: days, pastEnd: raw > PROGRAM_WEEKS, notYet: days < 0 };
}

export function parseProgram(raw: string | null): ProgramState {
  const empty = (): ProgramState => ({ startDate: null, manual: {} });
  if (!raw) return empty();
  try {
    const o: unknown = JSON.parse(raw);
    if (!o || typeof o !== 'object') return empty();
    const r = o as { startDate?: unknown; manual?: unknown };
    const manualMap: Record<string, boolean> = {};
    if (r.manual && typeof r.manual === 'object') {
      for (const [k, v] of Object.entries(r.manual as Record<string, unknown>)) if (v === true) manualMap[k] = true;
    }
    return { startDate: isValidDate(r.startDate) ? r.startDate : null, manual: manualMap };
  } catch {
    return empty();
  }
}

export function serializeProgram(s: ProgramState): string {
  return JSON.stringify({ version: 1, startDate: s.startDate, manual: s.manual });
}

export function loadProgram(): ProgramState {
  try {
    return parseProgram(window.localStorage.getItem(PROGRAM_KEY));
  } catch {
    return { startDate: null, manual: {} };
  }
}

export function saveProgram(s: ProgramState): void {
  try {
    window.localStorage.setItem(PROGRAM_KEY, serializeProgram(s));
  } catch {
    // Storage blocked: the programme lives for this session only.
  }
}

// --------------------------------------------------------------------------- data snapshot + metrics

export interface ProgramTrade {
  openedAtMs: number;
  closedAtMs: number;
  hasStop: boolean;
  /** Risk to the stop at order time, % of paper equity (from the pre-trade plan); null when unknown. */
  riskPct: number | null;
  pnlVnd: number;
  rMultiple: number | null;
  hasJournal: boolean;
  /** Pre-trade checklist completed? null = not recorded. */
  checklistDone: boolean | null;
}

export interface ProgramData {
  lessons: Record<string, { done?: boolean; best?: number } | undefined>;
  /** Exam id (level id such as "l1", or "final") -> passed. */
  examsPassed: Record<string, boolean>;
  trades: ProgramTrade[];
  startingCapitalVnd: number;
  /** Review questions due now. */
  reviewDue: number;
}

export interface ScoredOrder {
  hasStop: boolean;
  riskPct: number | null;
  createdAtMs: number;
  checklistDone: boolean | null;
}

const ICT_OFFSET_MS = 7 * 3_600_000;
const ictDayKey = (ms: number) => new Date(ms + ICT_OFFSET_MS).toISOString().slice(0, 10);

/** Same formula as the contest discipline score (0-100): stop 25, risk <=2% 30, drawdown 25, overtrading 20, +10 checklist. Null if no orders. */
export function disciplineScore(orders: ScoredOrder[], maxDdPct: number): number | null {
  if (orders.length === 0) return null;
  const n = orders.length;
  const stopPct = (orders.filter((o) => o.hasStop).length / n) * 100;
  const riskOk = (orders.filter((o) => o.riskPct !== null && o.riskPct <= THRESHOLDS.maxAvgRiskPct).length / n) * 100;
  const drawdownPts = maxDdPct <= 5 ? 100 : maxDdPct >= 20 ? 0 : ((20 - maxDdPct) / 15) * 100;
  const perDay = new Map<string, number>();
  for (const o of orders) perDay.set(ictDayKey(o.createdAtMs), (perDay.get(ictDayKey(o.createdAtMs)) ?? 0) + 1);
  let excess = 0;
  for (const c of perDay.values()) excess += Math.max(0, c - 6);
  const overtradingPts = Math.max(0, 100 - excess * 5);
  const provided = orders.filter((o) => o.checklistDone !== null);
  const bonus = provided.length === 0 ? 0 : (provided.filter((o) => o.checklistDone).length / provided.length) * 10;
  return Math.round(Math.min(100, Math.max(0, stopPct * 0.25 + riskOk * 0.3 + drawdownPts * 0.25 + overtradingPts * 0.2 + bonus)));
}

export interface ProgramMetrics {
  lessonsDone: number;
  lessonsTotal: number;
  trades: number;
  tradesWithStop: number;
  tradesWithJournal: number;
  stopPct: number | null;
  /** Mean risk per trade (% of equity) over trades whose risk is known. */
  avgRiskPct: number | null;
  riskKnown: number;
  /** Mean R over the last N trades that have an R; null when none. */
  expectancyR: number | null;
  expectancyCount: number;
  maxDrawdownPct: number | null;
  winRatePct: number | null;
  discipline: number | null;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Trades closed on or after the start date, oldest first. */
export function tradesSince(all: ProgramTrade[], start: number): ProgramTrade[] {
  return all.filter((t) => t.closedAtMs >= start).sort((a, b) => a.closedAtMs - b.closedAtMs);
}

export function computeMetrics(data: ProgramData, lessonsTotal: number, since: ProgramTrade[]): ProgramMetrics {
  const n = since.length;
  const withStop = since.filter((t) => t.hasStop).length;
  const risks = since.map((t) => t.riskPct).filter((x): x is number => x !== null && Number.isFinite(x));
  const last = since.slice(-THRESHOLDS.expectancyWindow);
  const rs = last.map((t) => t.rMultiple).filter((x): x is number => x !== null && Number.isFinite(x));
  const stat: StatTrade[] = since.map((t) => ({ instrumentId: '-', pnlVnd: t.pnlVnd, rMultiple: t.rMultiple, closedAtMs: t.closedAtMs }));
  const perf = n > 0 && data.startingCapitalVnd > 0 ? computePerformance(stat, data.startingCapitalVnd) : null;
  const dd = perf ? perf.maxDrawdown.pct : null;
  return {
    lessonsDone: Object.values(data.lessons).filter((l) => l?.done).length,
    lessonsTotal,
    trades: n,
    tradesWithStop: withStop,
    tradesWithJournal: since.filter((t) => t.hasJournal).length,
    stopPct: n ? r1((withStop / n) * 100) : null,
    avgRiskPct: risks.length ? r2(risks.reduce((s, x) => s + x, 0) / risks.length) : null,
    riskKnown: risks.length,
    expectancyR: rs.length ? r2(rs.reduce((s, x) => s + x, 0) / rs.length) : null,
    expectancyCount: rs.length,
    maxDrawdownPct: dd,
    winRatePct: perf ? perf.winRatePct : null,
    discipline: n
      ? disciplineScore(
          since.map((t) => ({ hasStop: t.hasStop, riskPct: t.riskPct, createdAtMs: t.openedAtMs, checklistDone: t.checklistDone })),
          dd ?? 0
        )
      : null,
  };
}

// --------------------------------------------------------------------------- task auto-check

export interface TaskStatus {
  id: string;
  /** Proven by local data. */
  auto: boolean;
  /** Ticked by the user ("tự đánh dấu"). */
  manual: boolean;
  done: boolean;
  /** Progress parts for the UI. */
  have: number;
  need: number;
}

/** A task is auto-checked only when the data proves it; "manual" tasks can only be ticked by the user. */
export function taskStatus(task: TaskSpec, data: ProgramData, m: ProgramMetrics, state: ProgramState): TaskStatus {
  const ticked = state.manual[task.id] === true;
  const mk = (auto: boolean, have: number, need: number): TaskStatus => ({
    id: task.id,
    auto,
    manual: !auto && ticked,
    done: auto || ticked,
    have,
    need,
  });
  switch (task.kind) {
    case 'lessons': {
      const have = task.lessonIds.filter((id) => data.lessons[id]?.done).length;
      return mk(have === task.lessonIds.length, have, task.lessonIds.length);
    }
    case 'quiz': {
      const have = task.lessonIds.filter((id) => (data.lessons[id]?.best ?? 0) >= THRESHOLDS.quizPct).length;
      return mk(have === task.lessonIds.length, have, task.lessonIds.length);
    }
    case 'trades':
      return mk(m.trades >= task.n, Math.min(m.trades, task.n), task.n);
    case 'stopTrades':
      return mk(m.tradesWithStop >= task.n, Math.min(m.tradesWithStop, task.n), task.n);
    case 'journal':
      return mk(m.tradesWithJournal >= task.n, Math.min(m.tradesWithJournal, task.n), task.n);
    case 'review':
      // An empty queue only proves something once the user has studied at least one lesson.
      return mk(data.reviewDue === 0 && m.lessonsDone > 0, data.reviewDue === 0 ? 1 : 0, 1);
    case 'exam':
      return mk(data.examsPassed[task.examId] === true, data.examsPassed[task.examId] ? 1 : 0, 1);
    case 'manual':
      return mk(false, ticked ? 1 : 0, 1);
  }
}

export interface WeekProgress {
  week: number;
  tasks: { spec: TaskSpec; status: TaskStatus }[];
  doneCount: number;
  total: number;
  pct: number;
}

export function weekProgress(week: number, data: ProgramData, m: ProgramMetrics, state: ProgramState): WeekProgress {
  const tasks = weekSpec(week).tasks.map((spec) => ({ spec, status: taskStatus(spec, data, m, state) }));
  const doneCount = tasks.filter((t) => t.status.done).length;
  return { week, tasks, doneCount, total: tasks.length, pct: tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0 };
}

// --------------------------------------------------------------------------- week checkpoints

export type CheckState = 'met' | 'notYet' | 'noData';

export interface Checkpoint {
  id: MetricId;
  state: CheckState;
  /** Current value (null when no data). */
  value: number | null;
}

/** Checkpoints are informative: they show where the practice data stands, they never block anything. */
export function checkpoint(id: MetricId, m: ProgramMetrics, week: number): Checkpoint {
  const c = (state: CheckState, value: number | null): Checkpoint => ({ id, state, value });
  switch (id) {
    case 'lessons': {
      const need = PROGRAM.filter((w) => w.week <= week).reduce((s, w) => s + w.lessonIds.length, 0);
      return c(m.lessonsDone >= need ? 'met' : 'notYet', m.lessonsDone);
    }
    case 'trades': {
      const need = weekSpec(week).tasks.reduce((s, t) => (t.kind === 'trades' || t.kind === 'stopTrades' ? Math.max(s, t.n) : s), 0);
      return c(need === 0 ? 'noData' : m.trades >= need ? 'met' : 'notYet', m.trades);
    }
    case 'stopPct':
      return m.stopPct === null ? c('noData', null) : c(m.stopPct >= THRESHOLDS.minStopPct ? 'met' : 'notYet', m.stopPct);
    case 'avgRisk':
      return m.avgRiskPct === null ? c('noData', null) : c(m.avgRiskPct <= THRESHOLDS.maxAvgRiskPct ? 'met' : 'notYet', m.avgRiskPct);
    case 'expectancy':
      return m.expectancyR === null ? c('noData', null) : c(m.expectancyR > 0 ? 'met' : 'notYet', m.expectancyR);
    case 'drawdown':
      return m.maxDrawdownPct === null ? c('noData', null) : c(m.maxDrawdownPct <= THRESHOLDS.maxDrawdownPct ? 'met' : 'notYet', m.maxDrawdownPct);
    case 'winRate':
      // Win rate alone says little (see "Kỳ vọng R"): shown for information, never "met".
      return c('noData', m.winRatePct);
    case 'discipline':
      return m.discipline === null ? c('noData', null) : c(m.discipline >= THRESHOLDS.minDiscipline ? 'met' : 'notYet', m.discipline);
  }
}

// --------------------------------------------------------------------------- final readiness

export type ReadinessId = 'trades' | 'stopPct' | 'expectancy' | 'drawdown' | 'exam' | 'discipline';

export interface ReadinessItem {
  id: ReadinessId;
  ok: boolean;
  value: number | null;
  target: number;
}

export interface Readiness {
  items: ReadinessItem[];
  /** All practice criteria met. This is NOT a promise of profit with real money. */
  passed: boolean;
  missing: ReadinessId[];
}

export function evaluateReadiness(m: ProgramMetrics, examPassed: boolean): Readiness {
  const items: ReadinessItem[] = [
    { id: 'trades', ok: m.trades >= THRESHOLDS.readinessTrades, value: m.trades, target: THRESHOLDS.readinessTrades },
    { id: 'stopPct', ok: m.stopPct !== null && m.stopPct >= THRESHOLDS.minStopPct, value: m.stopPct, target: THRESHOLDS.minStopPct },
    {
      id: 'expectancy',
      ok: m.expectancyCount >= THRESHOLDS.expectancyWindow && m.expectancyR !== null && m.expectancyR > 0,
      value: m.expectancyR,
      target: 0,
    },
    { id: 'drawdown', ok: m.maxDrawdownPct !== null && m.maxDrawdownPct <= THRESHOLDS.maxDrawdownPct, value: m.maxDrawdownPct, target: THRESHOLDS.maxDrawdownPct },
    { id: 'exam', ok: examPassed, value: examPassed ? 1 : 0, target: 1 },
    { id: 'discipline', ok: m.discipline !== null && m.discipline >= THRESHOLDS.minDiscipline, value: m.discipline, target: THRESHOLDS.minDiscipline },
  ];
  const missing = items.filter((i) => !i.ok).map((i) => i.id);
  return { items, passed: missing.length === 0, missing };
}
