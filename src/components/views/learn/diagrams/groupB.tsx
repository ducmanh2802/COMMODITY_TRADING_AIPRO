import { Figure, M, S, T, type FigureMap } from './kit';

/*
 * Lesson figures for curriculum levels 4–6 (keys prefixed 'b-').
 * Theme tokens only. Blue (--positive) = up/gain, apricot (--negative) = down/loss, --warning = caution.
 * Numbers follow the lesson text; ZC (CBOT corn): 5.000 bushel, 1 cent = 50 USD, tick 0,25 cent = 12,5 USD.
 */

type Tone = 'a' | 'p' | 'n' | 'w' | 'm';
const C: Record<Tone, string> = { a: 'var(--accent)', p: 'var(--positive)', n: 'var(--negative)', w: 'var(--warning)', m: 'var(--muted)' };

const Defs = () => (
  <defs>
    <marker id="bm-arr" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0 0 L8 4 L0 8 z" fill="var(--muted)" />
    </marker>
  </defs>
);

function Tx({ x, y, lines, s = T, anchor = 'middle', lh = 13 }: { x: number; y: number; lines: string[]; s?: object; anchor?: 'start' | 'middle' | 'end'; lh?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} {...s}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

function Bx({ x, y, w, h, lines, tone = 'a', s = T, lh = 13 }: { x: number; y: number; w: number; h: number; lines: string[]; tone?: Tone; s?: object; lh?: number }) {
  const ty = y + h / 2 - ((lines.length - 1) * lh) / 2 + 4;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={6} fill="var(--surface)" />
      <rect x={x} y={y} width={w} height={h} rx={6} fill={C[tone]} fillOpacity={0.13} stroke={C[tone]} strokeWidth={1.2} />
      <Tx x={x + w / 2} y={ty} lines={lines} s={s} lh={lh} />
    </g>
  );
}

const Ar = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted)" strokeWidth={1.5} markerEnd="url(#bm-arr)" />
);

const pts = (arr: number[], x0: number, dx: number, y0: number, k: number) => arr.map((v, i) => `${x0 + i * dx},${y0 - v * k}`).join(' ');

/* ---------- Level 4 ---------- */

function FundBalance() {
  const panels: { x: number; cung: number; cau: number; head: string[]; tone: Tone; sym: string }[] = [
    { x: 6, cung: 40, cau: 75, head: ['Cầu > cung', 'tồn kho giảm'], tone: 'p', sym: '▲ áp lực tăng giá' },
    { x: 126, cung: 58, cau: 58, head: ['Cung ≈ cầu', 'tồn kho ổn định'], tone: 'a', sym: '● cân bằng' },
    { x: 246, cung: 75, cau: 40, head: ['Cung > cầu', 'tồn kho tăng'], tone: 'n', sym: '▼ áp lực giảm giá' },
  ];
  return (
    <Figure w={360} h={230} title="Cung – cầu và áp lực giá" desc="Ba cột so sánh cung và cầu: cầu lớn hơn cung gợi ý áp lực tăng, cân bằng, cung lớn hơn cầu gợi ý áp lực giảm. Hình minh họa.">
      {panels.map((p) => (
        <g key={p.x}>
          <rect x={p.x} y={6} width={108} height={178} rx={8} fill={C[p.tone]} fillOpacity={0.07} stroke={C[p.tone]} />
          <Tx x={p.x + 54} y={24} lines={p.head} s={S} />
          <rect x={p.x + 20} y={160 - p.cung} width={28} height={p.cung} fill="var(--accent)" fillOpacity={0.5} />
          <rect x={p.x + 60} y={160 - p.cau} width={28} height={p.cau} fill="var(--muted)" fillOpacity={0.5} />
          <Tx x={p.x + 34} y={174} lines={['Cung']} s={M} />
          <Tx x={p.x + 74} y={174} lines={['Cầu']} s={M} />
          <text x={p.x + 54} y={198} textAnchor="middle" {...T} fill={C[p.tone]}>{p.sym}</text>
        </g>
      ))}
      <Tx x={180} y={218} lines={['Minh họa: chỉ là xu hướng, không chắc chắn']} s={M} />
    </Figure>
  );
}

function FundChain() {
  return (
    <Figure w={360} h={236} title="Từ dữ kiện cung–cầu đến câu hỏi “vì sao”" desc="Sản lượng và thời tiết, tồn kho trên tiêu thụ, USD và chính sách đi vào bức tranh cung–cầu, cho biết vì sao giá có thể đổi nhưng không cho biết khi nào.">
      <Defs />
      <Bx x={6} y={8} w={108} h={46} lines={['Sản lượng,', 'thời tiết']} tone="a" />
      <Bx x={126} y={8} w={108} h={46} lines={['Tồn kho /', 'tiêu thụ']} tone="a" />
      <Bx x={246} y={8} w={108} h={46} lines={['USD, chính', 'sách xuất nhập']} tone="a" />
      <Ar x1={60} y1={56} x2={140} y2={86} />
      <Ar x1={180} y1={56} x2={180} y2={86} />
      <Ar x1={300} y1={56} x2={220} y2={86} />
      <Bx x={50} y={88} w={260} h={40} lines={['Bức tranh cung – cầu']} tone="m" s={S} />
      <Ar x1={120} y1={130} x2={95} y2={156} />
      <Ar x1={240} y1={130} x2={265} y2={156} />
      <Bx x={6} y={158} w={170} h={54} lines={['Cho biết: VÌ SAO', 'giá có thể đổi']} tone="p" />
      <Bx x={184} y={158} w={170} h={54} lines={['KHÔNG cho biết:', 'KHI NÀO giá đổi']} tone="w" />
      <Tx x={180} y={228} lines={['Thị trường có thể đi ngược cơ bản rất lâu']} s={M} />
    </Figure>
  );
}

const MA_P = [62, 60, 63, 58, 55, 57, 52, 50, 53, 48, 45, 47, 44, 46, 50, 49, 54, 58, 56, 61, 65, 63, 68, 72, 70, 75, 74, 79, 77, 82, 80, 78, 81, 76, 73, 70];
const sma = (a: number[], n: number) => a.map((_, i) => (i < n - 1 ? NaN : a.slice(i - n + 1, i + 1).reduce((s, v) => s + v, 0) / n));
const MA_F = sma(MA_P, 3);
const MA_S = sma(MA_P, 9);
const maCross = (() => {
  const out: { i: number; up: boolean }[] = [];
  for (let i = 9; i < MA_P.length; i++) {
    const d0 = MA_F[i - 1] - MA_S[i - 1];
    const d1 = MA_F[i] - MA_S[i];
    if (d0 <= 0 && d1 > 0) out.push({ i, up: true });
    if (d0 >= 0 && d1 < 0) out.push({ i, up: false });
  }
  return out;
})();

function MaCross() {
  const px = (i: number) => 14 + i * 9.5;
  const py = (v: number) => 180 - v * 1.7;
  const line = (arr: number[]) => arr.map((v, i) => (Number.isNaN(v) ? '' : `${px(i)},${py(v)}`)).filter(Boolean).join(' ');
  return (
    <Figure w={360} h={238} title="Đường trung bình động (MA) và giao cắt" desc="Đường giá minh họa với MA nhanh và MA chậm. MA nhanh cắt lên trên MA chậm gợi ý đà tăng, cắt xuống gợi ý đà yếu; cả hai đều đến sau diễn biến giá.">
      <polyline points={line(MA_P)} fill="none" stroke="var(--text)" strokeOpacity={0.45} strokeWidth={1.5} />
      <polyline points={line(MA_S)} fill="none" stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 3" />
      <polyline points={line(MA_F)} fill="none" stroke="var(--accent)" strokeWidth={2.2} />
      {maCross.map((c) => (
        <g key={c.i}>
          <circle cx={px(c.i)} cy={py(MA_F[c.i])} r={5} fill="none" stroke={c.up ? 'var(--positive)' : 'var(--negative)'} strokeWidth={2} />
          <text x={px(c.i) > 300 ? px(c.i) + 6 : px(c.i)} y={py(MA_F[c.i]) + (c.up ? 20 : -10)} textAnchor={px(c.i) > 300 ? 'end' : 'middle'} {...T} fill={c.up ? 'var(--positive)' : 'var(--negative)'}>{c.up ? 'cắt lên' : 'cắt xuống'}</text>
        </g>
      ))}
      <line x1={16} x2={26} y1={204} y2={204} stroke="var(--text)" strokeOpacity={0.45} strokeWidth={2} />
      <Tx x={30} y={208} lines={['Giá']} s={M} anchor="start" />
      <line x1={70} x2={82} y1={204} y2={204} stroke="var(--accent)" strokeWidth={2.2} />
      <Tx x={86} y={208} lines={['MA nhanh (ngắn)']} s={M} anchor="start" />
      <line x1={190} x2={202} y1={204} y2={204} stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 3" />
      <Tx x={206} y={208} lines={['MA chậm (dài)']} s={M} anchor="start" />
      <Tx x={180} y={228} lines={['Minh họa, không phải dữ liệu thật. MA luôn trễ so với giá.']} s={M} />
    </Figure>
  );
}

