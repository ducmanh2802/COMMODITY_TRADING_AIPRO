import { useEffect, useState } from 'react';
import { OrderCalculator } from './OrderCalculator';
import type { InstrumentDefinition } from '../../../shared/types/instrument';
import type { CalculatorId } from './curriculum/types';
import {
  classifyCurve,
  convertCurrency,
  marginCallDistance,
  rollCost,
  ILLUSTRATIVE_CURVES,
  marginLeverage,
  positionSize,
  tickPnl,
  type CurveShape,
  type Refusal,
} from './learnMath';

const inputClass =
  'w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]';

const fmt = (v: number, digits = 2) => v.toLocaleString('vi-VN', { maximumFractionDigits: digits });

export function NumField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block text-xs space-y-1">
      <span className="text-[var(--text)]/70">{label}</span>
      <input className={inputClass} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="block text-[10px] text-[var(--text)]/45">{hint}</span>}
    </label>
  );
}

export function RefusalBox({ r }: { r: Refusal }) {
  return <p className="text-xs text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/30 rounded-md p-2">{r.reason}</p>;
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
        <span className="text-[var(--text)]/70">Hợp đồng (đặc tả từ /api/instruments)</span>
        <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
          {instruments.map((i) => (
            <option key={i.id} value={i.id}>
              {i.id} — {i.productName} [{i.specification.verificationStatus}]
            </option>
          ))}
        </select>
      </label>
      {s && (
        <p className="text-[11px] text-[var(--text)]/60 font-mono">
          {s.contractSize ?? '?'} {s.contractSizeUnit} · tick {s.minimumTickSize ?? '?'} {s.quotationUnit} · tick value{' '}
          {s.tickValue ?? '?'} {s.tradingCurrency} ·{' '}
          <span className={s.verificationStatus === 'VERIFIED' ? 'text-[var(--accent-text)]' : 'text-[var(--warning)]'}>{s.verificationStatus}</span>
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
      <p className="text-xs text-[var(--text)]/80">Câu hỏi: ngô (ZC) tăng 10 cent/bushel → lãi bao nhiêu mỗi hợp đồng? Đổi hợp đồng để thử mã khác.</p>
      <SpecPicker instruments={instruments} value={id} onChange={setId} />
      <div className="grid grid-cols-2 gap-3">
        <NumField label={`Biến động giá (${spec?.quotationUnit ?? 'đơn vị yết giá'})`} value={move} onChange={setMove} hint="Số âm = giá giảm" />
        <NumField label="Số hợp đồng (long)" value={contracts} onChange={setContracts} />
      </div>
      {r.ok ? (
        <div className="text-xs font-mono space-y-1">
          <p>
            Số tick = {move} ÷ {spec?.minimumTickSize} = {fmt(r.ticks, 4)}
            {r.fractionalTicks && <span className="text-[var(--warning)]"> (không tròn tick — giá thật luôn đi theo bội số tick)</span>}
          </p>
          <p>
            Lãi/lỗ mỗi HĐ = {fmt(r.ticks, 4)} × {spec?.tickValue} = <span className="text-[var(--text-strong)]">{fmt(r.pnlPerContract)} {r.currency}</span>
          </p>
          <p>
            Tổng = <span className={r.pnl >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>{fmt(r.pnl)} {r.currency}</span> (chưa trừ phí, trượt giá)
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
      <p className="text-xs text-[var(--text)]/80">
        Ký quỹ <strong>không</strong> có trong đặc tả (thay đổi thường xuyên). Hãy tự nhập giá hiện tại và mức ký quỹ ban đầu lấy từ bảng ký quỹ
        MXV/thành viên — các ô này được đánh dấu <span className="text-[var(--warning)]">do người dùng nhập</span>.
      </p>
      <SpecPicker instruments={instruments} value={id} onChange={setId} />
      <div className="grid grid-cols-2 gap-3">
        <NumField label={`Giá (${spec?.quotationUnit ?? '…'}) — do người dùng nhập`} value={price} onChange={setPrice} />
        <NumField label={`Ký quỹ ban đầu/HĐ (${currency}) — do người dùng nhập`} value={margin} onChange={setMargin} />
        <label className="block text-xs space-y-1">
          <span className="text-[var(--text)]/70">Đơn vị ký quỹ</span>
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
            Đòn bẩy ≈ <span className="text-[var(--text-strong)]">{fmt(r.leverage, 1)}x</span> → giá đi ngược ~{fmt(r.wipeoutMovePct)}% là mất toàn bộ ký quỹ
          </p>
          <p>
            Với biến động {movePct}%: lãi/lỗ = <span className={r.movePnl >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>{fmt(r.movePnl)} {r.currency}</span> ={' '}
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
            Số hợp đồng = floor({fmt(r.riskBudget)} ÷ {fmt(r.riskPerContract)}) = <span className="text-[var(--text-strong)]">{r.contracts}</span>
            {r.contracts === 0 && <span className="text-[var(--warning)]"> → không vào lệnh: một hợp đồng đã vượt ngân sách rủi ro</span>}
          </p>
          {r.contracts > 0 && <p>Rủi ro thực tế = {fmt(r.actualRisk)} {r.currency}</p>}
        </div>
      ) : (
        <RefusalBox r={r} />
      )}
    </div>
  );
}

function RollExercise({ instruments }: { instruments: InstrumentDefinition[] }) {
  const { id, setId, spec } = useSpec(instruments, 'CBOT:ZC');
  const [near, setNear] = useState('450');
  const [far, setFar] = useState('455');
  const [contracts, setContracts] = useState('1');
  const r = rollCost(spec, Number(near), Number(far), Number(contracts));
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text)]/80">Roll vị thế mua: bán tháng gần, mua tháng xa. Giá nhập là số minh hoạ do bạn tự nhập.</p>
      <SpecPicker instruments={instruments} value={id} onChange={setId} />
      <div className="grid grid-cols-3 gap-3">
        <NumField label="Giá tháng gần" value={near} onChange={setNear} />
        <NumField label="Giá tháng xa" value={far} onChange={setFar} />
        <NumField label="Số hợp đồng" value={contracts} onChange={setContracts} />
      </div>
      {r.ok ? (
        <div className="text-xs font-mono space-y-1">
          <p>Chênh lệch = {far} - {near} = {fmt(r.spreadPrice, 4)} ({fmt(r.spreadTicks, 2)} tick) → {r.state}</p>
          <p>
            Chi phí roll = <span className={r.cost > 0 ? 'text-[var(--negative)]' : 'text-[var(--positive)]'}>{fmt(r.cost)} {r.currency}</span> (dương = bạn trả; chưa gồm phí/trượt giá)
          </p>
        </div>
      ) : (
        <RefusalBox r={r} />
      )}
    </div>
  );
}

