import type { ReactNode } from 'react';
import type { DiagramId } from './ids';

/* Inline SVG, theme tokens only. Blue (--positive) = up, apricot (--negative) = down. */
const T = { fontSize: 11, fill: 'var(--text)' } as const;
const M = { fontSize: 10, fill: 'var(--muted)' } as const;

function Frame({ title, desc, h = 220, children }: { title: string; desc: string; h?: number; children: ReactNode }) {
  return (
    <figure className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 m-0">
      <svg viewBox={`0 0 360 ${h}`} role="img" className="w-full h-auto" style={{ maxHeight: 340 }} fontFamily="inherit">
        <title>{title}</title>
        <desc>{desc}</desc>
        {children}
      </svg>
      <figcaption className="text-[11px] text-[var(--muted)] px-1 pt-1">{title}</figcaption>
    </figure>
  );
}

const Arrow = () => (
  <defs>
    <marker id="dg-arr" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0 0 L8 4 L0 8 z" fill="var(--muted)" />
    </marker>
  </defs>
);

function Candle({ x, o, c, hi, lo, up }: { x: number; o: number; c: number; hi: number; lo: number; up: boolean }) {
  const col = up ? 'var(--positive)' : 'var(--negative)';
  return (
    <g>
      <line x1={x} x2={x} y1={hi} y2={lo} stroke={col} strokeWidth={2} />
      <rect x={x - 10} y={Math.min(o, c)} width={20} height={Math.max(Math.abs(o - c), 2)} fill={col} fillOpacity={up ? 0.35 : 0.9} stroke={col} strokeWidth={2} />
    </g>
  );
}

function CandleDiagram() {
  return (
    <Frame title="Giải phẫu nến" desc="Nến tăng màu xanh dương: mở thấp, đóng cao. Nến giảm màu cam: mở cao, đóng thấp. Thân nến là khoảng mở-đóng, bóng là đỉnh và đáy trong phiên.">
      <Candle x={90} o={150} c={80} hi={55} lo={175} up />
      <Candle x={250} o={80} c={150} hi={55} lo={175} up={false} />
      <text x={90} y={22} textAnchor="middle" {...T} fontWeight={600}>Nến tăng</text>
      <text x={250} y={22} textAnchor="middle" {...T} fontWeight={600}>Nến giảm</text>
      <text x={72} y={84} textAnchor="end" {...M}>Đóng</text>
      <text x={72} y={154} textAnchor="end" {...M}>Mở</text>
      <text x={232} y={84} textAnchor="end" {...M}>Mở</text>
      <text x={232} y={154} textAnchor="end" {...M}>Đóng</text>
      <text x={112} y={66} {...M}>Bóng trên (đỉnh)</text>
      <text x={112} y={118} {...T}>Thân</text>
      <text x={112} y={172} {...M}>Bóng dưới (đáy)</text>
      <text x={272} y={66} {...M}>Đỉnh</text>
      <text x={272} y={118} {...T}>Thân</text>
      <text x={272} y={172} {...M}>Đáy</text>
      <text x={180} y={205} textAnchor="middle" {...M}>Thân dài = phe thắng rõ; bóng dài = giá bị đẩy lùi</text>
    </Frame>
  );
}

