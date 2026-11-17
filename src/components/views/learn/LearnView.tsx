import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { InstrumentDefinition } from '../../../shared/types/instrument';
import { LEVELS, MONEY_WAYS, RISK_WARNINGS, type ExerciseId, type Lesson, type Source } from './learnContent';
import {
  classifyCurve,
  ILLUSTRATIVE_CURVES,
  marginLeverage,
  positionSize,
  tickPnl,
  type CurveShape,
  type Refusal,
} from './learnMath';

const PROGRESS_KEY = 'learn.progress.v1';

function loadProgress(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveProgress(p: Record<string, boolean>) {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable (private mode / blocked): progress lives only for this session.
  }
}

const inputClass =
  'w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs text-[#E5E7EB] font-mono focus:outline-none focus:border-[#6366F1]';

const fmt = (v: number, digits = 2) => v.toLocaleString('vi-VN', { maximumFractionDigits: digits });

function Card({ children }: { children: ReactNode }) {
  return <div className="bg-[#111622] border border-[#263244] rounded-lg p-4">{children}</div>;
}

function NumField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block text-xs space-y-1">
      <span className="text-[#E5E7EB]/70">{label}</span>
      <input className={inputClass} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="block text-[10px] text-[#E5E7EB]/45">{hint}</span>}
    </label>
  );
}

function RefusalBox({ r }: { r: Refusal }) {
  return <p className="text-xs text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-md p-2">{r.reason}</p>;
}

