import { useState } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useI18n, type TKey, type TFunction } from '../../../i18n';
import {
  PROGRAM_WEEKS,
  THRESHOLDS,
  checkpoint,
  evaluateReadiness,
  isValidDate,
  phaseOfWeek,
  todayDate,
  weekSpec,
  type MetricId,
  type TaskLink,
  type TaskSpec,
  type TaskStatus,
  type WeekProgress,
} from '../../../shared/program/threeMonth';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { CURRICULUM } from '../learn/curriculum';
import type { ExamTarget } from '../learn/exam/ExamView';
import { useProgram, type ProgramModel } from './useProgram';

interface Props {
  onOpenLesson: (lessonId: string) => void;
  onOpenExam: (target: ExamTarget) => void;
}

const btnCls = 'text-xs px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text)]';
const MANUAL_KEYS = ['backtest', 'walkForward', 'contest', 'weeklyReview'] as const;

export function taskLabel(t: TFunction, spec: TaskSpec, status: TaskStatus): string {
  const p = { have: status.have, need: status.need };
  switch (spec.kind) {
    case 'lessons':
      return t('prog.task.lessons', p);
    case 'quiz':
      return t('prog.task.quiz', p);
    case 'trades':
      return t('prog.task.trades', p);
    case 'stopTrades':
      return t('prog.task.stopTrades', p);
    case 'journal':
      return t('prog.task.journal', p);
    case 'review':
      return t('prog.task.review');
    case 'exam':
      return t('prog.task.exam', { name: spec.examId === 'final' ? t('prog.task.exam.final') : t('prog.task.exam.level', { id: spec.examId.replace(/^l/, '') }) });
    case 'manual': {
      const key = spec.id.split('.')[1];
      return (MANUAL_KEYS as readonly string[]).includes(key) ? t(`prog.task.manual.${key as (typeof MANUAL_KEYS)[number]}`) : key;
    }
  }
}

function Bar({ pct, label }: { pct: number; label: string }) {
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label} className="h-2 rounded-full overflow-hidden bg-[var(--surface-2)]">
      <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function fmtMetric(t: TFunction, id: MetricId, v: number | null): string {
  if (v === null) return t('prog.metric.noValue');
  if (id === 'stopPct' || id === 'avgRisk' || id === 'drawdown' || id === 'winRate') return t('prog.metric.value.pct', { v });
  if (id === 'expectancy') return t('prog.metric.value.r', { v });
  if (id === 'discipline') return t('prog.metric.value.pts', { v });
  return String(v);
}

function targetText(t: TFunction, id: MetricId): string | null {
  if (id === 'stopPct') return t('prog.metric.target.min', { v: `${THRESHOLDS.minStopPct}%` });
  if (id === 'avgRisk') return t('prog.metric.target.max', { v: `${THRESHOLDS.maxAvgRiskPct}%` });
  if (id === 'drawdown') return t('prog.metric.target.max', { v: `${THRESHOLDS.maxDrawdownPct}%` });
  if (id === 'discipline') return t('prog.metric.target.min', { v: THRESHOLDS.minDiscipline });
  if (id === 'expectancy') return t('prog.metric.target.pos');
  return null;
}