function MarginDiagram() {
  const bx = 80, bw = 60, top = 30, bot = 200;
  const y = (v: number) => bot - (v / 100) * (bot - top);
  return (
    <Frame title="Ký quỹ và gọi ký quỹ" desc="Thanh số dư tài khoản. Ký quỹ ban đầu ở 100. Mức duy trì ở 75. Khi lỗ làm số dư tụt xuống dưới mức duy trì thì bị gọi ký quỹ phải nạp thêm về mức ban đầu." h={230}>
      <Arrow />
      <rect x={bx} y={y(75)} width={bw} height={y(0) - y(75)} fill="var(--negative)" fillOpacity={0.3} />
      <rect x={bx} y={y(100)} width={bw} height={y(75) - y(100)} fill="var(--positive)" fillOpacity={0.25} />
      <rect x={bx} y={top} width={bw} height={bot - top} fill="none" stroke="var(--border)" strokeWidth={1.5} />
      <line x1={bx - 8} x2={bx + bw + 150} y1={y(100)} y2={y(100)} stroke="var(--positive)" strokeWidth={2} />
      <line x1={bx - 8} x2={bx + bw + 150} y1={y(75)} y2={y(75)} stroke="var(--warning)" strokeWidth={2} strokeDasharray="5 3" />
      <text x={bx + bw + 8} y={y(100) - 5} {...T}>Ký quỹ ban đầu</text>
      <text x={bx + bw + 8} y={y(75) - 5} {...T}>Mức duy trì</text>
      <text x={bx + bw + 8} y={y(93)} {...M}>vùng an toàn</text>
      <text x={bx + bw + 8} y={y(40)} {...T} fontWeight={600} fill="var(--negative)">Vùng gọi ký quỹ</text>
      <text x={bx + bw + 8} y={y(40) + 14} {...M}>phải nạp thêm tiền</text>
      <line x1={bx - 22} x2={bx - 22} y1={y(98)} y2={y(60)} stroke="var(--muted)" strokeWidth={1.5} markerEnd="url(#dg-arr)" />
      <text x={bx - 28} y={y(85)} textAnchor="end" {...M}>Lỗ làm</text>
      <text x={bx - 28} y={y(85) + 12} textAnchor="end" {...M}>số dư tụt</text>
    </Frame>
  );
}

function HedgeDiagram() {
  return (
    <Frame title="Phòng hộ bán trước khoá giá" desc="Hàng thật mất giá khi giá giảm (đường cam đi xuống). Vị thế bán hợp đồng tương lai lãi bù lại (đường xanh đi lên). Tổng hai đường gần như nằm ngang: giá được khoá." h={230}>
      <text x={200} y={16} textAnchor="middle" {...M}>Giá thị trường giảm dần →</text>
      <line x1={40} x2={340} y1={110} y2={110} stroke="var(--border)" strokeDasharray="3 3" />
      <polyline points="40,60 340,160" fill="none" stroke="var(--negative)" strokeWidth={2.5} />
      <polyline points="40,160 340,60" fill="none" stroke="var(--positive)" strokeWidth={2.5} />
      <line x1={40} x2={340} y1={110} y2={110} stroke="var(--accent)" strokeWidth={3.5} />
      <text x={44} y={52} {...T} fill="var(--negative)">Hàng thật: lỗ dần</text>
      <text x={44} y={178} {...T} fill="var(--positive)">Short HĐTL: lãi dần</text>
      <text x={44} y={90} {...T} fontWeight={600} fill="var(--accent-text)">Tổng ≈ 0:</text>
      <text x={44} y={102} {...T} fontWeight={600} fill="var(--accent-text)">giá bị khoá</text>
      <text x={180} y={210} textAnchor="middle" {...M}>Đổi lại: mất cơ hội hưởng nếu giá tăng</text>
    </Frame>
  );
}

function CurveDiagram() {
  return (
    <Frame title="Contango và backwardation" desc="Hai đường cong kỳ hạn. Contango: giá các tháng xa cao dần so với tháng gần. Backwardation: giá tháng xa thấp dần so với tháng gần." h={230}>
      <line x1={40} x2={40} y1={25} y2={190} stroke="var(--border)" />
      <line x1={40} x2={340} y1={190} y2={190} stroke="var(--border)" />
      <text x={46} y={22} {...M}>Giá</text>
      <text x={190} y={212} textAnchor="middle" {...M}>Tháng đáo hạn: gần → xa</text>
      <path d="M50 150 Q150 140 330 60" fill="none" stroke="var(--positive)" strokeWidth={2.5} />
      <path d="M50 60 Q150 100 330 150" fill="none" stroke="var(--negative)" strokeWidth={2.5} />
      <text x={330} y={48} textAnchor="end" {...T} fill="var(--positive)">Contango: xa đắt hơn</text>
      <text x={330} y={170} textAnchor="end" {...T} fill="var(--negative)">Backwardation: xa rẻ hơn</text>
      <text x={52} y={172} {...M}>dư cung, phí lưu kho</text>
      <text x={52} y={48} {...M}>khan hàng gần hạn</text>
    </Frame>
  );
}