function SourceLinks({ sources }: { sources: Source[] }) {
  return (
    <p className="text-[11px] text-[#E5E7EB]/50">
      Nguồn:{' '}
      {sources.map((s, i) => (
        <span key={s.url}>
          {i > 0 && ' · '}
          <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-[#E5E7EB]">
            {s.label}
          </a>
        </span>
      ))}
    </p>
  );
}

/** Instrument picker + summary of the verified spec values that the exercise will use. */
function SpecPicker({
  instruments,
  value,
  onChange,
}: {
  instruments: InstrumentDefinition[];
  value: string;
  onChange: (id: string) => void;
}) {
  const inst = instruments.find((i) => i.id === value);
  const s = inst?.specification;
  return (
    <div className="space-y-1.5">
      <label className="block text-xs space-y-1">
        <span className="text-[#E5E7EB]/70">Hợp đồng (đặc tả từ /api/instruments)</span>
        <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
          {instruments.map((i) => (
            <option key={i.id} value={i.id}>
              {i.id} — {i.productName} [{i.specification.verificationStatus}]
            </option>
          ))}
        </select>
      </label>
      {s && (
        <p className="text-[11px] text-[#E5E7EB]/60 font-mono">
          {s.contractSize ?? '?'} {s.contractSizeUnit} · tick {s.minimumTickSize ?? '?'} {s.quotationUnit} · tick value{' '}
          {s.tickValue ?? '?'} {s.tradingCurrency} ·{' '}
          <span className={s.verificationStatus === 'VERIFIED' ? 'text-[#10B981]' : 'text-[#F59E0B]'}>{s.verificationStatus}</span>
          {s.dataSource.startsWith('http') && (
            <>
              {' · '}
              <a href={s.dataSource} target="_blank" rel="noreferrer" className="underline">
                nguồn
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function useSpec(instruments: InstrumentDefinition[], initial: string) {
  const [id, setId] = useState(initial);
  useEffect(() => {
    if (instruments.length && !instruments.some((i) => i.id === id)) setId(instruments[0].id);
  }, [instruments, id]);
  const spec = instruments.find((i) => i.id === id)?.specification ?? null;
  return { id, setId, spec };
}

function TickPnlExercise({ instruments }: { instruments: InstrumentDefinition[] }) {
  const { id, setId, spec } = useSpec(instruments, 'CBOT:ZC');
  const [move, setMove] = useState('10');
  const [contracts, setContracts] = useState('1');
  const r = tickPnl(spec, Number(move), Number(contracts));
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#E5E7EB]/80">Câu hỏi: ngô (ZC) tăng 10 cent/bushel → lãi bao nhiêu mỗi hợp đồng? Đổi hợp đồng để thử mã khác.</p>
      <SpecPicker instruments={instruments} value={id} onChange={setId} />
      <div className="grid grid-cols-2 gap-3">
        <NumField label={`Biến động giá (${spec?.quotationUnit ?? 'đơn vị yết giá'})`} value={move} onChange={setMove} hint="Số âm = giá giảm" />
        <NumField label="Số hợp đồng (long)" value={contracts} onChange={setContracts} />
      </div>
      {r.ok ? (
        <div className="text-xs font-mono space-y-1">
          <p>
            Số tick = {move} ÷ {spec?.minimumTickSize} = {fmt(r.ticks, 4)}
            {r.fractionalTicks && <span className="text-[#F59E0B]"> (không tròn tick — giá thật luôn đi theo bội số tick)</span>}
          </p>
          <p>
            Lãi/lỗ mỗi HĐ = {fmt(r.ticks, 4)} × {spec?.tickValue} = <span className="text-white">{fmt(r.pnlPerContract)} {r.currency}</span>
          </p>
          <p>
            Tổng = <span className={r.pnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}>{fmt(r.pnl)} {r.currency}</span> (chưa trừ phí, trượt giá)
          </p>
        </div>
      ) : (
        <RefusalBox r={r} />
      )}
    </div>
  );
}

function MarginExercise({ instruments }: { instruments: InstrumentDefinition[] }) {
  const { id, setId, spec } = useSpec(instruments, 'CBOT:ZC');
  const [price, setPrice] = useState('');
  const [margin, setMargin] = useState('');
  const [currency, setCurrency] = useState<'VND' | 'USD'>('VND');
  const [fx, setFx] = useState('');
  const [movePct, setMovePct] = useState('-2');
  const fxNum = currency === 'USD' ? 1 : Number(fx);
  const r = marginLeverage(spec, Number(price), Number(margin), fxNum, Number(movePct));
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#E5E7EB]/80">
        Ký quỹ <strong>không</strong> có trong đặc tả (thay đổi thường xuyên). Hãy tự nhập giá hiện tại và mức ký quỹ ban đầu lấy từ bảng ký quỹ
        MXV/thành viên — các ô này được đánh dấu <span className="text-[#F59E0B]">do người dùng nhập</span>.
      </p>
      <SpecPicker instruments={instruments} value={id} onChange={setId} />
      <div className="grid grid-cols-2 gap-3">
        <NumField label={`Giá (${spec?.quotationUnit ?? '…'}) — do người dùng nhập`} value={price} onChange={setPrice} />
        <NumField label={`Ký quỹ ban đầu/HĐ (${currency}) — do người dùng nhập`} value={margin} onChange={setMargin} />
        <label className="block text-xs space-y-1">
          <span className="text-[#E5E7EB]/70">Đơn vị ký quỹ</span>
          <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value as 'VND' | 'USD')}>
            <option value="VND">VND</option>
            <option value="USD">USD</option>
          </select>
        </label>
        {currency === 'VND' && <NumField label="Tỷ giá VND/USD — do người dùng nhập" value={fx} onChange={setFx} />}
        <NumField label="Giá biến động (%)" value={movePct} onChange={setMovePct} />
      </div>
      {r.ok ? (
        <div className="text-xs font-mono space-y-1">
          <p>
            Giá trị danh nghĩa = ({price} ÷ {spec?.minimumTickSize}) × {spec?.tickValue} = {fmt(r.notional)} {r.currency}
          </p>
          <p>Ký quỹ quy đổi = {fmt(r.marginInTradingCurrency)} {r.currency}</p>
          <p>
            Đòn bẩy ≈ <span className="text-white">{fmt(r.leverage, 1)}x</span> → giá đi ngược ~{fmt(r.wipeoutMovePct)}% là mất toàn bộ ký quỹ
          </p>
          <p>
            Với biến động {movePct}%: lãi/lỗ = <span className={r.movePnl >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}>{fmt(r.movePnl)} {r.currency}</span> ={' '}
            {fmt(r.movePctOfMargin, 1)}% ký quỹ (vị thế long)
          </p>
        </div>
      ) : (
        <RefusalBox r={r} />
      )}
    </div>
  );
}

function SizingExercise({ instruments }: { instruments: InstrumentDefinition[] }) {
  const { id, setId, spec } = useSpec(instruments, 'CBOT:ZC');
  const [equity, setEquity] = useState('10000');
  const [riskPct, setRiskPct] = useState('1');
  const [stop, setStop] = useState('8');
  const [costs, setCosts] = useState('0');
  const r = positionSize(spec, Number(equity), Number(riskPct), Number(stop), Number(costs));
  return (
    <div className="space-y-3">
      <SpecPicker instruments={instruments} value={id} onChange={setId} />
      <div className="grid grid-cols-2 gap-3">
        <NumField label={`Vốn tài khoản (${spec?.tradingCurrency ?? 'USD'})`} value={equity} onChange={setEquity} />
        <NumField label="% rủi ro mỗi lệnh" value={riskPct} onChange={setRiskPct} />
        <NumField label={`Khoảng cách stop (${spec?.quotationUnit ?? '…'})`} value={stop} onChange={setStop} />
        <NumField label="Phí + trượt giá/HĐ (ước tính)" value={costs} onChange={setCosts} />
      </div>
      {r.ok ? (
        <div className="text-xs font-mono space-y-1">
          <p>Ngân sách rủi ro = {fmt(r.riskBudget)} {r.currency}</p>
          <p>
            Rủi ro/HĐ = {fmt(r.stopTicks, 4)} tick × {spec?.tickValue} + {costs} = {fmt(r.riskPerContract)} {r.currency}
          </p>
          <p>
            Số hợp đồng = floor({fmt(r.riskBudget)} ÷ {fmt(r.riskPerContract)}) = <span className="text-white">{r.contracts}</span>
            {r.contracts === 0 && <span className="text-[#F59E0B]"> → không vào lệnh: một hợp đồng đã vượt ngân sách rủi ro</span>}
          </p>
          {r.contracts > 0 && <p>Rủi ro thực tế = {fmt(r.actualRisk)} {r.currency}</p>}
        </div>
      ) : (
        <RefusalBox r={r} />
      )}
    </div>
  );
}

const SHAPE_LABEL: Record<CurveShape, string> = {
  CONTANGO: 'Contango (tháng xa cao hơn)',
  BACKWARDATION: 'Backwardation (tháng xa thấp hơn)',
  MIXED: 'Hỗn hợp (không đơn điệu)',
};

function CurveQuiz() {
  const [answers, setAnswers] = useState<Record<string, CurveShape>>({});
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#F59E0B] font-medium">Ví dụ minh hoạ, không phải giá thật.</p>
      {ILLUSTRATIVE_CURVES.map((c) => {
        const prices = c.points.map((p) => p.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const correct = classifyCurve(prices);
        const chosen = answers[c.id];
        const W = 220;
        const H = 70;
        const xy = c.points.map((p, i) => ({
          x: 10 + (i * (W - 20)) / (c.points.length - 1),
          y: 10 + ((max - p.price) * (H - 20)) / (max - min || 1),
        }));
        return (
          <div key={c.id} className="border border-[#263244] rounded-md p-3 space-y-2">
            <p className="text-xs text-white">{c.label} (minh hoạ)</p>
            <div className="flex flex-wrap items-center gap-4">
              <svg width={W} height={H} role="img" aria-label={`${c.label}: ${c.points.map((p) => `${p.month} ${p.price}`).join(', ')}`}>
                <polyline points={xy.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#6366F1" strokeWidth="2" />
                {xy.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="3" fill="#6366F1" />
                ))}
              </svg>
              <p className="text-[11px] font-mono text-[#E5E7EB]/70">{c.points.map((p) => `${p.month}: ${p.price}`).join(' · ')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SHAPE_LABEL) as CurveShape[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAnswers((a) => ({ ...a, [c.id]: s }))}
                  className={`text-xs px-2.5 py-1 rounded-md border ${
                    chosen === s ? 'border-[#6366F1] bg-[#6366F1]/15 text-white' : 'border-[#263244] text-[#E5E7EB]/75 hover:text-white'
                  }`}
                >
                  {SHAPE_LABEL[s]}
                </button>
              ))}
            </div>
            {chosen && (
              <p className={`text-xs ${chosen === correct ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                {chosen === correct ? 'Đúng.' : `Chưa đúng — đáp án: ${SHAPE_LABEL[correct]}.`}{' '}
                {correct === 'CONTANGO' && 'Long roll liên tục sẽ bán rẻ tháng gần, mua đắt tháng xa → roll yield âm.'}
                {correct === 'BACKWARDATION' && 'Long roll liên tục bán đắt tháng gần, mua rẻ tháng xa → roll yield dương (nếu đường cong giữ nguyên).'}
                {correct === 'MIXED' && 'Đường cong có thể gấp khúc: so từng cặp tháng liền kề thay vì kết luận một từ.'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Exercise({ id, instruments, loading }: { id: ExerciseId; instruments: InstrumentDefinition[]; loading: boolean }) {
  if (id === 'curve-quiz') return <CurveQuiz />;
  if (!instruments.length) {
    return (
      <RefusalBox
        r={{ ok: false, reason: loading ? 'Đang tải đặc tả hợp đồng từ /api/instruments…' : 'Không tải được đặc tả hợp đồng từ /api/instruments — bài tập không chạy khi thiếu dữ liệu đã xác minh.' }}
      />
    );
  }
  if (id === 'tick-pnl') return <TickPnlExercise instruments={instruments} />;
  if (id === 'margin-leverage') return <MarginExercise instruments={instruments} />;
  return <SizingExercise instruments={instruments} />;
}

function LessonCard({
  lesson,
  done,
  onToggle,
  instruments,
  loading,
}: {
  lesson: Lesson;
  done: boolean;
  onToggle: () => void;
  instruments: InstrumentDefinition[];
  loading: boolean;
}) {
  const { setActiveModule } = useTerminal();
  const [showExercise, setShowExercise] = useState(false);
  return (
    <Card>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          onChange={onToggle}
          aria-label={`Đã học: ${lesson.title}`}
          className="mt-1 accent-[#6366F1] w-4 h-4 shrink-0"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className={`text-sm font-medium ${done ? 'text-[#E5E7EB]/60' : 'text-white'}`}>{lesson.title}</h3>
          <ul className="list-disc pl-4 space-y-1 text-xs text-[#E5E7EB]/80">
            {lesson.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {lesson.example && <p className="text-xs text-[#E5E7EB]/80 bg-[#0B0E14] border border-[#263244] rounded-md p-2">Ví dụ: {lesson.example}</p>}
          {lesson.sources && <SourceLinks sources={lesson.sources} />}
          <div className="flex flex-wrap gap-2">
            {lesson.links?.map((l) => (
              <button
                key={l.module + l.label}
                type="button"
                onClick={() => setActiveModule(l.module)}
                className="text-[11px] px-2 py-1 rounded-md border border-[#263244] text-[#E5E7EB]/75 hover:text-white hover:border-[#6366F1]/60"
              >
                Mở {l.label} →
              </button>
            ))}
            {lesson.exercise && (
              <button
                type="button"
                onClick={() => setShowExercise((v) => !v)}
                className="text-[11px] px-2 py-1 rounded-md border border-[#6366F1]/50 bg-[#6366F1]/10 text-white"
              >
                {showExercise ? 'Ẩn bài tập' : 'Làm bài tập'}
              </button>
            )}
          </div>
          {lesson.exercise && showExercise && (
            <div className="pt-2 border-t border-[#263244]">
              <Exercise id={lesson.exercise} instruments={instruments} loading={loading} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function LearnView() {
  const { instruments, loading } = useTerminal();
  const [progress, setProgress] = useState<Record<string, boolean>>(() => loadProgress());
  const allIds = useMemo(() => LEVELS.flatMap((l) => l.lessons.map((x) => x.id)), []);
  const doneCount = allIds.filter((id) => progress[id]).length;

  const toggle = (id: string) => {
    setProgress((p) => {
      const next = { ...p, [id]: !p[id] };
      saveProgress(next);
      return next;
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="space-y-2">
        <h1 className="text-lg font-semibold text-white">Học phái sinh hàng hóa</h1>
        <p className="text-xs text-[#E5E7EB]/70">
          Lộ trình 5 cấp cho người mới. Bài tập dùng đặc tả hợp đồng đã xác minh từ Instrument Master và sẽ từ chối nếu đặc tả chưa xác minh.
          Tài liệu giáo dục — <strong>không phải khuyến nghị đầu tư</strong>. Bản đầy đủ: <code>docs/LEARNING_PATH.md</code>.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-[#172033] rounded-full overflow-hidden" aria-hidden="true">
            <div className="h-full bg-[#6366F1]" style={{ width: `${(doneCount / allIds.length) * 100}%` }} />
          </div>
          <span className="text-xs font-mono text-[#E5E7EB]/70">
            {doneCount}/{allIds.length} bài
          </span>
        </div>
      </header>

      {LEVELS.map((level) => (
        <section key={level.id} className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-white">{level.title}</h2>
            <p className="text-xs text-[#E5E7EB]/60">{level.goal}</p>
          </div>
          {level.lessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              done={!!progress[lesson.id]}
              onToggle={() => toggle(lesson.id)}
              instruments={instruments}
              loading={loading}
            />
          ))}
        </section>
      ))}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Các cách kiếm tiền từ phái sinh</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-[#263244]">
            <thead className="bg-[#111622] text-[#E5E7EB]/60">
              <tr>
                <th className="text-left p-2">Cách</th>
                <th className="text-left p-2">Mô tả</th>
                <th className="text-left p-2">Phù hợp</th>
                <th className="text-left p-2">Rủi ro / lưu ý</th>
              </tr>
            </thead>
            <tbody>
              {MONEY_WAYS.map((w) => (
                <tr key={w.name} className="border-t border-[#263244] align-top">
                  <td className="p-2 text-white">{w.name}</td>
                  <td className="p-2 text-[#E5E7EB]/80">{w.description}</td>
                  <td className="p-2 text-[#E5E7EB]/80">{w.fit}</td>
                  <td className="p-2 text-[#E5E7EB]/80">{w.risk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2 border border-[#EF4444]/40 bg-[#EF4444]/5 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-white">Rủi ro — đọc trước khi giao dịch</h2>
        <ul className="list-disc pl-4 space-y-2 text-xs text-[#E5E7EB]/85">
          {RISK_WARNINGS.map((w) => (
            <li key={w.text}>
              {w.text}
              {w.sources && <SourceLinks sources={w.sources} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
