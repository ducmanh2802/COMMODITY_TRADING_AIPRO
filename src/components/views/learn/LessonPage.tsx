import type { ReactNode } from 'react';
import { Bookmark, Info, Lightbulb } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { useI18n } from '../../../i18n';
import type { InstrumentDefinition } from '../../../shared/types/instrument';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { estimateLessonReadMinutes, highlightTextSegments } from './academyUtils';
import { Exercise, RefusalBox, SourceLinks } from './Calculators';
import type { ExampleCalc, Lesson } from './curriculum/types';
import { LessonDiagram } from './diagrams/Diagrams';
import { LessonFigures } from './diagrams/Figures';
import { LessonVideos } from './LessonVideos';
import { figuresByParagraph } from './lesson/bodyParse';
import { KeyPoints } from './lesson/KeyPoints';
import { LessonBody } from './lesson/LessonBody';
import { LessonQuiz } from './lesson/LessonQuiz';
import { contractValue, marginCallDistance, marginLeverage, positionSize, rMultiple, rollCost, swingPlan, tickPnl } from './learnMath';
import type { LessonProgress } from './progress';

const fmt = (v: number, digits = 2) => v.toLocaleString('vi-VN', { maximumFractionDigits: digits });

/** Computes a worked example with learnMath from the verified instrument spec; refuses when unavailable. */
function ExampleBlock({ calc, caption, instruments }: { calc: ExampleCalc; caption: string; instruments: InstrumentDefinition[] }) {
  const spec = instruments.find((i) => i.id === calc.instrumentId)?.specification ?? null;
  let lines: string[] | null = null;
  let reason = '';
  const fail = (r: { ok: false; reason: string }) => {
    reason = r.reason;
  };
  if (calc.kind === 'tickPnl') {
    const r = tickPnl(spec, calc.priceMove, calc.contracts);
    if (r.ok) lines = [`Số tick = ${calc.priceMove} ÷ ${spec?.minimumTickSize} = ${fmt(r.ticks, 4)}`, `Lãi/lỗ = ${fmt(r.ticks, 4)} × ${spec?.tickValue} × ${calc.contracts} = ${fmt(r.pnl)} ${r.currency} (chưa trừ phí)`];
    else fail(r);
  } else if (calc.kind === 'leverage') {
    const r = marginLeverage(spec, calc.price, calc.marginUsd, 1, calc.movePct);
    if (r.ok)
      lines = [
        `Giá trị danh nghĩa = ${fmt(r.notional)} ${r.currency}`,
        `Đòn bẩy ≈ ${fmt(r.leverage, 1)}x (ký quỹ giả định ${fmt(calc.marginUsd)} USD)`,
        `Giá đi ngược ~${fmt(r.wipeoutMovePct)}% thì mất toàn bộ ký quỹ`,
        `Biến động ${calc.movePct}% → ${fmt(r.movePnl)} ${r.currency} = ${fmt(r.movePctOfMargin, 1)}% ký quỹ`,
      ];
    else fail(r);
  } else if (calc.kind === 'roll') {
    const r = rollCost(spec, calc.near, calc.far, calc.contracts);
    if (r.ok) lines = [`Chênh lệch = ${fmt(r.spreadPrice, 4)} (${fmt(r.spreadTicks, 2)} tick) → ${r.state}`, `Chi phí roll (vị thế mua) = ${fmt(r.cost)} ${r.currency}`];
    else fail(r);
  } else if (calc.kind === 'sizing') {
    const r = positionSize(spec, calc.equity, calc.riskPct, calc.stop, calc.costs);
    if (r.ok) lines = [`Ngân sách rủi ro = ${fmt(r.riskBudget)} ${r.currency}`, `Rủi ro/HĐ = ${fmt(r.stopTicks, 2)} tick × ${spec?.tickValue} = ${fmt(r.riskPerContract)} ${r.currency}`, `Số hợp đồng = ${r.contracts}`];
    else fail(r);
  } else if (calc.kind === 'marginCall') {
    const r = marginCallDistance(spec, calc.initial, calc.maintenance, calc.contracts);
    if (r.ok) lines = [`Đệm = ${fmt(r.bufferTotal)} ${r.currency}`, `≈ ${fmt(r.ticksToCall, 2)} tick ≈ ${fmt(r.priceMoveToCall, 4)} ${spec?.quotationUnit}`];
    else fail(r);
  } else {
    const plan = swingPlan(spec, calc.entry, calc.atr, calc.atrMult, calc.equity, calc.riskPct, calc.costs);
    const val = contractValue(spec, calc.entry);
    if (plan.ok) {
      lines = [
        `Khoảng cách stop = ${calc.atrMult} × ATR ${calc.atr} = ${fmt(plan.stopDistance, 4)} (${fmt(plan.stopTicks, 2)} tick) → stop tại ${fmt(plan.stopPrice, 4)}`,
        `Rủi ro mỗi hợp đồng = ${fmt(plan.riskPerContract)} ${plan.currency}; ngân sách = ${fmt(plan.riskBudget)} ${plan.currency}`,
        `Số hợp đồng = ${plan.contracts}; tiền rủi ro thực tế = ${fmt(plan.actualRisk)} ${plan.currency}`,
      ];
      if (val.ok) lines.push(`Giá trị danh nghĩa 1 hợp đồng tại ${calc.entry} = ${fmt(val.notional)} ${val.currency}`);
      const rm = rMultiple(spec, calc.entry, plan.stopPrice, calc.exit, Math.max(plan.contracts, 1));
      if (rm.ok) lines.push(`Thoát tại ${calc.exit}: ${fmt(rm.pnl)} ${rm.currency} = ${fmt(rm.r, 2)}R; chạm stop = -1R (chưa gồm phí/trượt giá)`);
      if (plan.contracts === 0) lines.push('Một hợp đồng đã vượt ngân sách rủi ro: không vào lệnh.');
    } else fail(plan);
  }
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 space-y-1.5">
      <p className="text-xs font-medium text-[var(--text-strong)]">Ví dụ số: {caption}</p>
      {lines ? (
        <ul className="text-xs font-mono text-[var(--muted)] space-y-1">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : instruments.length ? (
        <RefusalBox r={{ ok: false, reason }} />
      ) : (
        <p className="text-xs text-[var(--warning)]">Đang tải hoặc không tải được đặc tả hợp đồng từ /api/instruments, nên chưa tính được ví dụ.</p>
      )}
    </div>
  );
}