function MarginCallExercise({ instruments }: { instruments: InstrumentDefinition[] }) {
  const { id, setId, spec } = useSpec(instruments, 'CBOT:ZC');
  const [initial, setInitial] = useState('');
  const [maint, setMaint] = useState('');
  const [contracts, setContracts] = useState('1');
  const r = marginCallDistance(spec, Number(initial), Number(maint), Number(contracts));
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text)]/80">
        Tự nhập ký quỹ ban đầu và duy trì (USD/hợp đồng) từ bảng ký quỹ hiện hành — <span className="text-[var(--warning)]">do người dùng nhập</span>.
      </p>
      <SpecPicker instruments={instruments} value={id} onChange={setId} />
      <div className="grid grid-cols-3 gap-3">
        <NumField label="Ký quỹ ban đầu/HĐ (USD)" value={initial} onChange={setInitial} />
        <NumField label="Ký quỹ duy trì/HĐ (USD)" value={maint} onChange={setMaint} />
        <NumField label="Số hợp đồng" value={contracts} onChange={setContracts} />
      </div>
      {r.ok ? (
        <div className="text-xs font-mono space-y-1">
          <p>Đệm trước khi bị gọi ký quỹ = {fmt(r.bufferPerContract)} {r.currency}/HĐ ({fmt(r.bufferTotal)} tổng)</p>
          <p>≈ {fmt(r.ticksToCall, 2)} tick ≈ {fmt(r.priceMoveToCall, 4)} {spec?.quotationUnit} giá đi ngược (chưa gồm phí)</p>
        </div>
      ) : (
        <RefusalBox r={r} />
      )}
    </div>
  );
}