function DowDiagram() {
  const pts: [number, number][] = [[40, 170], [90, 120], [130, 145], [190, 90], [230, 115], [290, 50]];
  return (
    <Frame title="Xu hướng tăng theo Dow" desc="Đường giá đi lên với các đỉnh cao dần (HH) và đáy cao dần (HL). Xu hướng tăng còn nguyên khi đáy sau cao hơn đáy trước." h={220}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--positive)" strokeWidth={2.5} strokeLinejoin="round" />
      <line x1={130} x2={230} y1={145} y2={145} stroke="var(--muted)" strokeDasharray="3 3" />
      <line x1={90} x2={190} y1={120} y2={120} stroke="var(--muted)" strokeDasharray="3 3" />
      {([[90, 120, 'Đỉnh'], [190, 90, 'HH'], [290, 50, 'HH']] as const).map(([x, y, t]) => (
        <g key={x}>
          <circle cx={x} cy={y} r={4} fill="var(--positive)" />
          <text x={x} y={y - 9} textAnchor="middle" {...T} fontWeight={600}>{t}</text>
        </g>
      ))}
      {([[130, 145, 'Đáy'], [230, 115, 'HL']] as const).map(([x, y, t]) => (
        <g key={x}>
          <circle cx={x} cy={y} r={4} fill="var(--warning)" />
          <text x={x} y={y + 18} textAnchor="middle" {...T} fontWeight={600}>{t}</text>
        </g>
      ))}
      <text x={180} y={206} textAnchor="middle" {...M}>HH = đỉnh cao hơn · HL = đáy cao hơn</text>
    </Frame>
  );
}

function SrFlipDiagram() {
  return (
    <Frame title="Kháng cự đổi vai thành hỗ trợ" desc="Giá nhiều lần bị chặn ở vùng kháng cự, sau đó phá vỡ lên trên, quay lại thử vùng cũ và vùng này trở thành hỗ trợ." h={220}>
      <rect x={40} y={85} width={300} height={22} fill="var(--accent)" fillOpacity={0.18} />
      <line x1={40} x2={340} y1={96} y2={96} stroke="var(--accent)" strokeDasharray="4 3" />
      <polyline points="40,150 80,100 100,130 140,100 160,135 200,60 240,60 265,94 300,40 335,30" fill="none" stroke="var(--positive)" strokeWidth={2.5} strokeLinejoin="round" />
      <text x={90} y={78} textAnchor="middle" {...T} fill="var(--negative)">Kháng cự</text>
      <text x={105} y={160} textAnchor="middle" {...M}>bị chặn 2 lần</text>
      <text x={215} y={50} textAnchor="middle" {...T} fontWeight={600}>Phá vỡ</text>
      <circle cx={265} cy={94} r={4} fill="var(--warning)" />
      <text x={265} y={128} textAnchor="middle" {...T} fill="var(--accent-text)" fontWeight={600}>Thành hỗ trợ</text>
      <text x={265} y={141} textAnchor="middle" {...M}>thử lại rồi bật lên</text>
      <text x={180} y={205} textAnchor="middle" {...M}>Vùng giá cũ đổi vai: kháng cự → hỗ trợ</text>
    </Frame>
  );
}