function SpecTable({ ids, instruments }: { ids: string[]; instruments: InstrumentDefinition[] }) {
  const rows = ids.map((id) => instruments.find((i) => i.id === id)).filter((i): i is InstrumentDefinition => !!i);
  if (!rows.length) return <p className="text-xs text-[var(--muted)]">Chưa có đặc tả từ Instrument Master (đang tải hoặc không có).</p>;
  return (
    <div className="overflow-x-auto" tabIndex={0}>
      <table className="w-full text-xs">
        <thead className="text-[var(--muted)]">
          <tr>
            {['Mã', 'Tên', 'Khối lượng', 'Tick', 'Giá trị tick', 'Trạng thái'].map((h) => (
              <th key={h} className="text-left p-1.5 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const s = i.specification;
            const ok = s.verificationStatus === 'VERIFIED';
            return (
              <tr key={i.id} className="border-t border-[var(--border)] font-mono">
                <td className="p-1.5 whitespace-nowrap">{i.id}</td>
                <td className="p-1.5 font-sans">{i.productName}</td>
                <td className="p-1.5 whitespace-nowrap">{s.contractSize !== null ? `${fmt(s.contractSize, 4)} ${s.contractSizeUnit}` : '?'}</td>
                <td className="p-1.5 whitespace-nowrap">{s.minimumTickSize ?? '?'} {s.quotationUnit}</td>
                <td className="p-1.5 whitespace-nowrap">{s.tickValue ?? '?'} {s.tradingCurrency}</td>
                <td className="p-1.5">
                  <Badge tone={ok ? 'positive' : 'warning'}>{s.verificationStatus}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-[var(--muted)] mt-1">Nguồn: Instrument Master của ứng dụng (đối chiếu tài liệu sàn). Mã UNVERIFIED không dùng để tính.</p>
    </div>
  );
}

function HighlightedSpan({ text, query }: { text: string; query?: string }) {
  if (!query || !query.trim()) return <>{text}</>;
  const segments = highlightTextSegments(text, query);
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark
            key={i}
            data-testid="note-highlight"
            className="rounded-sm bg-[var(--warning)]/30 text-[var(--text-strong)] px-0.5 font-medium"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

export function LessonPage({
  lesson,
  levelNumber,
  progress,
  note = '',
  highlightQuery = '',
  bookmarked = false,
  onToggleBookmark,
  onChangeNote,
  onScore,
  onToggleDone,
  checklist,
  onToggleCheck,
  onBack,
  onPrev,
  onNext,
  footer,
}: {
  lesson: Lesson;
  levelNumber?: number;
  progress?: LessonProgress;
  note?: string;
  highlightQuery?: string;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
  onChangeNote?: (text: string) => void;
  onScore: (pct: number) => void;
  onToggleDone: () => void;
  checklist: Record<string, boolean>;
  onToggleCheck: (key: string) => void;
  onBack: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** Optional block rendered after the lesson actions (e.g. end-of-level exam card). */
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  const { instruments, loading, setActiveModule } = useTerminal();
  const readMinutes = estimateLessonReadMinutes(lesson);
  const restFigures = figuresByParagraph(lesson.figureAt, lesson.figures, lesson.body.length).rest;
  const noteHasMatch =
    !!highlightQuery.trim() &&
    !!note.trim() &&
    highlightTextSegments(note, highlightQuery).some((seg) => seg.match);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="text-xs text-[var(--accent-text)] hover:underline min-h-9 inline-flex items-center">
          ← Về danh sách bài
        </button>
        <div className="flex items-center gap-3">
          <div className="text-xs text-[var(--muted)] tabular-nums">
            {levelNumber !== undefined && <span>{t('ac.lesson.levelTag', { n: levelNumber })} · </span>}
            <span>{t('ac.lesson.readMin', { m: readMinutes })}</span>
          </div>
          {onToggleBookmark && (
            <button
              type="button"
              aria-pressed={bookmarked}
              data-testid="lesson-page-bookmark"
              onClick={onToggleBookmark}
              className={`min-h-8 px-2.5 py-1 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                bookmarked
                  ? 'border-[var(--warning)]/60 bg-[var(--warning)]/15 text-[var(--text-strong)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text-strong)] hover:border-[var(--accent)]'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" fill={bookmarked ? 'currentColor' : 'none'} aria-hidden="true" />
              {bookmarked ? t('ac.lesson.bookmarked') : t('ac.lesson.bookmark')}
            </button>
          )}
        </div>
      </div>
      <h2 className="text-xl font-semibold text-[var(--text-strong)]">
        <HighlightedSpan text={lesson.title} query={highlightQuery} />
      </h2>
      <Card tone="accent">
        <p className="text-xs font-semibold text-[var(--accent-text)] mb-1">Mục tiêu</p>
        <p className="text-sm">
          <HighlightedSpan text={lesson.objective} query={highlightQuery} />
        </p>
      </Card>
      <KeyPoints items={lesson.remember} render={(r) => <HighlightedSpan text={r} query={highlightQuery} />} />
      <LessonBody lessonId={lesson.id} body={lesson.body} figures={lesson.figures} figureAt={lesson.figureAt} query={highlightQuery} />
      {lesson.diagram && <LessonDiagram id={lesson.diagram} />}
      {restFigures.length > 0 && <LessonFigures ids={restFigures} />}
      {lesson.videos && lesson.videos.length > 0 && <LessonVideos videos={lesson.videos} />}
      {lesson.example && <ExampleBlock calc={lesson.example.calc} caption={lesson.example.caption} instruments={instruments} />}
      {lesson.textExample && (
        <div className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-text)] mb-1">
            <Lightbulb aria-hidden="true" className="w-3.5 h-3.5" />
            Ví dụ
          </p>
          <p className="text-sm leading-relaxed">
            <HighlightedSpan text={lesson.textExample} query={highlightQuery} />
          </p>
        </div>
      )}
      {lesson.examples?.map((ex) => (
        <div key={ex.title} className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3">
          <p className="text-xs font-semibold text-[var(--accent-text)] mb-1">Ví dụ tình huống: {ex.title}</p>
          <p className="text-sm leading-relaxed">{ex.text}</p>
        </div>
      ))}
      {lesson.instrumentIds && (
        <Card>
          <p className="text-xs font-semibold mb-2">Đặc tả hợp đồng (Instrument Master)</p>
          <SpecTable ids={lesson.instrumentIds} instruments={instruments} />
        </Card>
      )}
      {lesson.checklist && (
        <Card>
          <p className="text-xs font-semibold mb-2">Danh sách kiểm tra 7 bước (lưu trên trình duyệt)</p>
          <ul className="space-y-2">
            {lesson.checklist.map((c) => (
              <li key={c.text} className="flex items-start gap-2 text-xs">
                <input type="checkbox" className="mt-0.5" checked={!!checklist[c.text]} onChange={() => onToggleCheck(c.text)} aria-label={c.text} />
                <span className="flex-1">{c.text}</span>
                {c.module && (
                  <button type="button" onClick={() => setActiveModule(c.module!)} className="shrink-0 text-[11px] px-2 py-0.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]">
                    Mở {c.moduleLabel} →
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {lesson.uncertain && (
        <Card tone="warning">
          <p className="text-xs font-semibold mb-1">Cần kiểm tra lại với MXV/công ty môi giới</p>
          <ul className="list-disc pl-4 text-xs space-y-1">
            {lesson.uncertain.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          <p className="text-[11px] mt-1">
            Xem <a className="underline" href="https://mxv.com.vn" target="_blank" rel="noreferrer">mxv.com.vn</a>.
          </p>
        </Card>
      )}
      {lesson.calculator && (
        <Card>
          <p className="text-xs font-semibold mb-2">Máy tính / bài tập tương tác</p>
          <Exercise id={lesson.calculator} instruments={instruments} loading={loading} />
        </Card>
      )}
      {lesson.links && (
        <div className="flex flex-wrap gap-2">
          {lesson.links.map((l) => (
            <button key={l.module + l.label} type="button" onClick={() => setActiveModule(l.module)} className="text-xs px-2.5 py-1 rounded-md border border-[var(--border)] hover:border-[var(--accent)]">
              Mở {l.label} →
            </button>
          ))}
        </div>
      )}
      <Card>
        <p className="text-sm font-semibold mb-3">Câu hỏi trắc nghiệm</p>
        <LessonQuiz lessonId={lesson.id} questions={lesson.quiz} best={progress?.best} onScore={onScore} />
      </Card>
      {onChangeNote && (
        <Card className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`note-${lesson.id}`} className="text-sm font-semibold text-[var(--text-strong)]">
              {t('ac.note.title')}
            </label>
            <span className="text-[11px] text-[var(--muted)] tabular-nums">
              {note.trim().length > 0 ? `${t('ac.note.saved')} · ${t('ac.note.chars', { n: note.length })}` : ''}
            </span>
          </div>
          {noteHasMatch && (
            <div
              data-testid="lesson-note-highlight-preview"
              className="rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-xs leading-relaxed text-[var(--text)]"
            >
              <span className="font-semibold text-[var(--text-strong)] mr-1.5">{t('ac.search.noteMatch')}</span>
              <HighlightedSpan text={note} query={highlightQuery} />
            </div>
          )}
          <textarea
            id={`note-${lesson.id}`}
            data-testid="lesson-personal-note"
            rows={3}
            value={note}
            onChange={(e) => onChangeNote(e.target.value)}
            placeholder={t('ac.note.placeholder')}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          />
        </Card>
      )}
      <SourceLinks sources={lesson.sources} />
      <div className="flex flex-wrap gap-2 items-center">
        {onPrev && (
          <button type="button" onClick={onPrev} className="text-xs min-h-9 px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]">
            {t('ac.lesson.prev')}
          </button>
        )}
        <button type="button" onClick={onToggleDone} className="text-xs min-h-9 px-3 py-1.5 rounded-md border border-[var(--accent)]/50 bg-[var(--accent-soft)]">
          {progress?.done ? 'Bỏ đánh dấu đã học' : 'Đánh dấu đã học'}
        </button>
        {onNext && (
          <button type="button" onClick={onNext} className="text-xs min-h-9 px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent)]">
            Bài tiếp theo →
          </button>
        )}
      </div>
      {footer}
      <p className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] border-t border-[var(--border)] pt-2">
        <Info aria-hidden="true" className="w-3 h-3 shrink-0" />
        Tài liệu giáo dục, không phải tư vấn đầu tư.
      </p>
    </div>
  );
}