function MetricRow({ id, model, week }: { id: MetricId; model: ProgramModel; week: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const cp = checkpoint(id, model.metrics, week);
  const tone = cp.state === 'met' ? 'positive' : cp.state === 'notYet' ? 'warning' : 'neutral';
  const stateKey = id === 'winRate' ? 'prog.state.info' : (`prog.state.${cp.state}` as TKey);
  const value = id === 'lessons' ? `${model.metrics.lessonsDone}/${model.metrics.lessonsTotal}` : id === 'trades' ? String(model.metrics.trades) : fmtMetric(t, id, cp.value);
  const target = targetText(t, id);
  const helpId = `prog-help-${id}`;
  return (
    <li className="rounded-md border border-[var(--border)] p-2.5" data-testid={`metric-${id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-[var(--text-strong)]">{t(`prog.m.${id}` as TKey)}</span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-[var(--text-strong)]">{value}</span>
          <Badge tone={tone}>{t(stateKey)}</Badge>
        </span>
      </div>
      {target && <p className="text-[11px] text-[var(--muted)] mt-0.5">{target}</p>}
      <button type="button" aria-expanded={open} aria-controls={helpId} onClick={() => setOpen((o) => !o)} className="text-[11px] text-[var(--accent-text)] hover:underline mt-1">
        {open ? '− ' : '+ '}
        {id === 'expectancy' ? t('prog.m.expectancy') + '?' : t('prog.explain')}
      </button>
      {open && (
        <p id={helpId} className="text-xs text-[var(--muted)] mt-1">
          {t(`prog.m.${id}.help` as TKey)}
        </p>
      )}
    </li>
  );
}

function Readiness({ model }: { model: ProgramModel }) {
  const { t } = useI18n();
  const r = evaluateReadiness(model.metrics, model.examPassed);
  const provisional = !model.info?.pastEnd;
  return (
    <div className="space-y-2" data-testid="program-readiness">
      <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('prog.ready.title')}</h3>
      <p className="text-xs text-[var(--muted)]">{t('prog.ready.sub')}</p>
      <Card tone={r.passed ? 'accent' : 'warning'} className="!p-3">
        <p className="text-sm font-semibold text-[var(--text-strong)]">{r.passed ? t('prog.ready.passed') : t('prog.ready.missing', { n: r.missing.length })}</p>
        {provisional && <p className="text-[11px] text-[var(--muted)]">{t('prog.ready.provisional')}</p>}
        <ul className="mt-2 space-y-1.5">
          {r.items.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-2 text-xs" data-ready={i.ok ? 'ok' : 'missing'}>
              <span className="text-[var(--text)]">{t(`prog.ready.${i.id}` as TKey)}</span>
              <Badge tone={i.ok ? 'positive' : 'warning'}>{i.ok ? t('prog.state.met') : t('prog.state.notYet')}</Badge>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-[var(--muted)] mt-2">{t('prog.ready.note')}</p>
      </Card>
      <Card tone="warning" className="!p-3">
        <p className="text-xs font-semibold text-[var(--text-strong)]">{t('prog.disclaimer')}</p>
      </Card>
    </div>
  );
}

function WeekDetail({ model, wp, onOpenLesson, onOpenExam }: { model: ProgramModel; wp: WeekProgress } & Props) {
  const { t } = useI18n();
  const { setActiveModule } = useTerminal();
  const spec = weekSpec(wp.week);
  const titles = LESSON_TITLES;
  const nextLesson = spec.lessonIds.find((id) => !model.data.lessons[id]?.done) ?? spec.lessonIds[0];

  const go = (link: TaskLink, task: TaskSpec) => {
    if (link === 'lesson') onOpenLesson(nextLesson);
    else if (link === 'paper' || link === 'journal' || link === 'contest') setActiveModule('paper-trade');
    else if (link === 'lab') setActiveModule('backtest');
    else if (link === 'review') window.scrollTo?.({ top: 0 });
    else if (link === 'exam' && task.kind === 'exam') onOpenExam(task.examId === 'final' ? { kind: 'final' } : { kind: 'level', levelId: task.examId });
  };
  const goLabel = (link: TaskLink): string | null =>
    link === 'lesson' ? t('prog.go.lesson') : link === 'paper' || link === 'journal' ? t('prog.go.paper') : link === 'lab' ? t('prog.go.lab') : link === 'contest' ? t('prog.go.contest') : link === 'review' ? t('prog.go.review') : link === 'exam' ? t('prog.go.exam') : null;

  return (
    <div className="space-y-4" data-testid="program-week">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{t(`prog.phase.${phaseOfWeek(wp.week)}` as TKey)}</p>
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">
          {t('prog.week', { week: wp.week })}: {t(`prog.w.${wp.week}` as TKey)}
        </h3>
        <div className="mt-2">
          <Bar pct={wp.pct} label={t('prog.weekPct', { week: wp.week, pct: wp.pct })} />
        </div>
      </div>

      <section aria-label={t('prog.lessons')}>
        <h4 className="text-xs font-semibold text-[var(--text-strong)] mb-1.5">{t('prog.lessons')}</h4>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {spec.lessonIds.map((id) => (
            <li key={id}>
              <button type="button" onClick={() => onOpenLesson(id)} className="w-full text-left rounded-md border border-[var(--border)] hover:border-[var(--accent)] px-2.5 py-1.5 flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--text)]">{titles.get(id) ?? id}</span>
                {model.data.lessons[id]?.done && <Badge tone="positive">{t('prog.lessonDone')}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={t('prog.tasks')}>
        <h4 className="text-xs font-semibold text-[var(--text-strong)] mb-1.5">{t('prog.tasks')}</h4>
        <ul className="space-y-1.5" data-testid="program-week-tasks">
          {wp.tasks.map(({ spec: task, status }) => {
            const label = goLabel(task.link);
            return (
              <li key={task.id} data-testid={`task-${task.id}`} data-done={status.done ? 'true' : 'false'} className="rounded-md border border-[var(--border)] p-2.5">
                <div className="flex items-start gap-2">
                  {task.kind === 'manual' ? (
                    <input type="checkbox" checked={status.manual} onChange={() => model.toggleManual(task.id)} aria-label={`${taskLabel(t, task, status)}: ${t('prog.tick')}`} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                  ) : (
                    <input type="checkbox" checked={status.done} readOnly disabled aria-label={taskLabel(t, task, status)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${status.done ? 'text-[var(--muted)]' : 'text-[var(--text)]'}`}>{taskLabel(t, task, status)}</p>
                    <p className="text-[11px] text-[var(--muted)]">
                      {task.kind === 'manual' ? t('prog.manualHint') : status.auto ? t('prog.auto') : ''}
                      {status.manual && <Badge className="ml-1.5">{t('prog.manualTag')}</Badge>}
                    </p>
                  </div>
                  {label && (
                    <button type="button" onClick={() => go(task.link, task)} className={`${btnCls} shrink-0`}>
                      {label}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label={t('prog.metrics')}>
        <h4 className="text-xs font-semibold text-[var(--text-strong)]">{t('prog.metrics')}</h4>
        <p className="text-[11px] text-[var(--muted)] mb-1.5">{t('prog.metrics.hint')}</p>
        <ul className="space-y-1.5">
          {spec.metrics.map((id) => (
            <MetricRow key={id} id={id} model={model} week={wp.week} />
          ))}
        </ul>
      </section>
    </div>
  );
}

const LESSON_TITLES = new Map(CURRICULUM.flatMap((l) => l.lessons.map((x) => [x.id, x.title] as const)));

function StartForm({ model }: { model: ProgramModel }) {
  const { t } = useI18n();
  const [date, setDate] = useState(todayDate());
  const ok = isValidDate(date);
  return (
    <Card tone="accent" data-testid="program-card">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('prog.title')}</h2>
      <p className="text-xs text-[var(--muted)] mt-0.5 max-w-2xl">{t('prog.intro')}</p>
      <div className="flex flex-wrap items-end gap-3 mt-3">
        <label className="text-xs text-[var(--muted)] flex flex-col gap-1">
          {t('prog.start.date')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1.5 text-sm text-[var(--text)]" />
        </label>
        <button type="button" data-testid="program-start" disabled={!ok} onClick={() => model.start(date)} className={`${btnCls} disabled:opacity-50`}>
          {t('prog.start.btn')}
        </button>
      </div>
      <p className="text-[11px] text-[var(--muted)] mt-2">{t('prog.start.note')}</p>
    </Card>
  );
}

/** "Lộ trình 3 tháng" card for the Academy: summary always visible, details collapsible. */
export function ProgramCard({ onOpenLesson, onOpenExam }: Props) {
  const { t } = useI18n();
  const model = useProgram();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [editDate, setEditDate] = useState<string | null>(null);

  if (!model.started || !model.info) return <StartForm model={model} />;
  const info = model.info;
  const week = picked ?? info.week;
  const wp = model.weeks[week - 1];
  const pct = model.totalTasks ? Math.round((model.doneTasks / model.totalTasks) * 100) : 0;

  return (
    <Card tone="accent" data-testid="program-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('prog.title')}</h2>
          <p className="text-xs text-[var(--text)] mt-0.5" data-testid="program-current-week">
            {t('prog.current', { week: info.week })}: {t(`prog.w.${info.week}` as TKey)}
          </p>
          <p className="text-[11px] text-[var(--muted)]">{t(`prog.phase.${phaseOfWeek(info.week)}` as TKey)}</p>
        </div>
        <button type="button" aria-expanded={open} aria-controls="program-details" onClick={() => setOpen((o) => !o)} className={btnCls}>
          {open ? t('prog.close') : t('prog.open')}
        </button>
      </div>
      <div className="mt-3 space-y-1">
        <Bar pct={pct} label={t('prog.overall', { done: model.doneTasks, total: model.totalTasks, pct })} />
        <p className="text-[11px] text-[var(--muted)]">{t('prog.overall', { done: model.doneTasks, total: model.totalTasks, pct })}</p>
      </div>

      {open && (
        <div id="program-details" className="mt-4 space-y-4">
          <p className="text-xs text-[var(--muted)]">{t(`prog.phase.${phaseOfWeek(week)}.desc` as TKey)}</p>
          {info.pastEnd && <p className="text-xs text-[var(--text)]">{t('prog.pastEnd')}</p>}
          {info.notYet && <p className="text-xs text-[var(--muted)]">{t('prog.start.future')}</p>}
          <p className="text-[11px] text-[var(--muted)]">{t('prog.catchup')}</p>

          <nav aria-label={t('prog.weeks')} className="flex gap-1.5 overflow-x-auto pb-1">
            {Array.from({ length: PROGRAM_WEEKS }, (_, i) => i + 1).map((w) => {
              const p = model.weeks[w - 1];
              const active = w === week;
              return (
                <button
                  key={w}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  aria-label={`${t('prog.week', { week: w })}, ${t('prog.weekPct', { week: w, pct: p.pct })}`}
                  onClick={() => setPicked(w)}
                  className={`shrink-0 min-w-[2.75rem] rounded-md border px-2 py-1 text-xs ${active ? 'border-[var(--accent)] text-[var(--accent-text)]' : 'border-[var(--border)] text-[var(--muted)]'} hover:border-[var(--accent)]`}
                >
                  <span className="block font-medium">{t('prog.weekShort', { week: w })}</span>
                  <span className="block h-1 mt-1 rounded-full bg-[var(--surface-2)] overflow-hidden" aria-hidden="true">
                    <span className="block h-full bg-[var(--accent)]" style={{ width: `${p.pct}%` }} />
                  </span>
                </button>
              );
            })}
          </nav>
          {model.loading && <p className="text-[11px] text-[var(--muted)]">{t('prog.loading')}</p>}

          <WeekDetail model={model} wp={wp} onOpenLesson={onOpenLesson} onOpenExam={onOpenExam} />
          <Readiness model={model} />

          <div className="flex flex-wrap items-end gap-3 border-t border-[var(--border)] pt-3">
            {editDate === null ? (
              <button type="button" className={btnCls} onClick={() => setEditDate(model.state.startDate ?? todayDate())}>
                {t('prog.change')}
              </button>
            ) : (
              <>
                <input type="date" aria-label={t('prog.start.date')} value={editDate} onChange={(e) => setEditDate(e.target.value)} className="bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1.5 text-sm text-[var(--text)]" />
                <button
                  type="button"
                  disabled={!isValidDate(editDate)}
                  className={`${btnCls} disabled:opacity-50`}
                  onClick={() => {
                    model.start(editDate);
                    setEditDate(null);
                    setPicked(null);
                  }}
                >
                  {t('prog.save')}
                </button>
              </>
            )}
            <button
              type="button"
              className={btnCls}
              onClick={() => {
                if (window.confirm(t('prog.reset.confirm'))) {
                  model.reset();
                  setOpen(false);
                  setPicked(null);
                }
              }}
            >
              {t('prog.reset')}
            </button>
          </div>
        </div>
      )}
      {!open && <p className="text-[11px] text-[var(--muted)] mt-2">{t('prog.disclaimer')}</p>}
    </Card>
  );
}
