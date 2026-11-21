import { useState } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { InstrumentDefinition } from '../../../shared/types/instrument';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { Exercise, RefusalBox, SourceLinks } from './Calculators';
import type { ExampleCalc, Lesson, QuizQuestion } from './curriculum/types';
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
    <div className="overflow-x-auto">
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

function Quiz({ questions, best, onScore }: { questions: QuizQuestion[]; best?: number; onScore: (pct: number) => void }) {
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const correct = picked.filter((p, i) => p === questions[i].answer).length;
  const allAnswered = picked.every((p) => p !== null);
  const pct = Math.round((correct / questions.length) * 100);
  return (
    <div className="space-y-4">
      {questions.map((qu, qi) => (
        <fieldset key={qu.q} className="space-y-1.5">
          <legend className="text-sm text-[var(--text-strong)] font-medium">
            {qi + 1}. {qu.q}
          </legend>
          {qu.options.map((o, oi) => {
            const isPick = picked[qi] === oi;
            const show = submitted && (oi === qu.answer || isPick);
            const tone = show ? (oi === qu.answer ? 'border-[var(--positive)]' : 'border-[var(--negative)]') : isPick ? 'border-[var(--accent)]' : 'border-[var(--border)]';
            return (
              <label key={o} className={`flex items-start gap-2 text-xs rounded-md border px-2.5 py-1.5 cursor-pointer ${tone}`}>
                <input
                  type="radio"
                  name={`${qu.q}`}
                  className="mt-0.5"
                  checked={isPick}
                  disabled={submitted}
                  onChange={() => setPicked((p) => p.map((v, i) => (i === qi ? oi : v)))}
                />
                <span>{o}</span>
              </label>
            );
          })}
          {submitted && <p className="text-xs text-[var(--muted)]">Giải thích: {qu.why}</p>}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {!submitted ? (
          <button
            type="button"
            disabled={!allAnswered}
            onClick={() => {
              setSubmitted(true);
              onScore(pct);
            }}
            className="text-xs px-3 py-1.5 rounded-md bg-[var(--accent)] text-white disabled:opacity-40"
          >
            Nộp bài
          </button>
        ) : (
          <>
            <Badge tone={pct >= 60 ? 'positive' : 'warning'}>
              Điểm: {correct}/{questions.length} ({pct}%)
            </Badge>
            <button
              type="button"
              onClick={() => {
                setPicked(questions.map(() => null));
                setSubmitted(false);
              }}
              className="text-xs px-3 py-1.5 rounded-md border border-[var(--border)]"
            >
              Làm lại
            </button>
          </>
        )}
        {best !== undefined && <span className="text-[11px] text-[var(--muted)]">Điểm cao nhất: {best}%</span>}
      </div>
    </div>
  );
}

export function LessonPage({
  lesson,
  progress,
  onScore,
  onToggleDone,
  checklist,
  onToggleCheck,
  onBack,
  onNext,
}: {
  lesson: Lesson;
  progress?: LessonProgress;
  onScore: (pct: number) => void;
  onToggleDone: () => void;
  checklist: Record<string, boolean>;
  onToggleCheck: (key: string) => void;
  onBack: () => void;
  onNext?: () => void;
}) {
  const { instruments, loading, setActiveModule } = useTerminal();
  return (
    <div className="space-y-4 max-w-3xl">
      <button type="button" onClick={onBack} className="text-xs text-[var(--accent-text)] hover:underline">
        ← Về danh sách bài
      </button>
      <h1 className="text-xl font-semibold text-[var(--text-strong)]">{lesson.title}</h1>
      <Card tone="accent">
        <p className="text-xs font-semibold text-[var(--accent-text)] mb-1">Mục tiêu</p>
        <p className="text-sm">{lesson.objective}</p>
      </Card>
      <div className="space-y-3 text-sm leading-relaxed">
        {lesson.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      {lesson.example && <ExampleBlock calc={lesson.example.calc} caption={lesson.example.caption} instruments={instruments} />}
      {lesson.textExample && <p className="text-xs rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">Ví dụ: {lesson.textExample}</p>}
      {lesson.examples?.map((ex) => (
        <div key={ex.title} className="rounded-md border border-[var(--border)] border-l-4 border-l-[var(--accent)] bg-[var(--surface-2)] p-3">
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
      <Card tone="warning">
        <p className="text-xs font-semibold mb-1">Ghi nhớ</p>
        <ul className="list-disc pl-4 text-xs space-y-1">
          {lesson.remember.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Card>
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
        <Quiz questions={lesson.quiz} best={progress?.best} onScore={onScore} />
      </Card>
      <SourceLinks sources={lesson.sources} />
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={onToggleDone} className="text-xs px-3 py-1.5 rounded-md border border-[var(--accent)]/50 bg-[var(--accent-soft)]">
          {progress?.done ? 'Bỏ đánh dấu đã học' : 'Đánh dấu đã học'}
        </button>
        {onNext && (
          <button type="button" onClick={onNext} className="text-xs px-3 py-1.5 rounded-md border border-[var(--border)]">
            Bài tiếp theo →
          </button>
        )}
      </div>
      <p className="text-[11px] text-[var(--muted)]">Tài liệu giáo dục, không phải tư vấn đầu tư.</p>
    </div>
  );
}