const RSI = [50, 55, 62, 68, 73, 78, 81, 76, 79, 83, 77, 80, 74, 72, 76, 71, 66, 58, 49, 40];
function RsiBand() {
  const px = (i: number) => 20 + i * 16.5;
  const py = (v: number) => 176 - v * 1.5;
  return (
    <Figure w={360} h={232} title="RSI: thang 0–100 và vùng 70/30" desc="Đường RSI minh họa vượt vùng trên 70 trong thời gian dài khi xu hướng mạnh. Trên 70 thường gọi là quá mua, dưới 30 là quá bán; không phải tín hiệu đảo chiều tự động.">
      <rect x={14} y={py(100)} width={332} height={py(70) - py(100)} fill="var(--warning)" fillOpacity={0.14} />
      <rect x={14} y={py(30)} width={332} height={py(0) - py(30)} fill="var(--accent)" fillOpacity={0.14} />
      {[0, 30, 70, 100].map((v) => (
        <g key={v}>
          <line x1={14} x2={346} y1={py(v)} y2={py(v)} stroke="var(--border)" strokeDasharray={v === 30 || v === 70 ? '' : '3 3'} />
          <Tx x={12} y={py(v) - 2} lines={[String(v)]} s={M} anchor="start" />
        </g>
      ))}
      <polyline points={RSI.map((v, i) => `${px(i)},${py(v)}`).join(' ')} fill="none" stroke="var(--text-strong)" strokeWidth={2.2} />
      <Tx x={346} y={py(85)} lines={['quá mua (>70)']} s={{ ...M, fill: 'var(--warning)' }} anchor="end" />
      <Tx x={346} y={py(10)} lines={['quá bán (<30)']} s={{ ...M, fill: 'var(--accent)' }} anchor="end" />
      <line x1={px(4)} x2={px(15)} y1={py(60)} y2={py(60)} stroke="var(--muted)" markerStart="url(#bm-arr)" markerEnd="url(#bm-arr)" />
      <Defs />
      <Tx x={(px(4) + px(15)) / 2} y={py(60) + 14} lines={['xu hướng mạnh: RSI có thể ở >70 rất lâu']} s={M} />
      <Tx x={180} y={222} lines={['Minh họa. RSI đo động lượng, không đo “sắp đảo chiều”.']} s={M} />
    </Figure>
  );
}

function AtrRange() {
  const cs = [
    { x: 40, hi: 40, lo: 112, o: 90, c: 58, up: true },
    { x: 78, hi: 48, lo: 118, o: 62, c: 100, up: false },
    { x: 116, hi: 52, lo: 106, o: 98, c: 64, up: true },
    { x: 154, hi: 38, lo: 100, o: 60, c: 88, up: false },
  ];
  return (
    <Figure w={360} h={252} title="ATR: biên độ trung bình mỗi nến, quy ra tiền" desc="Bốn nến minh họa với biên độ trung bình ATR. Ví dụ ngô: ATR 8 cent bằng 32 tick, mỗi tick 12,5 USD nên khoảng 400 USD mỗi hợp đồng.">
      <Defs />
      {cs.map((c) => {
        const col = c.up ? 'var(--positive)' : 'var(--negative)';
        return (
          <g key={c.x}>
            <line x1={c.x} x2={c.x} y1={c.hi} y2={c.lo} stroke={col} strokeWidth={2} />
            <rect x={c.x - 9} y={Math.min(c.o, c.c)} width={18} height={Math.abs(c.o - c.c)} fill={col} fillOpacity={0.4} stroke={col} strokeWidth={2} />
          </g>
        );
      })}
      <line x1={180} x2={196} y1={46} y2={46} stroke="var(--muted)" />
      <line x1={180} x2={196} y1={114} y2={114} stroke="var(--muted)" />
      <line x1={192} x2={192} y1={46} y2={114} stroke="var(--muted)" markerStart="url(#bm-arr)" markerEnd="url(#bm-arr)" />
      <Tx x={204} y={76} lines={['ATR', '= biên độ', 'trung bình', 'mỗi nến']} s={T} anchor="start" />
      <Tx x={300} y={130} lines={['(minh họa)']} s={M} />
      <Bx x={8} y={150} w={96} h={44} lines={['ATR 8 cent', '(ngô ZC)']} tone="a" />
      <Ar x1={106} y1={172} x2={126} y2={172} />
      <Bx x={128} y={150} w={96} h={44} lines={['8 ÷ 0,25', '= 32 tick']} tone="a" />
      <Ar x1={226} y1={172} x2={246} y2={172} />
      <Bx x={248} y={150} w={104} h={44} lines={['32 × 12,5 USD', '= 400 USD']} tone="w" />
      <Tx x={180} y={214} lines={['1 cent ngô = 50 USD mỗi hợp đồng (5.000 bushel)', 'ATR đo biên độ/rủi ro, không đoán hướng giá']} s={M} />
    </Figure>
  );
}

function CurveRoll() {
  return (
    <Figure w={360} h={284} title="Contango, backwardation và chi phí roll" desc="Contango: tháng xa 456 cao hơn tháng gần 450; roll vị thế mua tốn 6 cent bằng 300 USD mỗi hợp đồng ngô. Backwardation: tháng xa 450 thấp hơn tháng gần 456; roll có lợi 300 USD nếu đường cong giữ nguyên.">
      <Defs />
      {[
        { x: 6, near: 450, far: 456, name: 'Contango', tone: 'n' as Tone, n: ['Xa đắt hơn gần', 'Roll mua: mua đắt hơn 6 cent', '6 × 50 = 300 USD/hợp đồng', '(tốn, trước phí)'] },
        { x: 186, near: 456, far: 450, name: 'Backwardation', tone: 'p' as Tone, n: ['Xa rẻ hơn gần', 'Roll mua: mua rẻ hơn 6 cent', '6 × 50 = 300 USD/hợp đồng', '(có lợi nếu đường cong giữ nguyên)'] },
      ].map((p) => {
        const h = (v: number) => 20 + (v - 440) * 4;
        return (
          <g key={p.name}>
            <rect x={p.x} y={6} width={168} height={266} rx={8} fill={C[p.tone]} fillOpacity={0.06} stroke={C[p.tone]} />
            <Tx x={p.x + 84} y={24} lines={[p.name]} s={S} />
            <rect x={p.x + 24} y={150 - h(p.near)} width={44} height={h(p.near)} fill="var(--accent)" fillOpacity={0.5} />
            <rect x={p.x + 100} y={150 - h(p.far)} width={44} height={h(p.far)} fill="var(--accent)" fillOpacity={0.5} />
            <Tx x={p.x + 46} y={146 - h(p.near)} lines={[String(p.near)]} s={T} />
            <Tx x={p.x + 122} y={146 - h(p.far)} lines={[String(p.far)]} s={T} />
            <Tx x={p.x + 46} y={166} lines={['Tháng gần']} s={M} />
            <Tx x={p.x + 122} y={166} lines={['Tháng xa']} s={M} />
            <Tx x={p.x + 84} y={192} lines={p.n} s={T} lh={15} />
          </g>
        );
      })}
      <Tx x={180} y={282} lines={['Số minh họa (cent/bushel); trục cột bị cắt để dễ nhìn']} s={M} />
    </Figure>
  );
}