function PinbarDiagram() {
  const yEntry = 120, yStop = 160, yTgt = 120 - 40 * 2;
  return (
    <Frame title="Nến rút chân tại hỗ trợ" desc="Nến rút chân có bóng dưới dài chạm vùng hỗ trợ. Vào lệnh mua trên đỉnh nến, đặt dừng lỗ dưới đáy bóng, mục tiêu gấp đôi khoảng rủi ro, tỷ lệ 1 trên 2." h={230}>
      <rect x={40} y={146} width={300} height={16} fill="var(--accent)" fillOpacity={0.18} />
      <text x={44} y={178} {...M}>Vùng hỗ trợ</text>
      <polyline points="40,40 80,60 120,85 150,110" fill="none" stroke="var(--negative)" strokeWidth={2} />
      <Candle x={170} o={128} c={122} hi={120} lo={155} up />
      <text x={170} y={178} textAnchor="middle" {...M}>Pin bar</text>
      <polyline points="190,118 215,100 240,95 275,52" fill="none" stroke="var(--positive)" strokeWidth={2} strokeDasharray="4 3" />
      <line x1={190} x2={340} y1={yEntry} y2={yEntry} stroke="var(--text)" strokeWidth={1.5} />
      <line x1={190} x2={340} y1={yStop} y2={yStop} stroke="var(--negative)" strokeWidth={1.5} strokeDasharray="5 3" />
      <line x1={190} x2={340} y1={yTgt} y2={yTgt} stroke="var(--positive)" strokeWidth={1.5} strokeDasharray="5 3" />
      <text x={338} y={yEntry + 13} textAnchor="end" {...T}>Vào lệnh</text>
      <text x={338} y={yStop + 13} textAnchor="end" {...T} fill="var(--negative)">Dừng lỗ (rủi ro 1R)</text>
      <text x={338} y={yTgt - 4} textAnchor="end" {...T} fill="var(--positive)">Mục tiêu (lời 2R)</text>
      <text x={180} y={212} textAnchor="middle" {...M}>Lời : lỗ = 2 : 1</text>
    </Frame>
  );
}

function RollDiagram() {
  const ev = [
    { x: 40, label: 'Mở vị thế', sub: 'kỳ gần', c: 'var(--muted)' },
    { x: 150, label: 'Roll', sub: 'sang kỳ sau', c: 'var(--accent)' },
    { x: 250, label: 'FND', sub: 'giao hàng', c: 'var(--warning)' },
    { x: 322, label: 'LTD', sub: 'ngừng GD', c: 'var(--negative)' },
  ];
  return (
    <Frame title="Chuyển kỳ (roll) trước FND" desc="Dòng thời gian: mở vị thế kỳ gần, chuyển kỳ sang tháng sau trước ngày thông báo giao hàng đầu tiên FND, sau đó là ngày giao dịch cuối LTD." h={170}>
      <rect x={150} y={72} width={100} height={12} rx={6} fill="var(--accent)" fillOpacity={0.3} />
      <text x={200} y={62} textAnchor="middle" {...T} fill="var(--accent-text)">Cửa sổ roll an toàn</text>
      <line x1={30} x2={340} y1={78} y2={78} stroke="var(--border)" strokeWidth={3} />
      {ev.map((e) => (
        <g key={e.label}>
          <circle cx={e.x} cy={78} r={7} fill={e.c} />
          <text x={e.x} y={106} textAnchor="middle" {...T} fontWeight={600}>{e.label}</text>
          <text x={e.x} y={119} textAnchor="middle" {...M}>{e.sub}</text>
        </g>
      ))}
      <text x={180} y={152} textAnchor="middle" {...M}>Không roll kịp: có thể bị buộc giao nhận hàng thật</text>
    </Frame>
  );
}

const MAP: Record<DiagramId, () => ReactNode> = {
  candle: CandleDiagram, margin: MarginDiagram, hedge: HedgeDiagram, curve: CurveDiagram,
  dow: DowDiagram, srflip: SrFlipDiagram, pinbar: PinbarDiagram, roll: RollDiagram,
};

export function LessonDiagram({ id }: { id: DiagramId }) {
  const C = MAP[id];
  return <C />;
}