function FxExercise({ instruments }: { instruments: InstrumentDefinition[] }) {
  const { id, setId, spec } = useSpec(instruments, 'CBOT:ZC');
  const [usd, setUsd] = useState(String(spec?.tickValue ?? '12.5'));
  const [rate, setRate] = useState('');
  const r = convertCurrency(Number(usd), Number(rate));
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text)]/80">Đổi một số tiền USD sang VND bằng tỷ giá do bạn nhập (lấy từ thành viên môi giới). Mặc định là giá trị tick của mã đã chọn.</p>
      <SpecPicker instruments={instruments} value={id} onChange={(v) => { setId(v); const t = instruments.find((i) => i.id === v)?.specification.tickValue; if (t) setUsd(String(t)); }} />
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Số tiền (USD)" value={usd} onChange={setUsd} />
        <NumField label="Tỷ giá VND/USD — do người dùng nhập" value={rate} onChange={setRate} />
      </div>
      {r.ok ? <p className="text-xs font-mono">= <span className="text-[var(--text-strong)]">{fmt(r.value, 0)} VND</span></p> : <RefusalBox r={r} />}
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
      <p className="text-xs text-[var(--warning)] font-medium">Ví dụ minh hoạ, không phải giá thật.</p>
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
          <div key={c.id} className="border border-[var(--border)] rounded-md p-3 space-y-2">
            <p className="text-xs text-[var(--text-strong)]">{c.label} (minh hoạ)</p>
            <div className="flex flex-wrap items-center gap-4">
              <svg width={W} height={H} role="img" aria-label={`${c.label}: ${c.points.map((p) => `${p.month} ${p.price}`).join(', ')}`}>
                <polyline points={xy.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {xy.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="4" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
                ))}
              </svg>
              <p className="text-[11px] font-mono text-[var(--text)]/70">{c.points.map((p) => `${p.month}: ${p.price}`).join(' · ')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SHAPE_LABEL) as CurveShape[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAnswers((a) => ({ ...a, [c.id]: s }))}
                  className={`text-xs px-2.5 py-1 rounded-md border ${
                    chosen === s ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-strong)]' : 'border-[var(--border)] text-[var(--text)]/75 hover:text-[var(--text-strong)]'
                  }`}
                >
                  {SHAPE_LABEL[s]}
                </button>
              ))}
            </div>
            {chosen && (
              <p className={`text-xs ${chosen === correct ? 'text-[var(--accent-text)]' : 'text-[var(--warning)]'}`}>
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

export function Exercise({ id, instruments, loading }: { id: CalculatorId; instruments: InstrumentDefinition[]; loading: boolean }) {
  if (id === 'curve-quiz') return <CurveQuiz />;
  if (id === 'order') return <OrderCalculator instruments={instruments} compact />;
  if (id === 'fx-convert' && !instruments.length) return <FxExercise instruments={instruments} />;
  if (!instruments.length) {
    return (
      <RefusalBox
        r={{ ok: false, reason: loading ? 'Đang tải đặc tả hợp đồng từ /api/instruments…' : 'Không tải được đặc tả hợp đồng từ /api/instruments — bài tập không chạy khi thiếu dữ liệu đã xác minh.' }}
      />
    );
  }
  if (id === 'fx-convert') return <FxExercise instruments={instruments} />;
  if (id === 'roll-cost') return <RollExercise instruments={instruments} />;
  if (id === 'margin-call') return <MarginCallExercise instruments={instruments} />;
  if (id === 'tick-pnl') return <TickPnlExercise instruments={instruments} />;
  if (id === 'margin-leverage') return <MarginExercise instruments={instruments} />;
  return <SizingExercise instruments={instruments} />;
}