function CurveWhy() {
  return (
    <Figure w={360} h={200} title="Vì sao đường cong dốc lên hoặc xuống" desc="Contango thường gặp khi chi phí lưu kho và tài chính cao hoặc tồn kho dồi dào; backwardation thường gặp khi nguồn cung hiện tại khan hiếm. Đường cong không phải dự báo giá.">
      <Bx x={6} y={8} w={170} h={124} lines={['CONTANGO', 'xa > gần', '• chi phí lưu kho, tài chính cao', '• tồn kho dồi dào']} tone="n" s={T} lh={17} />
      <Bx x={184} y={8} w={170} h={124} lines={['BACKWARDATION', 'xa < gần', '• nguồn cung hiện tại khan', '• cầu gần hạn cao']} tone="p" s={T} lh={17} />
      <Bx x={6} y={146} w={348} h={44} lines={['Đường cong = gợi ý về cung–cầu hiện tại', 'KHÔNG phải dự báo giá']} tone="w" />
    </Figure>
  );
}

function CotGroups() {
  const rows: { en: string; vi: string; tag: string; tone: Tone }[] = [
    { en: 'Producer/Merchant/Processor/User', vi: 'Doanh nghiệp hàng thật: khoá giá', tag: 'phòng hộ', tone: 'a' },
    { en: 'Swap Dealer', vi: 'Tạo lập giao dịch hoán đổi cho khách', tag: 'trung gian', tone: 'm' },
    { en: 'Managed Money', vi: 'Quỹ, CTA, hedge fund (đầu cơ)', tag: 'đầu cơ', tone: 'p' },
    { en: 'Other Reportables', vi: 'Các tổ chức còn lại', tag: 'khác', tone: 'm' },
    { en: 'Nonreportable', vi: 'Vị thế nhỏ, gồm nhà đầu tư lẻ', tag: 'nhỏ lẻ', tone: 'w' },
  ];
  return (
    <Figure w={360} h={288} title="Các nhóm trong báo cáo COT (bản disaggregated)" desc="Năm nhóm người giữ vị thế: doanh nghiệp hàng thật, swap dealer, managed money, other reportables và nhóm không báo cáo gồm nhà đầu tư nhỏ lẻ.">
      {rows.map((r, i) => (
        <g key={r.en}>
          <rect x={6} y={8 + i * 54} width={348} height={48} rx={6} fill={C[r.tone]} fillOpacity={0.1} stroke={C[r.tone]} />
          <Tx x={14} y={26 + i * 54} lines={[r.en]} s={{ ...T, fontWeight: 600 }} anchor="start" />
          <Tx x={14} y={42 + i * 54} lines={[r.vi]} s={M} anchor="start" />
          <Tx x={346} y={34 + i * 54} lines={[r.tag]} s={{ ...T, fill: C[r.tone] }} anchor="end" />
        </g>
      ))}
    </Figure>
  );
}

function CotTimeline() {
  const days = ['T2', 'T3', 'T4', 'T5', 'T6'];
  return (
    <Figure w={360} h={168} title="Độ trễ của COT: chốt thứ Ba, công bố thứ Sáu" desc="Vị thế được tính tại thứ Ba và CFTC công bố vào thứ Sáu, nên dữ liệu đã cũ khoảng ba ngày.">
      <Defs />
      <line x1={20} x2={340} y1={60} y2={60} stroke="var(--border)" strokeWidth={2} />
      {days.map((d, i) => (
        <g key={d}>
          <circle cx={50 + i * 65} cy={60} r={5} fill={i === 1 ? 'var(--accent)' : i === 4 ? 'var(--warning)' : 'var(--muted)'} />
          <Tx x={50 + i * 65} y={84} lines={[d]} s={T} />
        </g>
      ))}
      <Tx x={115} y={40} lines={['chốt vị thế']} s={{ ...T, fill: 'var(--accent)' }} />
      <Tx x={310} y={40} lines={['CFTC công bố']} s={{ ...T, fill: 'var(--warning)' }} />
      <line x1={115} x2={310} y1={104} y2={104} stroke="var(--muted)" markerStart="url(#bm-arr)" markerEnd="url(#bm-arr)" />
      <Tx x={212} y={122} lines={['độ trễ ≈ 3 ngày']} s={T} />
      <Tx x={180} y={152} lines={['COT chỉ áp dụng cho hợp đồng niêm yết tại Mỹ']} s={M} />
    </Figure>
  );
}

