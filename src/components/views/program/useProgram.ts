import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_CAPITAL_VND } from '../papertrade/paperMath';
import { usePaperStore } from '../papertrade/usePaperStore';
import { CURRICULUM } from '../learn/curriculum';
import { loadExams } from '../learn/exam/examLogic';
import { loadProgress } from '../learn/progress';
import { dueItems, loadReview } from '../learn/review';
import {
  PROGRAM_WEEKS,
  computeMetrics,
  loadProgram,
  saveProgram,
  startMs,
  tradesSince,
  weekInfo,
  weekProgress,
  type ProgramData,
  type ProgramMetrics,
  type ProgramState,
  type ProgramTrade,
  type WeekInfo,
  type WeekProgress,
} from '../../../shared/program/threeMonth';

const LESSONS_TOTAL = CURRICULUM.reduce((n, l) => n + l.lessons.length, 0);

export interface ProgramModel {
  state: ProgramState;
  started: boolean;
  /** Paper trades still loading (signed-in users). */
  loading: boolean;
  info: WeekInfo | null;
  data: ProgramData;
  metrics: ProgramMetrics;
  weeks: WeekProgress[];
  doneTasks: number;
  totalTasks: number;
  examPassed: boolean;
  start: (date: string) => void;
  toggleManual: (taskId: string) => void;
  reset: () => void;
}

/** Combines the programme state with real local data (lessons, exams, review queue, paper trades). */
export function useProgram(): ProgramModel {
  const [state, setState] = useState<ProgramState>(loadProgram);
  const store = usePaperStore();
  // Lesson / exam / review data live in localStorage and are read when the card mounts (they change on other pages).
  const [local] = useState(() => ({ lessons: loadProgress().lessons, exams: loadExams(), reviewDue: dueItems(loadReview(), Date.now()).length }));

  const update = useCallback((fn: (s: ProgramState) => ProgramState) => {
    setState((s) => {
      const next = fn(s);
      saveProgram(next);
      return next;
    });
  }, []);

  const data = useMemo<ProgramData>(() => {
    const trades: ProgramTrade[] = store.state.trades.map((t) => ({
      openedAtMs: t.openedAtMs,
      closedAtMs: t.closedAtMs,
      hasStop: t.stopLoss !== null,
      riskPct: t.plan?.riskPct ?? null,
      pnlVnd: t.pnlVnd,
      rMultiple: t.rMultiple,
      hasJournal: t.journal.trim().length > 0,
      checklistDone: t.plan ? t.plan.onPlan : null,
    }));
    const sessions = store.state.sessions;
    const session = sessions.find((s) => s.status === 'active') ?? sessions[0];
    return {
      lessons: local.lessons,
      examsPassed: Object.fromEntries(Object.entries(local.exams).map(([k, v]) => [k, v.passed])),
      trades,
      startingCapitalVnd: session?.startingCapitalVnd ?? DEFAULT_CAPITAL_VND,
      reviewDue: local.reviewDue,
    };
  }, [store.state, local]);

  const startDate = state.startDate;
  const computed = useMemo(() => {
    const since = startDate ? tradesSince(data.trades, startMs(startDate)) : [];
    const metrics = computeMetrics(data, LESSONS_TOTAL, since);
    const weeks = Array.from({ length: PROGRAM_WEEKS }, (_, i) => weekProgress(i + 1, data, metrics, state));
    return { metrics, weeks };
  }, [data, startDate, state]);

  return {
    state,
    started: startDate !== null,
    loading: !store.ready,
    info: startDate ? weekInfo(startDate) : null,
    data,
    metrics: computed.metrics,
    weeks: computed.weeks,
    doneTasks: computed.weeks.reduce((n, w) => n + w.doneCount, 0),
    totalTasks: computed.weeks.reduce((n, w) => n + w.total, 0),
    examPassed: data.examsPassed.final === true,
    start: (date) => update((s) => ({ ...s, startDate: date })),
    toggleManual: (id) => update((s) => ({ ...s, manual: { ...s.manual, [id]: !s.manual[id] } })),
    reset: () => update(() => ({ startDate: null, manual: {} })),
  };
}
