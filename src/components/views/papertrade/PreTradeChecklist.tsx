import { useState } from 'react';
import { ChevronDown, ClipboardCheck } from 'lucide-react';
import { fmtFixed, useT, type TKey } from '../../../i18n';
import { CHECK_IDS, MIN_GOOD_R, type Answer, type Answers, type CheckId, type ChecklistScore, type EventState, type PaperPlan, type RiskResult } from './checklist';
import { fmtVnd, inputCls, labelCls } from './paperUi';

interface Props {
  answers: Answers;
  onAnswer: (id: CheckId, v: Answer) => void;
  events: EventState;
  eventsManual: Answer;
  onEventsManual: (v: Answer) => void;
  limitText: string;
  limitPct: number;
  onLimitText: (v: string) => void;
  score: ChecklistScore;
  risk: RiskResult | null;
}

function YesNo({ value, onChange, label }: { value: Answer; onChange: (v: Answer) => void; label: string }) {
  const t = useT();
  const btn = (v: 'yes' | 'no', tone: string) => (
    <button
      type="button"
      aria-pressed={value === v}
      aria-label={`${label}: ${t(v === 'yes' ? 'ck.yes' : 'ck.no')}`}
      onClick={() => onChange(value === v ? null : v)}
      className={`px-3 py-1.5 text-xs rounded-md border min-w-[3.25rem] ${value === v ? `${tone} text-[var(--text-strong)] font-semibold` : 'border-[var(--border)] text-[var(--muted)]'}`}
    >
      {t(v === 'yes' ? 'ck.yes' : 'ck.no')}
    </button>
  );
  return (
    <div className="flex gap-2 shrink-0">
      {btn('yes', 'border-[var(--positive)] bg-[var(--positive)]/15')}
      {btn('no', 'border-[var(--negative)] bg-[var(--negative)]/15')}
    </div>
  );
}

/** Collapsible pre-trade checklist + auto risk row. Never blocks the order (the parent only asks to confirm). */
export function PreTradeChecklist({ answers, onAnswer, events, eventsManual, onEventsManual, limitText, limitPct, onLimitText, score, risk }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const riskTone = !risk ? 'text-[var(--muted)]' : risk.level === 'overLimit' ? 'text-[var(--negative)]' : risk.level === 'lowR' ? 'text-[var(--warning)]' : 'text-[var(--text-strong)]';
  const rTone = risk && risk.r !== null && risk.r < MIN_GOOD_R ? 'text-[var(--warning)]' : 'text-[var(--text-strong)]';
  const pctTone = risk?.level === 'overLimit' ? 'text-[var(--negative)]' : 'text-[var(--text-strong)]';

  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--surface-2)]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
        <ClipboardCheck className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold text-[var(--text-strong)] flex-1">{t('ck.title')}</span>
        <span className={`text-xs font-mono ${score.notMet === 0 ? 'text-[var(--positive)]' : 'text-[var(--muted)]'}`}>{t('ck.summary', { passed: score.passed, total: score.total })}</span>
        <ChevronDown className={`w-4 h-4 text-[var(--muted)] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-[11px] text-[var(--muted)]">{t('ck.intro')}</p>
          <ul className="space-y-2">
            {CHECK_IDS.map((id) => (
              <li key={id} className="flex items-center justify-between gap-3">
                <span className="text-xs text-[var(--text-strong)]">{t(`ck.q.${id}` as TKey, { pct: limitPct })}</span>
                <YesNo value={answers[id]} onChange={(v) => onAnswer(id, v)} label={t(`ck.q.${id}` as TKey, { pct: limitPct })} />
              </li>
            ))}
            <li className="flex items-center justify-between gap-3">
              <div>
                <span className="text-xs text-[var(--text-strong)]">{t('ck.q.events')}</span>
                <p className={`text-[11px] ${events === 'event' ? 'text-[var(--warning)]' : 'text-[var(--muted)]'}`}>
                  {events === 'clear' ? t('ck.events.auto.clear') : events === 'event' ? t('ck.events.auto.event') : t('ck.events.manual')}
                </p>
              </div>
              {events === null ? (
                <YesNo value={eventsManual} onChange={onEventsManual} label={t('ck.q.events')} />
              ) : (
                <span className={`text-xs font-semibold ${events === 'clear' ? 'text-[var(--positive)]' : 'text-[var(--warning)]'}`}>{events === 'clear' ? '✓' : '!'}</span>
              )}
            </li>
          </ul>
          <div className="max-w-[12rem]">
            <label htmlFor="ck-limit" className={labelCls}>{t('ck.limit')}</label>
            <input id="ck-limit" inputMode="decimal" value={limitText} onChange={(e) => onLimitText(e.target.value)} className={`${inputCls} font-mono`} />
          </div>
        </div>
      )}

      {/* Auto risk row: always visible so the risk is seen even with the panel collapsed. */}
      <div className={`px-3 py-2 border-t border-[var(--border)] text-xs space-y-0.5 ${riskTone}`} aria-live="polite">
        {!risk ? (
          <p>{t('ck.risk.none')}</p>
        ) : (
          <>
            <p className="flex flex-wrap gap-x-4">
              <span className={`font-semibold ${pctTone}`}>{t('ck.risk.pct', { pct: fmtFixed(risk.riskPct, 2), vnd: fmtVnd(risk.riskVnd) })}</span>
              <span className={`font-semibold ${rTone}`}>{risk.r === null ? t('ck.risk.noTarget') : t('ck.risk.r', { r: fmtFixed(risk.r, 2) })}</span>
            </p>
            {risk.level === 'overLimit' && <p role="alert" className="text-[var(--negative)]">{t('ck.risk.over', { pct: limitPct })}</p>}
            {risk.level !== 'overLimit' && risk.r !== null && risk.r < MIN_GOOD_R && <p className="text-[var(--warning)]">{t('ck.risk.lowR')}</p>}
          </>
        )}
      </div>
    </div>
  );
}

/** Small "Theo kế hoạch ✓ / Chưa đủ ✗" badge for positions and history rows; renders nothing for old records. */
export function PlanBadge({ plan }: { plan?: PaperPlan }) {
  const t = useT();
  if (!plan) return null;
  const tone = plan.onPlan ? 'text-[var(--positive)] border-[var(--positive)]/50' : 'text-[var(--warning)] border-[var(--warning)]/50';
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full border text-[11px] ${tone}`}
      title={t('ck.badge.title', { r: plan.r === null ? '—' : fmtFixed(plan.r, 2), pct: plan.riskPct === null ? '—' : fmtFixed(plan.riskPct, 2) })}
    >
      {t(plan.onPlan ? 'ck.badge.ok' : 'ck.badge.no')}
    </span>
  );
}