const SEA_AVG = [40, 44, 52, 60, 66, 62, 56, 50, 46, 42, 40, 38];
const SEA_Y = [
  [48, 40, 44, 70, 78, 50, 62, 40, 52, 36, 46, 30],
  [34, 50, 60, 52, 58, 72, 46, 58, 40, 48, 34, 44],
  [44, 46, 40, 66, 54, 66, 64, 44, 50, 36, 44, 36],
];
function SeasonSketch() {
  const px = (i: number) => 30 + i * 26;
  const py = (v: number) => 172 - v * 1.7;
  return (
    <Figure w={360} h={234} title="Mùa vụ: trung bình nhiều năm và từng năm" desc="Đường dày là mức trung bình lịch sử minh họa, các đường mảnh là từng năm riêng lẻ và lệch khá xa trung bình. Mùa vụ chỉ là bối cảnh, không phải quy luật.">
      {SEA_Y.map((y, k) => (
        <polyline key={k} points={y.map((v, i) => `${px(i)},${py(v)}`).join(' ')} fill="none" stroke="var(--muted)" strokeWidth={1.2} strokeOpacity={0.8} strokeDasharray={k === 1 ? '4 3' : ''} />
      ))}
      <polyline points={SEA_AVG.map((v, i) => `${px(i)},${py(v)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={3} />
      <line x1={26} x2={346} y1={176} y2={176} stroke="var(--border)" />
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map((m, i) => (
        <Tx key={m} x={px(i)} y={190} lines={[m]} s={M} />
      ))}
      <Tx x={186} y={204} lines={['Tháng trong năm']} s={M} />
      <line x1={30} x2={44} y1={16} y2={16} stroke="var(--accent)" strokeWidth={3} />
      <Tx x={48} y={20} lines={['Trung bình nhiều năm']} s={M} anchor="start" />
      <line x1={190} x2={204} y1={16} y2={16} stroke="var(--muted)" strokeWidth={1.2} />
      <Tx x={208} y={20} lines={['Từng năm (khác nhau)']} s={M} anchor="start" />
      <Tx x={180} y={224} lines={['Minh họa, không phải dữ liệu thật của mã nào']} s={M} />
    </Figure>
  );
}

function CorrScale() {
  return (
    <Figure w={360} h={168} title="Thang tương quan từ −1 đến +1" desc="Tương quan −1 là ngược hướng hoàn toàn, 0 là không liên quan, +1 là cùng hướng hoàn toàn. Ví dụ vàng và bạc thường có tương quan dương cao, khoảng +0,9 là minh họa.">
      <rect x={20} y={60} width={160} height={22} fill="var(--negative)" fillOpacity={0.3} />
      <rect x={180} y={60} width={160} height={22} fill="var(--positive)" fillOpacity={0.3} />
      <line x1={180} x2={180} y1={52} y2={90} stroke="var(--text)" />
      <Tx x={20} y={104} lines={['−1']} s={S} />
      <Tx x={180} y={104} lines={['0']} s={S} />
      <Tx x={340} y={104} lines={['+1']} s={S} />
      <Tx x={20} y={120} lines={['ngược hướng']} s={M} anchor="start" />
      <Tx x={180} y={120} lines={['không liên quan']} s={M} />
      <Tx x={340} y={120} lines={['cùng hướng']} s={M} anchor="end" />
      <path d="M 312 56 l -6 -12 h 12 z" fill="var(--positive)" />
      <Tx x={300} y={34} lines={['+0,9 (minh họa):', 'vàng – bạc thường cao']} s={T} />
      <Tx x={180} y={154} lines={['Tương quan đổi theo thời gian, thường tăng khi khủng hoảng']} s={M} />
    </Figure>
  );
}

function CorrRisk() {
  return (
    <Figure w={360} h={226} title="Hai vị thế tương quan cao = rủi ro chồng lên nhau" desc="Bên trái: hai vị thế độc lập, rủi ro có thể bù nhau. Bên phải: mua cả vàng và bạc với tương quan dương cao thì rủi ro gần như gấp đôi một vị thế.">
      <rect x={6} y={8} width={170} height={176} rx={8} fill="var(--accent)" fillOpacity={0.07} stroke="var(--accent)" />
      <Tx x={91} y={26} lines={['Độc lập (tương quan ≈ 0)']} s={S} />
      <rect x={34} y={120} width={40} height={40} fill="var(--accent)" fillOpacity={0.5} />
      <rect x={108} y={120} width={40} height={40} fill="var(--muted)" fillOpacity={0.5} />
      <Tx x={54} y={176} lines={['Mã A']} s={M} />
      <Tx x={128} y={176} lines={['Mã B']} s={M} />
      <Tx x={91} y={60} lines={['Có lúc bù trừ nhau', '→ rủi ro chung nhỏ hơn', 'tổng hai rủi ro']} s={T} />
      <rect x={184} y={8} width={170} height={176} rx={8} fill="var(--warning)" fillOpacity={0.08} stroke="var(--warning)" />
      <Tx x={269} y={26} lines={['Tương quan cao (≈ +0,9)']} s={S} />
      <rect x={236} y={120} width={40} height={40} fill="var(--accent)" fillOpacity={0.5} />
      <rect x={236} y={80} width={40} height={40} fill="var(--muted)" fillOpacity={0.5} />
      <Tx x={256} y={176} lines={['Vàng + bạc']} s={M} />
      <Tx x={318} y={118} lines={['≈ gấp đôi', '1 vị thế']} s={T} />
      <Tx x={180} y={208} lines={['Minh họa: nhiều vị thế “khác nhau” có thể là một rủi ro']} s={M} />
    </Figure>
  );
}

/* ---------- Level 5 ---------- */

function RiskSlice() {
  return (
    <Figure w={360} h={218} title="Ngân sách rủi ro: 1–2% vốn mỗi lệnh" desc="Thanh vốn 10.000 USD, lát nhỏ 2% bằng 200 USD và 1% bằng 100 USD là số tiền tối đa chấp nhận mất nếu nhận định sai. Số minh họa.">
      <Defs />
      <Tx x={20} y={22} lines={['Vốn 10.000 USD (minh họa)']} s={S} anchor="start" />
      <rect x={20} y={32} width={320} height={26} fill="var(--accent)" fillOpacity={0.3} stroke="var(--accent)" />
      <rect x={20} y={32} width={6.4} height={26} fill="var(--negative)" />
      <line x1={22} y1={60} x2={50} y2={100} stroke="var(--muted)" strokeDasharray="3 3" />
      <line x1={26} y1={60} x2={330} y2={100} stroke="var(--muted)" strokeDasharray="3 3" />
      <Tx x={20} y={96} lines={['Phóng to phần 2%:']} s={M} anchor="start" />
      <rect x={20} y={104} width={310} height={22} fill="var(--accent)" fillOpacity={0.15} stroke="var(--border)" />
      <rect x={20} y={104} width={31} height={22} fill="var(--negative)" fillOpacity={0.8} />
      <Tx x={56} y={119} lines={['2% = 200 USD']} s={T} anchor="start" />
      <rect x={20} y={134} width={310} height={22} fill="var(--accent)" fillOpacity={0.15} stroke="var(--border)" />
      <rect x={20} y={134} width={15.5} height={22} fill="var(--negative)" fillOpacity={0.8} />
      <Tx x={42} y={149} lines={['1% = 100 USD']} s={T} anchor="start" />
      <Tx x={180} y={182} lines={['Lát này = mức lỗ tối đa dự kiến nếu nhận định sai.', 'Tỷ lệ phù hợp do bạn tự quyết định.']} s={M} />
    </Figure>
  );
}

function SizeFlow() {
  return (
    <Figure w={360} h={316} title="Công thức khối lượng vị thế, từng bước" desc="Vốn 10.000 USD nhân 2% cho ngân sách rủi ro 200 USD. Stop cách 8 cent, mỗi cent ngô 50 USD nên rủi ro 400 USD mỗi hợp đồng. 200 chia 400 bằng 0,5, làm tròn xuống thành 0 hợp đồng nên không vào lệnh.">
      <Defs />
      <Bx x={30} y={8} w={300} h={44} lines={['1) Ngân sách rủi ro', '10.000 USD × 2% = 200 USD']} tone="a" />
      <Ar x1={180} y1={54} x2={180} y2={68} />
      <Bx x={30} y={70} w={300} h={44} lines={['2) Rủi ro mỗi hợp đồng (ngô ZC)', 'stop 8 cent × 50 USD/cent = 400 USD']} tone="a" />
      <Ar x1={180} y1={116} x2={180} y2={130} />
      <Bx x={30} y={132} w={300} h={44} lines={['3) Chia', '200 ÷ 400 = 0,5']} tone="a" />
      <Ar x1={180} y1={178} x2={180} y2={192} />
      <Bx x={30} y={194} w={300} h={44} lines={['4) Làm tròn XUỐNG', 'floor(0,5) = 0 hợp đồng']} tone="w" />
      <Ar x1={180} y1={240} x2={180} y2={254} />
      <Bx x={30} y={256} w={300} h={48} lines={['Kết luận: không vào lệnh', 'Không nới stop cho “vừa vặn” ngân sách']} tone="n" />
    </Figure>
  );
}

function StopLadder() {
  return (
    <Figure w={360} h={270} title="Cắt lỗ, chốt lời và tỷ lệ R:R 1:2 (ví dụ vị thế mua)" desc="Thang giá minh họa cho ngô: vào 450, stop 442 (rủi ro 8 cent = 400 USD, 1R), mục tiêu 466 (lãi 16 cent = 800 USD, 2R). Tỷ lệ rủi ro:lợi nhuận là 1:2. Không phải khuyến nghị.">
      <Defs />
      <line x1={150} x2={150} y1={20} y2={240} stroke="var(--border)" strokeWidth={2} />
      <rect x={140} y={44} width={20} height={80} fill="var(--positive)" fillOpacity={0.35} />
      <rect x={140} y={124} width={20} height={40} fill="var(--negative)" fillOpacity={0.35} />
      {[
        { y: 44, h: 'Mục tiêu', v: '466', s: '+16 cent = +800 USD = +2R', tone: 'p' as Tone },
        { y: 124, h: 'Vào lệnh', v: '450', s: 'giá tham chiếu (minh họa)', tone: 'a' as Tone },
        { y: 164, h: 'Stop', v: '442', s: '−8 cent = −400 USD = −1R', tone: 'n' as Tone },
      ].map((r) => (
        <g key={r.h}>
          <line x1={106} x2={200} y1={r.y} y2={r.y} stroke={C[r.tone]} strokeWidth={2} />
          <Tx x={100} y={r.y + 4} lines={[r.h]} s={{ ...S, fill: C[r.tone] }} anchor="end" />
          <Tx x={206} y={r.y - 2} lines={[r.v]} s={S} anchor="start" />
          <Tx x={206} y={r.y + 12} lines={[r.s]} s={M} anchor="start" />
        </g>
      ))}
      <Bx x={20} y={190} w={320} h={44} lines={['R:R = 8 : 16 = 1 : 2', 'Hoà vốn khi thắng ≈ 1/3 số lệnh (chưa tính phí)']} tone="w" lh={15} />
      <Tx x={180} y={256} lines={['Số minh họa ngô: 1 cent = 50 USD. Không phải khuyến nghị.']} s={M} />
    </Figure>
  );
}

function StopGap() {
  const px = (i: number) => 20 + i * 36;
  const py = (v: number) => 200 - (v - 430) * 4.4;
  const price = [452, 450, 449, 447, 445, 444, 443, 436, 435, 436];
  return (
    <Figure w={360} h={268} title="Gap và trượt giá: stop không bảo đảm mức lỗ" desc="Giá giảm dần tới mức stop 442 rồi nhảy qua (gap) và mở cửa phiên sau ở 436. Lỗ thực tế 14 cent bằng 700 USD, lớn hơn dự kiến 8 cent bằng 400 USD. Minh họa.">
      <line x1={14} x2={346} y1={py(442)} y2={py(442)} stroke="var(--negative)" strokeDasharray="5 3" strokeWidth={1.5} />
      <Tx x={346} y={py(442) - 5} lines={['Stop 442']} s={{ ...T, fill: 'var(--negative)' }} anchor="end" />
      <polyline points={price.slice(0, 7).map((v, i) => `${px(i)},${py(v)}`).join(' ')} fill="none" stroke="var(--text-strong)" strokeWidth={2.2} />
      <line x1={px(6)} y1={py(443)} x2={px(7)} y2={py(436)} stroke="var(--text-strong)" strokeWidth={2.2} strokeDasharray="2 3" />
      <polyline points={price.slice(7).map((v, i) => `${px(i + 7)},${py(v)}`).join(' ')} fill="none" stroke="var(--text-strong)" strokeWidth={2.2} />
      <circle cx={px(7)} cy={py(436)} r={5} fill="var(--negative)" />
      <Tx x={290} y={104} lines={['gap qua đêm /', 'tin lớn → khớp 436']} s={M} />
      <Tx x={22} y={py(452) - 8} lines={['Vào 450']} s={M} anchor="start" />
      <Bx x={8} y={210} w={170} h={46} lines={['Dự kiến: 8 cent', '= 400 USD']} tone="a" />
      <Bx x={184} y={210} w={168} h={46} lines={['Thực tế: 14 cent', '= 700 USD']} tone="n" />
    </Figure>
  );
}

const EQ_STOP = [100, 101, 103, 102, 104, 103, 106, 105, 108, 107, 110, 109, 112];
const EQ_NOSTOP = [100, 102, 105, 107, 109, 111, 113, 105, 92, 85, 88, 90, 84];
function EquityStops() {
  const px = (i: number) => 24 + i * 26;
  const py = (v: number) => 210 - (v - 70) * 3.2;
  return (
    <Figure w={360} h={262} title="Đường vốn: có kỷ luật stop và không có stop" desc="Hai đường vốn minh họa. Có stop: lỗ nhỏ và đều. Không stop: tăng nhanh lúc đầu nhưng một vài lệnh lỗ lớn kéo vốn xuống sâu. Không phải kết quả thật.">
      <line x1={20} x2={346} y1={py(100)} y2={py(100)} stroke="var(--border)" strokeDasharray="3 3" />
      <Tx x={346} y={py(100) - 4} lines={['vốn ban đầu = 100']} s={M} anchor="end" />
      <polyline points={EQ_STOP.map((v, i) => `${px(i)},${py(v)}`).join(' ')} fill="none" stroke="var(--positive)" strokeWidth={2.5} />
      <polyline points={EQ_NOSTOP.map((v, i) => `${px(i)},${py(v)}`).join(' ')} fill="none" stroke="var(--negative)" strokeWidth={2.5} />
      <Tx x={px(12)} y={py(112) - 8} lines={['có stop']} s={{ ...T, fill: 'var(--positive)' }} anchor="end" />
      <Tx x={px(9)} y={py(85) + 18} lines={['không stop: vài lệnh lỗ lớn']} s={{ ...T, fill: 'var(--negative)' }} />
      <Tx x={180} y={238} lines={['Thời gian →']} s={M} />
      <Tx x={180} y={254} lines={['Minh họa, không phải kết quả thật; stop vẫn không loại bỏ mọi rủi ro']} s={M} />
    </Figure>
  );
}

function JournalR() {
  const tr = [
    { n: '#1', r: -1 },
    { n: '#2', r: 2 },
    { n: '#3', r: -1 },
    { n: '#4', r: 1.5 },
  ];
  return (
    <Figure w={360} h={252} title="Đo kết quả bằng R-multiple" desc="R là rủi ro ban đầu của lệnh. Bốn lệnh minh họa: −1R, +2R, −1R, +1,5R, tổng +1,5R. Nếu R bằng 200 USD thì +1,5R tương đương 300 USD.">
      <line x1={110} x2={110} y1={14} y2={150} stroke="var(--border)" />
      {tr.map((t, i) => {
        const y = 22 + i * 32;
        return (
          <g key={t.n}>
            <Tx x={20} y={y + 15} lines={['Lệnh ' + t.n]} s={T} anchor="start" />
            <rect x={t.r >= 0 ? 110 : 110 + t.r * 40} y={y} width={Math.abs(t.r) * 40} height={22} fill={t.r >= 0 ? 'var(--positive)' : 'var(--negative)'} fillOpacity={0.55} />
            <Tx x={t.r >= 0 ? 110 + t.r * 40 + 6 : 110 + t.r * 40 - 6} y={y + 15} lines={[(t.r > 0 ? '+' : '−') + String(Math.abs(t.r)).replace('.', ',') + 'R']} s={S} anchor={t.r >= 0 ? 'start' : 'end'} />
          </g>
        );
      })}
      <Bx x={20} y={158} w={320} h={36} lines={['Tổng = −1 + 2 − 1 + 1,5 = +1,5R']} tone="p" s={S} />
      <Bx x={20} y={202} w={320} h={40} lines={['R = rủi ro ban đầu. Ví dụ R = 200 USD → +1,5R = 300 USD', 'So sánh được các lệnh khác kích cỡ']} tone="a" s={M} />
    </Figure>
  );
}

function JournalLoop() {
  return (
    <Figure w={360} h={192} title="Vòng lặp nhật ký giao dịch" desc="Ghi lý do, stop và rủi ro; ghi kết quả và cảm xúc; xem lại hằng tuần; rút ra điều chỉnh quy tắc rồi lặp lại.">
      <Defs />
      <Bx x={10} y={8} w={150} h={52} lines={['1) Ghi lệnh', 'lý do · stop · rủi ro (R)']} tone="a" />
      <Bx x={200} y={8} w={150} h={52} lines={['2) Ghi kết quả', 'bằng R + cảm xúc']} tone="a" />
      <Bx x={200} y={104} w={150} h={52} lines={['3) Xem lại hằng tuần', 'đúng kế hoạch hay phá?']} tone="w" />
      <Bx x={10} y={104} w={150} h={52} lines={['4) Rút ra điều chỉnh', 'may hay làm đúng?']} tone="p" />
      <Ar x1={162} y1={34} x2={198} y2={34} />
      <Ar x1={275} y1={62} x2={275} y2={102} />
      <Ar x1={198} y1={130} x2={162} y2={130} />
      <Ar x1={85} y1={102} x2={85} y2={62} />
      <Tx x={180} y={180} lines={['Mục tiêu: nhận ra mẫu hình sai lặp lại của chính bạn']} s={M} />
    </Figure>
  );
}

function RevengeLoop() {
  const nodes = [
    { x: 180, y: 34, t: ['Thua một lệnh'] },
    { x: 292, y: 100, t: ['Muốn “gỡ gạc”', 'ngay lập tức'] },
    { x: 250, y: 190, t: ['Tăng khối lượng,', 'dời/bỏ stop'] },
    { x: 110, y: 190, t: ['Rủi ro vượt', 'khả năng chịu'] },
    { x: 68, y: 100, t: ['Lỗ lớn hơn', 'gọi ký quỹ'] },
  ];
  return (
    <Figure w={360} h={258} title="Vòng xoáy “gỡ gạc” sau khi thua" desc="Thua lệnh dẫn đến cảm xúc muốn gỡ, tăng khối lượng hoặc dời stop, rủi ro vượt khả năng chịu, lỗ lớn hơn và lại muốn gỡ tiếp. Cách thoát: dừng lại và quay về kế hoạch.">
      <Defs />
      {nodes.map((n, i) => {
        const m = nodes[(i + 1) % nodes.length];
        const f = (a: number, b: number, t: number) => a + (b - a) * t;
        return <Ar key={i} x1={f(n.x, m.x, 0.36)} y1={f(n.y, m.y, 0.36)} x2={f(n.x, m.x, 0.64)} y2={f(n.y, m.y, 0.64)} />;
      })}
      {nodes.map((n, i) => (
        <Bx key={i} x={n.x - 52} y={n.y - 20} w={104} h={40} lines={n.t} tone={i === 0 ? 'n' : i === 4 ? 'w' : 'm'} />
      ))}
      <Tx x={180} y={110} lines={['Vòng xoáy', 'tự củng cố']} s={S} />
      <Bx x={40} y={226} w={280} h={28} lines={['Thoát: dừng lại, nghỉ, quay về kế hoạch và stop ban đầu']} tone="p" />
    </Figure>
  );
}

function DrawdownTable() {
  const rows = [10, 20, 30, 50, 75];
  const need = (d: number) => (1 / (1 - d / 100) - 1) * 100;
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
  return (
    <Figure w={360} h={270} title="Sụt giảm càng sâu, hồi phục càng khó" desc="Lỗ 10% cần lãi 11,1% để về hòa vốn; lỗ 20% cần 25%; lỗ 30% cần 42,9%; lỗ 50% cần 100%; lỗ 75% cần 300%. Công thức: cần hồi = 1 chia (1 trừ mức lỗ) trừ 1.">
      <Tx x={14} y={20} lines={['Mất']} s={M} anchor="start" />
      <Tx x={92} y={20} lines={['→ cần lãi bao nhiêu để về hòa vốn']} s={M} anchor="start" />
      {rows.map((d, i) => {
        const y = 32 + i * 34;
        const n = need(d);
        return (
          <g key={d}>
            <rect x={14} y={y} width={60} height={24} rx={4} fill="var(--negative)" fillOpacity={0.3} stroke="var(--negative)" />
            <Tx x={44} y={y + 16} lines={['−' + d + '%']} s={S} />
            <rect x={92} y={y} width={Math.max(n * 0.6, 3)} height={24} fill="var(--positive)" fillOpacity={0.5} />
            <Tx x={92 + n * 0.6 + 6} y={y + 16} lines={['+' + fmt(Math.round(n * 10) / 10) + '%']} s={S} anchor="start" />
          </g>
        );
      })}
      <Bx x={14} y={208} w={332} h={52} lines={['cần hồi = 1 ÷ (1 − mức lỗ) − 1', 'Ví dụ −50%: 1 ÷ 0,5 − 1 = 1 = +100%', 'Vì vậy bảo vệ vốn trước, rồi mới nghĩ đến lãi']} tone="w" s={M} />
    </Figure>
  );
}

function WhoPlayers() {
  const rows: { name: string; how: string; tag: string; tone: Tone }[] = [
    { name: 'Doanh nghiệp hàng thật (hedger)', how: 'Khoá giá bằng futures; lãi từ kinh doanh hàng thật', tag: 'phòng hộ', tone: 'a' },
    { name: 'Swap dealer', how: 'Tạo lập giao dịch hoán đổi cho khách', tag: 'trung gian', tone: 'm' },
    { name: 'Quỹ theo xu hướng (CTA)', how: 'Hệ thống quy tắc, vốn lớn, chi phí thấp, đa thị trường', tag: 'đầu cơ', tone: 'p' },
    { name: 'Nhà tạo lập thị trường', how: 'Kiếm chênh lệch mua–bán, khối lượng rất lớn', tag: 'tạo lập', tone: 'm' },
    { name: 'Nhà đầu tư cá nhân', how: 'Đòn bẩy, phí, trượt giá; nghiên cứu CFTC 2024: nhìn chung lỗ', tag: 'đầu cơ nhỏ', tone: 'w' },
  ];
  return (
    <Figure w={360} h={330} title="Ai là ai trên thị trường phái sinh hàng hoá" desc="Năm nhóm người chơi: doanh nghiệp hàng thật phòng hộ, swap dealer, quỹ CTA đầu cơ, nhà tạo lập thị trường và nhà đầu tư cá nhân. Mỗi nhóm có mục đích và lợi thế khác nhau.">
      {rows.map((r, i) => (
        <g key={r.name}>
          <rect x={6} y={8 + i * 64} width={348} height={58} rx={6} fill={C[r.tone]} fillOpacity={0.1} stroke={C[r.tone]} />
          <Tx x={14} y={26 + i * 64} lines={[r.name]} s={{ ...T, fontWeight: 600 }} anchor="start" />
          <Tx x={346} y={26 + i * 64} lines={[r.tag]} s={{ ...M, fill: C[r.tone] }} anchor="end" />
          <foreignObject x={10} y={32 + i * 64} width={340} height={32}>
            <div style={{ fontSize: 10, lineHeight: '13px', color: 'var(--muted)' }}>{r.how}</div>
          </foreignObject>
        </g>
      ))}
    </Figure>
  );
}

function HedgeVsSpec() {
  return (
    <Figure w={360} h={286} title="Cùng một hợp đồng, hai mục đích" desc="Nhà rang xay cà phê mua trước một hợp đồng robusta để khoá chi phí: nếu giá giảm, futures lỗ nhưng hàng thật mua rẻ hơn bù lại. Người đầu cơ không có hàng bù, mọi biến động đi thẳng vào tài khoản. Minh họa khái niệm, không có số liệu.">
      <Defs />
      <Tx x={180} y={20} lines={['Giả sử giá robusta GIẢM (minh họa khái niệm)']} s={S} />
      <rect x={6} y={30} width={170} height={206} rx={8} fill="var(--accent)" fillOpacity={0.07} stroke="var(--accent)" />
      <Tx x={91} y={50} lines={['Nhà rang xay (phòng hộ)']} s={S} />
      <Bx x={16} y={62} w={150} h={46} lines={['Futures: LỖ', 'trên giấy']} tone="n" />
      <Bx x={16} y={122} w={150} h={46} lines={['Hàng thật: mua', 'RẺ hơn → bù lại']} tone="p" />
      <Ar x1={91} y1={110} x2={91} y2={120} />
      <Bx x={16} y={180} w={150} h={46} lines={['Kết quả: chi phí', 'đầu vào được khoá']} tone="a" />
      <rect x={184} y={30} width={170} height={206} rx={8} fill="var(--warning)" fillOpacity={0.08} stroke="var(--warning)" />
      <Tx x={269} y={50} lines={['Người đầu cơ cá nhân']} s={S} />
      <Bx x={194} y={62} w={150} h={46} lines={['Futures (mua): LỖ', 'đi thẳng vào tài khoản']} tone="n" />
      <Bx x={194} y={122} w={150} h={46} lines={['KHÔNG có hàng thật', 'để bù lại']} tone="w" />
      <Ar x1={269} y1={110} x2={269} y2={120} />
      <Bx x={194} y={180} w={150} h={46} lines={['Kết quả: chịu trọn', 'rủi ro biến động']} tone="n" />
      <Tx x={180} y={256} lines={['Người phòng hộ không đánh giá thành công theo lãi/lỗ futures.', 'Chiến lược nào cũng không bảo đảm lợi nhuận.']} s={M} />
    </Figure>
  );
}

function ScamFlags() {
  const flags = [
    'Hứa lợi nhuận cố định hoặc “chắc chắn”',
    'Yêu cầu chuyển tiền vào tài khoản cá nhân',
    'Ép nạp thêm tiền',
    '“Thầy” gợi ý lệnh qua nhóm kín',
    'Phần mềm lạ, không thuộc thành viên MXV',
    'Không rút được tiền',
  ];
  return (
    <Figure w={360} h={290} title="Dấu hiệu cảnh báo lừa đảo / “sàn ma”" desc="Sáu dấu hiệu đáng ngờ: hứa lợi nhuận cố định, chuyển tiền vào tài khoản cá nhân, ép nạp thêm, thầy gợi ý lệnh qua nhóm kín, phần mềm lạ, không rút được tiền.">
      {flags.map((f, i) => (
        <g key={f}>
          <rect x={8} y={8 + i * 44} width={344} height={38} rx={6} fill="var(--warning)" fillOpacity={0.1} stroke="var(--warning)" />
          <path d={`M 28 ${34 + i * 44} l 12 -22 l 12 22 z`} fill="var(--warning)" fillOpacity={0.35} stroke="var(--warning)" strokeWidth={1.5} />
          <text x={40} y={32 + i * 44} textAnchor="middle" {...S}>!</text>
          <Tx x={66} y={32 + i * 44} lines={[f]} s={T} anchor="start" />
        </g>
      ))}
      <Tx x={180} y={282} lines={['Gặp một dấu hiệu: dừng chuyển tiền']} s={{ ...M, fill: 'var(--warning)' }} />
    </Figure>
  );
}

function ScamVerify() {
  return (
    <Figure w={360} h={238} title="Kiểm tra trước khi chuyển tiền" desc="Ba bước: tự đối chiếu tên công ty trên website mxv.com.vn; nếu nghi ngờ thì dừng chuyển tiền và lưu bằng chứng; hỏi trực tiếp MXV hoặc cơ quan chức năng.">
      <Defs />
      <Bx x={20} y={8} w={320} h={50} lines={['1) Tự đối chiếu tên công ty trên mxv.com.vn', '(không tin lời giới thiệu)']} tone="a" />
      <Ar x1={180} y1={60} x2={180} y2={76} />
      <Bx x={20} y={78} w={320} h={50} lines={['2) Nghi ngờ? DỪNG chuyển tiền', 'lưu tin nhắn, giao dịch, bằng chứng']} tone="w" />
      <Ar x1={180} y1={130} x2={180} y2={146} />
      <Bx x={20} y={148} w={320} h={50} lines={['3) Hỏi trực tiếp MXV', 'hoặc cơ quan chức năng']} tone="p" />
      <Tx x={180} y={220} lines={['Ứng dụng này không đặt lệnh và không phải môi giới']} s={M} />
    </Figure>
  );
}

/* ---------- Level 6 ---------- */

function DataLabels() {
  const rows: { chip: string; act: string[]; tone: Tone }[] = [
    { chip: 'Giá trễ ~15 phút', act: ['Dùng để học, nghiên cứu xu hướng dài hạn;', 'không dùng canh giá khớp chính xác'], tone: 'a' },
    { chip: 'Giá cũ', act: ['Dữ liệu quá hạn so với kỳ vọng →', 'DỪNG và kiểm tra lại'], tone: 'w' },
    { chip: 'Nguồn không chính thức', act: ['Không phải dữ liệu của sàn →', 'đừng dựa vào một mức giá cụ thể'], tone: 'w' },
    { chip: 'Cập nhật lâu bất thường', act: ['Thời điểm cập nhật quá xa →', 'DỪNG và kiểm tra lại'], tone: 'w' },
  ];
  return (
    <Figure w={360} h={300} title="Nhãn dữ liệu và cách phản ứng" desc="Bốn nhãn dữ liệu: giá trễ khoảng 15 phút dùng để học, giá cũ, nguồn không chính thức và cập nhật lâu bất thường đều là lúc dừng và kiểm tra lại. Quyết định tiền thật phải đối chiếu nền tảng của thành viên MXV.">
      {rows.map((r, i) => (
        <g key={r.chip}>
          <rect x={8} y={8 + i * 62} width={344} height={56} rx={6} fill={C[r.tone]} fillOpacity={0.08} stroke={C[r.tone]} />
          <rect x={16} y={18 + i * 62} width={130} height={34} rx={17} fill={C[r.tone]} fillOpacity={0.2} stroke={C[r.tone]} />
          <foreignObject x={22} y={19 + i * 62} width={120} height={32}>
            <div style={{ fontSize: 11, lineHeight: '13px', color: 'var(--text-strong)', fontWeight: 600, textAlign: 'center', height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.chip}</div>
          </foreignObject>
          <Tx x={156} y={32 + i * 62} lines={r.act} s={T} anchor="start" />
        </g>
      ))}
      <Tx x={180} y={286} lines={['Tiền thật: đối chiếu bảng giá của công ty môi giới (thành viên MXV)']} s={M} />
    </Figure>
  );
}

const TRUE_P = [50, 50, 51, 50, 51, 52, 51, 52, 58, 68, 76, 80, 79, 80, 79];
function DelayGap() {
  const px = (i: number) => 18 + i * 22.5;
  const py = (v: number) => 180 - (v - 45) * 3.6;
  const lag = 3;
  const delayed = TRUE_P.map((_, i) => TRUE_P[Math.max(0, i - lag)]);
  return (
    <Figure w={360} h={252} title="Giá trễ có thể cách xa giá thực lúc có báo cáo" desc="Đường giá thực và đường giá hiển thị bị trễ vài nhịp. Khi có báo cáo lớn làm giá nhảy nhanh, khoảng cách giữa hai đường tăng mạnh. Hình minh họa.">
      <polyline points={TRUE_P.map((v, i) => `${px(i)},${py(v)}`).join(' ')} fill="none" stroke="var(--text-strong)" strokeWidth={2.4} />
      <polyline points={delayed.map((v, i) => `${px(i)},${py(v)}`).join(' ')} fill="none" stroke="var(--warning)" strokeWidth={2.4} strokeDasharray="5 3" />
      <line x1={px(10)} x2={px(10)} y1={py(76)} y2={py(delayed[10])} stroke="var(--muted)" markerStart="url(#bm-arr)" markerEnd="url(#bm-arr)" />
      <Defs />
      <Tx x={140} y={py(72)} lines={['khoảng cách lớn', 'lúc có báo cáo →']} s={T} />
      <line x1={18} x2={36} y1={206} y2={206} stroke="var(--text-strong)" strokeWidth={2.4} />
      <Tx x={40} y={210} lines={['Giá thực']} s={M} anchor="start" />
      <line x1={110} x2={128} y1={206} y2={206} stroke="var(--warning)" strokeWidth={2.4} strokeDasharray="5 3" />
      <Tx x={132} y={210} lines={['Giá trễ ~15 phút (hiển thị)']} s={M} anchor="start" />
      <Tx x={180} y={236} lines={['Minh họa, không phải dữ liệu thật']} s={M} />
    </Figure>
  );
}

function IndicatorMap() {
  const rows: [string, string, string][] = [
    ['MA (xu hướng)', 'Hướng giá trung bình', 'Khi nào xu hướng kết thúc'],
    ['RSI (động lượng)', 'Tốc độ tăng/giảm gần đây', 'Giá còn đi tiếp hay không'],
    ['ATR / percentile', 'Biên độ, biến động', 'Hướng giá'],
    ['Sụt từ đỉnh 52 tuần', 'Giá thấp hơn đỉnh bao nhiêu %', 'Đáy đã xong chưa'],
    ['Percentile / z-score', 'Giá cao/thấp so với lịch sử', 'Có đảo chiều không'],
    ['COT index', 'Độ nghiêng vị thế', 'Thời điểm (còn trễ)'],
    ['Mùa vụ', 'Hành vi trung bình theo mùa', 'Năm nay có giống không'],
    ['Cấu trúc kỳ hạn', 'Cung–cầu, chi phí roll', 'Dự báo giá'],
  ];
  return (
    <Figure w={360} h={322} title="Mỗi chỉ số trả lời một câu hỏi, bỏ ngỏ nhiều câu khác" desc="Bảng tám chỉ số: chỉ số đo gì và điều nó không cho biết. Ví dụ MA đo hướng trung bình nhưng không cho biết khi nào xu hướng kết thúc.">
      <Tx x={56} y={16} lines={['Chỉ số']} s={{ ...S, fill: 'var(--accent)' }} anchor="middle" />
      <Tx x={166} y={16} lines={['ĐO']} s={{ ...S, fill: 'var(--positive)' }} anchor="middle" />
      <Tx x={300} y={16} lines={['KHÔNG cho biết']} s={{ ...S, fill: 'var(--negative)' }} anchor="middle" />
      {rows.map((r, i) => (
        <g key={r[0]}>
          <rect x={6} y={24 + i * 36} width={348} height={34} rx={4} fill="var(--surface)" stroke="var(--border)" />
          <foreignObject x={12} y={26 + i * 36} width={90} height={30}>
            <div style={{ fontSize: 10, lineHeight: '12px', color: 'var(--text-strong)', fontWeight: 600, display: 'flex', alignItems: 'center', height: 30 }}>{r[0]}</div>
          </foreignObject>
          <foreignObject x={108} y={26 + i * 36} width={118} height={30}>
            <div style={{ fontSize: 10, lineHeight: '12px', color: 'var(--text)', display: 'flex', alignItems: 'center', height: 30 }}>{r[1]}</div>
          </foreignObject>
          <foreignObject x={236} y={26 + i * 36} width={116} height={30}>
            <div style={{ fontSize: 10, lineHeight: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', height: 30 }}>{r[2]}</div>
          </foreignObject>
        </g>
      ))}
    </Figure>
  );
}

function Consensus() {
  const Chip = ({ x, y, up, t }: { x: number; y: number; up: boolean | null; t: string }) => (
    <g>
      <rect x={x} y={y} width={62} height={30} rx={15} fill={up === null ? C.w : up ? C.p : C.n} fillOpacity={0.2} stroke={up === null ? C.w : up ? C.p : C.n} />
      <text x={x + 31} y={y + 19} textAnchor="middle" {...T}>{t} {up === null ? '●' : up ? '▲' : '▼'}</text>
    </g>
  );
  return (
    <Figure w={360} h={236} title="Đồng thuận và mâu thuẫn giữa các chỉ số" desc="Khi nhiều chỉ số cùng chỉ một hướng thì bức tranh rõ hơn nhưng vẫn không chắc chắn; khi mâu thuẫn thì cần ghi lại cách bạn diễn giải. Hình minh họa.">
      <rect x={6} y={8} width={348} height={92} rx={8} fill="var(--positive)" fillOpacity={0.07} stroke="var(--positive)" />
      <Tx x={14} y={26} lines={['Đồng thuận (minh họa)']} s={S} anchor="start" />
      <Chip x={20} y={38} up={true} t="MA" />
      <Chip x={92} y={38} up={true} t="RSI" />
      <Chip x={164} y={38} up={true} t="COT" />
      <Tx x={300} y={50} lines={['Bức tranh rõ hơn,', 'vẫn không chắc chắn']} s={M} />
      <Tx x={14} y={92} lines={['Nhiều chỉ số cùng hướng → nhưng đều là thống kê']} s={M} anchor="start" />
      <rect x={6} y={110} width={348} height={92} rx={8} fill="var(--warning)" fillOpacity={0.08} stroke="var(--warning)" />
      <Tx x={14} y={128} lines={['Mâu thuẫn (minh họa)']} s={S} anchor="start" />
      <Chip x={20} y={140} up={true} t="MA" />
      <Chip x={92} y={140} up={false} t="RSI" />
      <Chip x={164} y={140} up={null} t="COT" />
      <Tx x={300} y={152} lines={['Ghi lại bạn', 'diễn giải thế nào']} s={M} />
      <Tx x={14} y={194} lines={['Mâu thuẫn là thông tin: chưa đủ cơ sở để chắc chắn']} s={M} anchor="start" />
      <Tx x={180} y={224} lines={['Không chỉ báo nào đứng một mình']} s={{ ...T, fill: 'var(--accent)' }} />
    </Figure>
  );
}

function SevenSteps() {
  const steps = [
    'Kiểm tra chất lượng dữ liệu',
    'Bối cảnh cơ bản (hồ sơ, WASDE/EIA/COT)',
    'Xu hướng và động lượng (MA, RSI)',
    'Biến động và rủi ro quy ra tiền (ATR)',
    'Vị thế lớn (COT) và mùa vụ',
    'Kịch bản sai + % rủi ro + khối lượng',
    'Ghi sổ nghiên cứu và xem lại sau',
  ];
  return (
    <Figure w={360} h={344} title="Quy trình 7 bước nghiên cứu một mã" desc="Bảy bước: dữ liệu, cơ bản, xu hướng và động lượng, biến động và rủi ro, COT và mùa vụ, kịch bản sai và khối lượng, ghi sổ và xem lại. Bước 6 và 7 hay bị bỏ qua nhất.">
      {steps.map((s, i) => {
        const key = i >= 5;
        const c = key ? C.w : C.a;
        return (
          <g key={s}>
            <rect x={8} y={8 + i * 45} width={344} height={38} rx={6} fill={c} fillOpacity={0.1} stroke={c} />
            <circle cx={30} cy={27 + i * 45} r={11} fill={c} fillOpacity={0.3} stroke={c} />
            <text x={30} y={31 + i * 45} textAnchor="middle" {...S}>{i + 1}</text>
            <Tx x={52} y={31 + i * 45} lines={[s]} s={T} anchor="start" />
            {i < 6 && <path d={`M 180 ${46 + i * 45} v 7`} stroke="var(--muted)" strokeWidth={1.5} />}
          </g>
        );
      })}
      <Tx x={180} y={336} lines={['Bước 6–7 (viền vàng) là phần nhiều người bỏ qua nhất']} s={M} />
    </Figure>
  );
}

function ZcIndicators() {
  const y = (v: number) => 190 - (v - 430) * 4.4;
  const lv = [
    { v: 458, t: 'MA50 = 458', tone: 'm' as Tone },
    { v: 450, t: 'Giá = 450', tone: 'a' as Tone },
    { v: 440, t: 'MA200 = 440', tone: 'm' as Tone },
  ];
  return (
    <Figure w={360} h={258} title="Bước 3: giá ngô so với MA50 và MA200 (giả định)" desc="Giả định giá 450 cent, dưới MA50 là 458 và trên MA200 là 440, RSI 44. Tín hiệu hỗn hợp: dài hạn còn tăng, ngắn hạn yếu.">
      <line x1={150} x2={150} y1={20} y2={200} stroke="var(--border)" strokeWidth={2} />
      {lv.map((l) => (
        <g key={l.t}>
          <line x1={120} x2={180} y1={y(l.v)} y2={y(l.v)} stroke={C[l.tone]} strokeWidth={l.tone === 'a' ? 3 : 2} strokeDasharray={l.tone === 'm' ? '5 3' : ''} />
          <Tx x={114} y={y(l.v) + 4} lines={[l.t]} s={{ ...T, fill: C[l.tone] }} anchor="end" />
        </g>
      ))}
      <Tx x={188} y={(y(458) + y(450)) / 2 + 4} lines={['dưới MA50:', 'ngắn hạn yếu']} s={{ ...T, fill: 'var(--negative)' }} anchor="start" />
      <Tx x={188} y={(y(450) + y(440)) / 2 + 4} lines={['trên MA200:', 'dài hạn còn tăng']} s={{ ...T, fill: 'var(--positive)' }} anchor="start" />
      <Bx x={20} y={206} w={150} h={42} lines={['RSI 44', 'động lượng hơi yếu']} tone="m" />
      <Bx x={188} y={206} w={152} h={42} lines={['Tín hiệu HỖN HỢP', 'không phải “nên mua/bán”']} tone="w" />
    </Figure>
  );
}

function ZcRisk() {
  return (
    <Figure w={360} h={332} title="Bước 6: từ kịch bản sai ra khối lượng (ví dụ giả định, ngô)" desc="Nếu giá đóng cửa dưới 438 thì nhận định sai: khoảng cách 12 cent bằng 48 tick bằng 600 USD mỗi hợp đồng. Vốn 30.000 USD rủi ro 2% là 600 USD, nên tối đa 1 hợp đồng. Đây là cách đổi nhận định thành con số rủi ro, không phải khuyến nghị.">
      <Defs />
      <Bx x={20} y={8} w={320} h={44} lines={['Kịch bản sai: đóng cửa dưới 438', 'giá tham chiếu 450 → cách 12 cent (= 1,5 × ATR 8)']} tone="a" />
      <Ar x1={180} y1={54} x2={180} y2={68} />
      <Bx x={20} y={70} w={320} h={44} lines={['12 cent ÷ 0,25 = 48 tick', '48 tick × 12,5 USD = 600 USD / hợp đồng']} tone="a" />
      <Ar x1={180} y1={116} x2={180} y2={130} />
      <Bx x={20} y={132} w={320} h={44} lines={['Ngân sách rủi ro', '30.000 USD × 2% = 600 USD']} tone="a" />
      <Ar x1={180} y1={178} x2={180} y2={192} />
      <Bx x={20} y={194} w={320} h={44} lines={['600 ÷ 600 = 1', 'tối đa 1 hợp đồng']} tone="p" />
      <Ar x1={180} y1={240} x2={180} y2={254} />
      <Bx x={20} y={256} w={320} h={50} lines={['Bước 7: ghi lý do, kịch bản sai, mức rủi ro vào sổ', 'rồi xem lại — kể cả khi quyết định không làm gì']} tone="w" />
      <Tx x={180} y={324} lines={['Số giả định. Ví dụ không phải khuyến nghị mua/bán.']} s={M} />
    </Figure>
  );
}

export const FIGURES_B: FigureMap = {
  'b-fund-balance': () => <FundBalance />,
  'b-fund-chain': () => <FundChain />,
  'b-ma-cross': () => <MaCross />,
  'b-rsi-band': () => <RsiBand />,
  'b-atr-range': () => <AtrRange />,
  'b-curve-roll': () => <CurveRoll />,
  'b-curve-why': () => <CurveWhy />,
  'b-cot-groups': () => <CotGroups />,
  'b-cot-timeline': () => <CotTimeline />,
  'b-season-sketch': () => <SeasonSketch />,
  'b-corr-scale': () => <CorrScale />,
  'b-corr-risk': () => <CorrRisk />,
  'b-risk-slice': () => <RiskSlice />,
  'b-size-flow': () => <SizeFlow />,
  'b-stop-ladder': () => <StopLadder />,
  'b-stop-gap': () => <StopGap />,
  'b-equity-stops': () => <EquityStops />,
  'b-journal-r': () => <JournalR />,
  'b-journal-loop': () => <JournalLoop />,
  'b-revenge-loop': () => <RevengeLoop />,
  'b-drawdown-table': () => <DrawdownTable />,
  'b-who-players': () => <WhoPlayers />,
  'b-hedge-vs-spec': () => <HedgeVsSpec />,
  'b-scam-flags': () => <ScamFlags />,
  'b-scam-verify': () => <ScamVerify />,
  'b-data-labels': () => <DataLabels />,
  'b-delay-gap': () => <DelayGap />,
  'b-indicator-map': () => <IndicatorMap />,
  'b-consensus': () => <Consensus />,
  'b-seven-steps': () => <SevenSteps />,
  'b-zc-indicators': () => <ZcIndicators />,
  'b-zc-risk': () => <ZcRisk />,
};
