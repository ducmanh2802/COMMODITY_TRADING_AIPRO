import type { ReactNode } from 'react';
import { Figure, M, S, T, type FigureMap } from './kit';

/** Lesson figures for curriculum levels 7–10 (keys prefixed 'c-'). Illustrative numbers are labelled "minh họa". */

type Tone = 'plain' | 'accent' | 'positive' | 'negative' | 'warning';
const col = (t: Tone) => (t === 'plain' ? 'var(--border)' : `var(--${t})`);

const Defs = () => (
  <defs>
    <marker id="cc-arr" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0 0 L8 4 L0 8 z" fill="var(--muted)" />
    </marker>
  </defs>
);

function Arr({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted)" strokeWidth={1.5} markerEnd="url(#cc-arr)" />;
}

/** Rounded box with centred text lines (first line bold unless sub). */
function Box({ x, y, w, h, lines, tone = 'plain' }: { x: number; y: number; w: number; h: number; lines: string[]; tone?: Tone }) {
  const lh = 14;
  const y0 = y + h / 2 - ((lines.length - 1) * lh) / 2 + 4;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={6} fill="var(--surface)" stroke={col(tone)} strokeWidth={tone === 'plain' ? 1 : 1.5} />
      {lines.map((l, i) => (
        <text key={i} x={x + w / 2} y={y0 + i * lh} textAnchor="middle" {...(i === 0 ? S : M)}>
          {l}
        </text>
      ))}
    </g>
  );
}

const Tag = ({ x, y, children, anchor = 'start' }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end' }) => (
  <text x={x} y={y} textAnchor={anchor} {...M}>
    {children}
  </text>
);

const Txt = ({ x, y, children, anchor = 'start', strong = false }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; strong?: boolean }) => (
  <text x={x} y={y} textAnchor={anchor} {...(strong ? S : T)}>
    {children}
  </text>
);

/** Vertical list of numbered steps with an optional second (muted) line. */
function StepList({ items, x = 10, y = 6, w = 340, gap = 34, hh = 28, tone = 'accent' }: { items: [string, string?][]; x?: number; y?: number; w?: number; gap?: number; hh?: number; tone?: Tone }) {
  return (
    <g>
      {items.map(([a, b], i) => (
        <g key={i}>
          <rect x={x} y={y + i * gap} width={w} height={hh} rx={6} fill="var(--surface)" stroke="var(--border)" />
          <circle cx={x + 17} cy={y + i * gap + hh / 2} r={10} fill="none" stroke={col(tone)} strokeWidth={1.5} />
          <text x={x + 17} y={y + i * gap + hh / 2 + 4} textAnchor="middle" {...S}>{i + 1}</text>
          <text x={x + 36} y={y + i * gap + (b ? hh / 2 - 2 : hh / 2 + 4)} {...T}>{a}</text>
          {b ? <text x={x + 36} y={y + i * gap + hh / 2 + 11} {...M}>{b}</text> : null}
        </g>
      ))}
    </g>
  );
}

/** Price ladder: levels on a price axis; brackets show distance. */
function Ladder({ title, desc, hi, lo, levels, rows, note, h = 250, unit }: { title: string; desc: string; hi: number; lo: number; levels: { p: number; tone: Tone; label: string }[]; rows: { from: number; to: number; text: string; sub: string; tone: Tone }[]; note: string; h?: number; unit: string }) {
  const top = 34;
  const bot = h - 66;
  const yOf = (p: number) => top + ((hi - p) / (hi - lo)) * (bot - top);
  return (
    <Figure title={title} desc={desc} h={h}>
      <line x1={70} x2={70} y1={top - 8} y2={bot + 8} stroke="var(--border)" strokeWidth={1.5} />
      <Tag x={70} y={16} anchor="middle">giá ({unit})</Tag>
      {levels.map((l) => (
        <g key={l.p}>
          <line x1={64} x2={150} y1={yOf(l.p)} y2={yOf(l.p)} stroke={col(l.tone)} strokeWidth={1.5} strokeDasharray={l.tone === 'accent' ? undefined : '5 3'} />
          <text x={58} y={yOf(l.p) + 4} textAnchor="end" {...S}>{l.p.toLocaleString('vi-VN')}</text>
          <text x={96} y={yOf(l.p) - 5} {...T}>{l.label}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const a = yOf(r.from);
        const b = yOf(r.to);
        return (
          <g key={i}>
            <path d={`M 150 ${a} L 158 ${a} L 158 ${b} L 150 ${b}`} fill="none" stroke={col(r.tone)} strokeWidth={1.5} />
            <text x={166} y={(a + b) / 2 - 1} {...T} fontWeight={600}>{r.text}</text>
            <text x={166} y={(a + b) / 2 + 12} {...M}>{r.sub}</text>
          </g>
        );
      })}
      <text x={180} y={h - 34} textAnchor="middle" {...M}>{note}</text>
      <text x={180} y={h - 18} textAnchor="middle" {...M}>Số giả định (minh họa), không phải dữ liệu hiện tại.</text>
    </Figure>
  );
}

function Candle({ x, o, c, hi, lo }: { x: number; o: number; c: number; hi: number; lo: number }) {
  const up = c < o; // svg y grows downward: close higher on screen than open = up candle
  const color = up ? 'var(--positive)' : 'var(--negative)';
  return (
    <g>
      <line x1={x} x2={x} y1={hi} y2={lo} stroke={color} strokeWidth={2} />
      <rect x={x - 9} y={Math.min(o, c)} width={18} height={Math.max(Math.abs(o - c), 2)} fill={color} fillOpacity={up ? 0.35 : 0.9} stroke={color} strokeWidth={2} />
    </g>
  );
}

/* ------------------------------ Level 7 ------------------------------ */

function SwingR() {
  return (
    <Ladder
      title="Điểm vào, stop và mục tiêu theo R (minh họa)"
      desc="Thang giá ngô: mục tiêu 474 cent, điểm vào 450, stop 438. Khoảng 12 cent là 1R, khoảng 24 cent là 2R."
      hi={480}
      lo={430}
      unit="cent/giạ"
      levels={[
        { p: 474, tone: 'positive', label: 'Thoát lãi' },
        { p: 450, tone: 'accent', label: 'Vào lệnh' },
        { p: 438, tone: 'negative', label: 'Stop' },
      ]}
      rows={[
        { from: 474, to: 450, text: '+2R (24 cent)', sub: 'lãi nếu thoát 474', tone: 'positive' },
        { from: 450, to: 438, text: '−1R (12 cent)', sub: 'lỗ nếu chạm stop', tone: 'negative' },
      ]}
      note="Stop = 1,5 × ATR 8 = 12 cent. Lãi 24 ÷ rủi ro 12 = 2R."
    />
  );
}

function SwingRules() {
  return (
    <Figure title="Khung 7 quy tắc lướt sóng (để kiểm thử, không phải tín hiệu)" desc="Bảy quy tắc: chọn mã có xu hướng, thuận xu hướng, stop trước, rủi ro 1 đến 2 phần trăm, tránh báo cáo chưa hiểu, kế hoạch chốt lời, ghi nhật ký." h={268}>
      <StepList
        items={[
          ['Chọn mã có xu hướng rõ'],
          ['Thuận xu hướng, chờ nhịp kéo về MA'],
          ['Đặt stop trước (khoảng 1,5–2 × ATR)'],
          ['Rủi ro 1–2% vốn mỗi lệnh'],
          ['Tránh giữ qua báo cáo chưa hiểu'],
          ['Có kế hoạch chốt lời (ví dụ 2R)'],
          ['Ghi mọi lệnh vào nhật ký'],
        ]}
      />
      <text x={180} y={258} textAnchor="middle" {...M}>Khung để kiểm thử bằng backtest, không phải khuyến nghị mua/bán.</text>
    </Figure>
  );
}

function BacktestFlow() {
  const steps: [string, string, Tone][] = [
    ['Ý tưởng', 'một câu, kiểm chứng được', 'plain'],
    ['Quy tắc rõ ràng', 'vào / stop / thoát viết ra giấy', 'plain'],
    ['Backtest', 'có phí + trượt giá thực tế', 'accent'],
    ['Kiểm tra ngoài mẫu', 'walk-forward, mã/giai đoạn khác', 'accent'],
    ['Giả lập (paper)', 'vài tháng + nhật ký', 'warning'],
    ['Tiền thật nhỏ', 'chỉ khi kỷ luật ổn', 'warning'],
  ];
  return (
    <Figure title="Quy trình kiểm thử: từ ý tưởng đến tiền thật nhỏ" desc="Sáu bước: ý tưởng, quy tắc rõ, backtest có phí và trượt giá, kiểm tra ngoài mẫu, giả lập, tiền thật vốn nhỏ." h={262}>
      <Defs />
      {steps.map(([a, b, t], i) => (
        <g key={a}>
          <Box x={50} y={6 + i * 42} w={260} h={32} lines={[a, b]} tone={t} />
          {i < 5 ? <Arr x1={180} y1={38 + i * 42} x2={180} y2={48 + i * 42} /> : null}
        </g>
      ))}
    </Figure>
  );
}

function Overfit() {
  return (
    <Figure title="Overfitting: đường cong quá khứ đẹp, tương lai phẳng (minh họa)" desc="Trong mẫu dùng để chỉnh tham số, vốn tăng đều đẹp. Ngoài mẫu, vốn đi ngang hoặc giảm." h={230}>
      <rect x={20} y={30} width={170} height={140} fill="var(--accent)" fillOpacity={0.08} stroke="var(--border)" />
      <rect x={190} y={30} width={150} height={140} fill="var(--surface)" stroke="var(--border)" />
      <Txt x={105} y={46} anchor="middle" strong>Trong mẫu</Txt>
      <Tag x={105} y={60} anchor="middle">dữ liệu dùng để chỉnh</Tag>
      <Txt x={265} y={46} anchor="middle" strong>Ngoài mẫu</Txt>
      <Tag x={265} y={60} anchor="middle">dữ liệu chưa thấy</Tag>
      <polyline points="24,160 50,148 70,138 92,126 112,112 132,102 152,90 172,80 190,74" fill="none" stroke="var(--positive)" strokeWidth={2.5} />
      <polyline points="190,74 208,84 226,78 246,96 266,92 286,108 306,104 336,114" fill="none" stroke="var(--negative)" strokeWidth={2.5} strokeDasharray="5 3" />
      <Tag x={24} y={192}>Đẹp vì tham số chỉnh cho khớp quá khứ.</Tag>
      <Tag x={24} y={208}>Dấu hiệu tốt: kết quả ngoài mẫu gần với trong mẫu.</Tag>
      <Tag x={340} y={20} anchor="end">minh họa</Tag>
    </Figure>
  );
}

function RoadmapStairs() {
  const steps = ['Học|Cấp 1–7', 'Backtest|phí thực', 'Giả lập|vài tháng', 'Tiền thật|vốn nhỏ', 'Tăng dần|từng bước'];
  return (
    <Figure title="Lộ trình từng bậc: giả lập trước, tiền thật sau" desc="Năm bậc thang: học, backtest với phí thực, giả lập vài tháng, tiền thật vốn nhỏ, tăng dần theo bằng chứng." h={226}>
      {steps.map((s, i) => {
        const [a, b] = s.split('|');
        return (
          <g key={s}>
            <rect x={14 + i * 66} y={150 - i * 28} width={64} height={48 + i * 28} fill="var(--surface)" stroke={col(i >= 3 ? 'warning' : 'accent')} strokeWidth={1.5} />
            <text x={46 + i * 66} y={168 - i * 28} textAnchor="middle" {...S}>{i + 1}</text>
            <text x={46 + i * 66} y={184 - i * 28} textAnchor="middle" fontSize={10} fill="var(--text)">{a}</text>
            <text x={46 + i * 66} y={196 - i * 28} textAnchor="middle" fontSize={10} fill="var(--muted)">{b}</text>
          </g>
        );
      })}
      <Tag x={14} y={218}>Chỉ qua thành viên được MXV cấp phép; vốn nhỏ bạn chịu mất được.</Tag>
    </Figure>
  );
}

/* ------------------------------ Level 8 ------------------------------ */

function DowHhHl() {
  const pts: [number, number][] = [[28, 420], [78, 450], [118, 435], [170, 468], [208, 448], [248, 462], [296, 440]];
  const y = (p: number) => 196 - (p - 410) * 2.4;
  const path = pts.map(([x, p]) => `${x},${y(p)}`).join(' ');
  const lab: [number, number, string, string][] = [[28, 420, 'đáy 420', 'b'], [78, 450, 'đỉnh 450', 't'], [118, 435, 'đáy 435', 'b'], [170, 468, 'đỉnh 468', 't'], [208, 448, 'đáy 448', 'b'], [248, 462, '462', 't'], [296, 440, '440', 'b']];
  return (
    <Figure title="Xu hướng tăng theo Dow: đỉnh cao dần, đáy cao dần (minh họa)" desc="Ngô tạo đáy 420, đỉnh 450, đáy 435, đỉnh 468, đáy 448. Sau đó hồi lên 462 không vượt 468 rồi rơi xuống 440, phá đáy 448: dấu hiệu xu hướng tăng yếu đi." h={236}>
      <line x1={190} x2={340} y1={y(448)} y2={y(448)} stroke="var(--warning)" strokeDasharray="4 3" />
      <line x1={190} x2={340} y1={y(468)} y2={y(468)} stroke="var(--muted)" strokeDasharray="4 3" />
      <polyline points={path} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
      {pts.map(([x, p]) => (
        <circle key={x} cx={x} cy={y(p)} r={3.5} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
      ))}
      {lab.map(([x, p, t, pos]) => (
        <text key={x} x={x} y={y(p) + (pos === 't' ? -8 : 16)} textAnchor="middle" {...T}>{t}</text>
      ))}
      <Tag x={338} y={y(468) - 5} anchor="end">không vượt 468</Tag>
      <Tag x={338} y={y(448) + 12} anchor="end">phá đáy 448</Tag>
      <Txt x={14} y={20} strong>Đỉnh cao dần + đáy cao dần = tăng</Txt>
      <Tag x={14} y={226}>Phá đáy 448: dấu hiệu yếu đi, thận trọng; chưa chắc giảm ngay.</Tag>
      <Tag x={340} y={20} anchor="end">minh họa</Tag>
    </Figure>
  );
}

function DowPhases() {
  return (
    <Figure title="3 giai đoạn của xu hướng chính (minh họa)" desc="Đường giá đi lên: tích lũy đi ngang ở thấp, tham gia đại chúng dốc lên, phân phối đi ngang ở cao." h={236}>
      <polyline points="20,170 50,166 80,172 110,164 140,150 170,112 200,76 230,56 260,62 290,52 320,60" fill="none" stroke="var(--accent)" strokeWidth={2.5} />
      <line x1={110} x2={110} y1={30} y2={180} stroke="var(--border)" strokeDasharray="3 3" />
      <line x1={230} x2={230} y1={30} y2={180} stroke="var(--border)" strokeDasharray="3 3" />
      <Txt x={62} y={196} anchor="middle" strong>1. Tích lũy</Txt>
      <Tag x={62} y={210} anchor="middle">người hiểu biết mua</Tag>
      <Txt x={170} y={196} anchor="middle" strong>2. Đại chúng</Txt>
      <Tag x={170} y={210} anchor="middle">giá tăng rõ, tin tốt</Tag>
      <Txt x={290} y={196} anchor="middle" strong>3. Phân phối</Txt>
      <Tag x={290} y={210} anchor="middle">hưng phấn, người cũ bán</Tag>
      <Tag x={340} y={22} anchor="end">minh họa</Tag>
    </Figure>
  );
}

function PaZones() {
  return (
    <Figure title="Vùng kháng cự, phá vỡ thật và phá vỡ giả (minh họa)" desc="Giá chạm vùng kháng cự nhiều lần, đóng cửa vượt lên, quay lại kiểm tra vùng cũ rồi giữ được. Nhánh phá vỡ giả: vượt lên rồi quay xuống dưới vùng." h={236}>
      <rect x={14} y={66} width={332} height={22} fill="var(--warning)" fillOpacity={0.15} stroke="var(--warning)" strokeDasharray="4 3" />
      <Tag x={20} y={60}>vùng kháng cự (một dải, không phải 1 đường)</Tag>
      <polyline points="24,170 50,110 70,130 96,80 116,118 142,78 164,112 190,46 214,72 232,84 262,44 300,30" fill="none" stroke="var(--accent)" strokeWidth={2.5} />
      <polyline points="190,46 216,100 240,130 270,150 310,170" fill="none" stroke="var(--negative)" strokeWidth={2.5} strokeDasharray="5 3" transform="translate(20 6)" />
      <Txt x={14} y={20} strong>Phá vỡ thật: đóng cửa vượt + retest giữ</Txt>
      <Tag x={238} y={104}>retest giữ</Tag>
      <Tag x={338} y={190} anchor="end">phá vỡ giả: quay lại dưới vùng</Tag>
      <Tag x={20} y={190}>chạm vùng nhiều lần</Tag>
      <Tag x={20} y={210}>Không mua đuổi ngay khi vượt; đặt stop trước.</Tag>
      <Tag x={340} y={228} anchor="end">minh họa</Tag>
    </Figure>
  );
}

function PaCandles() {
  return (
    <Figure title="Hai mẫu nến cơ bản tại vùng quan trọng (minh họa)" desc="Nến rút chân: thân nhỏ, bóng dưới dài. Nến nhấn chìm: nến tăng lớn bao trùm thân nến giảm trước đó." h={190}>
      <Txt x={90} y={22} anchor="middle" strong>Rút chân (pin bar)</Txt>
      <Candle x={90} o={86} c={72} hi={64} lo={150} />
      <Tag x={108} y={136}>bóng dài: giá bị từ chối</Tag>
      <Txt x={270} y={22} anchor="middle" strong>Nhấn chìm (engulfing)</Txt>
      <Candle x={250} o={76} c={104} hi={70} lo={110} />
      <Candle x={282} o={118} c={56} hi={50} lo={124} />
      <Tag x={180} y={172} anchor="middle">Chỉ có ý nghĩa tại vùng hỗ trợ/kháng cự và thuận xu hướng.</Tag>
    </Figure>
  );
}

function VolOiMatrix() {
  const cell = (x: number, y: number, a: string, b: string, tone: Tone) => (
    <g>
      <rect x={x} y={y} width={156} height={66} rx={6} fill="var(--surface)" stroke={col(tone)} strokeWidth={1.5} />
      <text x={x + 78} y={y + 28} textAnchor="middle" {...S}>{a}</text>
      <text x={x + 78} y={y + 46} textAnchor="middle" {...M}>{b}</text>
    </g>
  );
  return (
    <Figure title="Bảng đọc Giá + Hợp đồng mở (OI)" desc="Giá tăng và OI tăng: tiền mới mua, xu hướng tăng khỏe. Giá tăng, OI giảm: short covering. Giá giảm, OI tăng: tiền mới bán. Giá giảm, OI giảm: phe mua đóng lệnh." h={226}>
      <Txt x={130} y={22} anchor="middle" strong>OI tăng</Txt>
      <Txt x={284} y={22} anchor="middle" strong>OI giảm</Txt>
      <Txt x={4} y={72}>Giá</Txt>
      <Txt x={4} y={86}>tăng</Txt>
      <Txt x={4} y={146}>Giá</Txt>
      <Txt x={4} y={160}>giảm</Txt>
      {cell(34, 32, 'Tiền mới mua vào', 'xu hướng tăng khỏe', 'positive')}
      {cell(192, 32, 'Phe bán đóng lệnh', 'short covering, đà yếu', 'warning')}
      {cell(34, 104, 'Tiền mới bán khống', 'xu hướng giảm khỏe', 'negative')}
      {cell(192, 104, 'Phe mua đóng lệnh', 'áp lực bán có thể cạn', 'warning')}
      <Tag x={180} y={190} anchor="middle">Khối lượng = số lần mua bán; OI = số hợp đồng còn mở.</Tag>
      <Tag x={180} y={208} anchor="middle">OI xem theo tuần ở mục COT (số liệu CFTC công bố thứ Sáu).</Tag>
    </Figure>
  );
}

function FiveSteps() {
  return (
    <Figure title="Quy trình đọc biểu đồ 5 bước" desc="Xu hướng Dow, vùng giá, tín hiệu tại vùng, xác nhận khối lượng và OI, rồi quản lý rủi ro. Thiếu một bước thì đứng ngoài." h={236}>
      <StepList
        gap={38}
        hh={32}
        items={[
          ['Xu hướng (Dow)', 'đỉnh/đáy cao dần, thấp dần hay đi ngang?'],
          ['Vùng giá (Price Action)', '2–3 vùng hỗ trợ/kháng cự gần nhất'],
          ['Tín hiệu tại vùng', 'nến từ chối/nhấn chìm hoặc phá vỡ + đóng cửa'],
          ['Sức mạnh (Volume/OI)', 'khối lượng > trung bình? OI cùng chiều?'],
          ['Rủi ro', 'stop, khối lượng 1–2% vốn, lịch báo cáo'],
        ]}
      />
      <Tag x={180} y={226} anchor="middle">Một bước chưa rõ ràng thì đứng ngoài.</Tag>
    </Figure>
  );
}

/* ------------------------------ Level 9 ------------------------------ */

function LivingCapital() {
  return (
    <Figure title="Vốn cần có = chi tiêu mỗi tháng ÷ lãi mỗi tháng (minh họa)" desc="Cần 15 triệu mỗi tháng. Với lãi 1,5 phần trăm mỗi tháng cần 1 tỷ. Nếu chỉ có 50 triệu thì phải lãi 30 phần trăm mỗi tháng." h={210}>
      <Txt x={180} y={24} anchor="middle" strong>15 triệu/tháng ÷ 1,5%/tháng = 1 tỷ</Txt>
      <Tag x={14} y={52}>Vốn cần có</Tag>
      <rect x={14} y={58} width={332} height={20} rx={4} fill="var(--accent)" fillOpacity={0.25} stroke="var(--accent)" />
      <Txt x={20} y={72}>1.000 triệu</Txt>
      <Tag x={14} y={102}>Vốn bạn có (ví dụ)</Tag>
      <rect x={14} y={108} width={17} height={20} rx={4} fill="var(--warning)" fillOpacity={0.35} stroke="var(--warning)" />
      <Txt x={38} y={122}>50 triệu</Txt>
      <rect x={14} y={142} width={332} height={52} rx={6} fill="var(--surface)" stroke="var(--warning)" />
      <Txt x={24} y={162}>Với 50 triệu phải lãi 30%/tháng mới đủ chi tiêu.</Txt>
      <Tag x={24} y={180}>Mục tiêu quá cao buộc dùng đòn bẩy quá lớn: rủi ro tăng vọt.</Tag>
    </Figure>
  );
}

function Compound() {
  const vals = [50, 63, 80, 102, 129, 164];
  const base = 170;
  return (
    <Figure title="Lãi kép: 50 triệu, giả định 2%/tháng, không rút (minh họa)" desc="Sau 1, 2, 3, 4, 5 năm: khoảng 63, 80, 102, 129, 164 triệu. Đây là giả định, không phải cam kết lợi nhuận." h={236}>
      {vals.map((v, i) => {
        const hh = v * 0.8;
        return (
          <g key={i}>
            <rect x={28 + i * 54} y={base - hh} width={36} height={hh} rx={3} fill="var(--accent)" fillOpacity={0.3} stroke="var(--accent)" />
            <text x={46 + i * 54} y={base - hh - 5} textAnchor="middle" {...S}>{v}</text>
            <text x={46 + i * 54} y={base + 14} textAnchor="middle" {...M}>{i === 0 ? 'Đầu' : `Năm ${i}`}</text>
          </g>
        );
      })}
      <Tag x={14} y={206}>Đơn vị: triệu VNĐ. 2%/tháng liên tục là giả định rất cao.</Tag>
      <Tag x={14} y={222}>Cần sống sót qua các giai đoạn lỗ; không phải kỳ vọng.</Tag>
    </Figure>
  );
}

function Expectancy() {
  return (
    <Figure title="Kỳ vọng E = %thắng × lãi TB − %thua × lỗ TB (đơn vị R)" desc="Hệ A thắng 40 phần trăm, lãi trung bình 2,5R, lỗ 1R: E bằng +0,4R. Hệ B thắng 70 phần trăm, lãi 0,5R, lỗ 1,5R: E bằng −0,1R." h={226}>
      <Box x={10} y={10} w={168} h={84} tone="positive" lines={['Hệ A: thắng 40%', 'lãi TB 2,5R, lỗ TB 1R', 'E = 0,4×2,5 − 0,6×1', '= +0,4R / lệnh']} />
      <Box x={182} y={10} w={168} h={84} tone="negative" lines={['Hệ B: thắng 70%', 'lãi TB 0,5R, lỗ TB 1,5R', 'E = 0,7×0,5 − 0,3×1,5', '= −0,1R / lệnh']} />
      <line x1={180} x2={180} y1={112} y2={190} stroke="var(--border)" />
      <rect x={180} y={124} width={62} height={20} fill="var(--positive)" fillOpacity={0.4} stroke="var(--positive)" />
      <rect x={164} y={156} width={16} height={20} fill="var(--negative)" fillOpacity={0.5} stroke="var(--negative)" />
      <Txt x={250} y={139}>+0,4R</Txt>
      <Txt x={158} y={171} anchor="end">−0,1R</Txt>
      <Tag x={180} y={210} anchor="middle">Thắng nhiều vẫn có thể thua tiền nếu lỗ TB lớn hơn lãi TB.</Tag>
    </Figure>
  );
}

function DrawdownRecovery() {
  const rows: [number, number][] = [[10, 11], [20, 25], [30, 43], [50, 100], [70, 233]];
  return (
    <Figure title="Drawdown không đối xứng: lỗ bao nhiêu % thì cần lãi bao nhiêu % để hồi" desc="Lỗ 10 phần trăm cần lãi 11; lỗ 20 cần 25; lỗ 30 cần 43; lỗ 50 cần 100; lỗ 70 cần 233 phần trăm." h={232}>
      <Tag x={14} y={18}>Lỗ</Tag>
      <Tag x={64} y={18}>Cần lãi để hồi vốn</Tag>
      {rows.map(([l, g], i) => (
        <g key={l}>
          <text x={14} y={46 + i * 34} {...S}>−{l}%</text>
          <rect x={64} y={32 + i * 34} width={(g / 233) * 236} height={20} rx={3} fill="var(--negative)" fillOpacity={0.3} stroke="var(--negative)" />
          <text x={64 + (g / 233) * 236 + 6} y={46 + i * 34} {...T}>+{g}%</text>
        </g>
      ))}
      <Tag x={14} y={214}>Giữ drawdown nhỏ quan trọng hơn kiếm lãi lớn.</Tag>
    </Figure>
  );
}

function SizingCalc() {
  return (
    <Figure title="Tính khối lượng: lệnh quá lớn so với vốn thì bỏ qua (minh họa)" desc="Vốn 30.000 USD, rủi ro 1 phần trăm bằng 300 USD. Ngô vào 450, stop 438, cách 12 cent bằng 600 USD mỗi hợp đồng. 300 chia 600 bằng 0,5, làm tròn xuống 0." h={246}>
      <Defs />
      <Box x={20} y={6} w={320} h={36} lines={['Vốn 30.000 USD × 1% = 300 USD', 'số tiền tối đa chấp nhận mất']} />
      <Arr x1={180} y1={42} x2={180} y2={52} />
      <Box x={20} y={54} w={320} h={36} lines={['Stop: 450 − 438 = 12 cent', '12 × 50 USD/cent = 600 USD / hợp đồng']} />
      <Arr x1={180} y1={90} x2={180} y2={100} />
      <Box x={20} y={102} w={320} h={36} lines={['300 ÷ 600 = 0,5 hợp đồng', 'luôn làm tròn XUỐNG']} tone="accent" />
      <Arr x1={180} y1={138} x2={180} y2={148} />
      <Box x={20} y={150} w={320} h={36} lines={['→ 0 hợp đồng: lệnh QUÁ LỚN', 'bỏ qua là một quyết định tốt']} tone="warning" />
      <Tag x={180} y={208} anchor="middle">(Vốn × % rủi ro) ÷ (khoảng stop × giá trị 1 đơn vị giá)</Tag>
      <Tag x={180} y={226} anchor="middle">Ngô CBOT ZC: 1 cent = 50 USD / hợp đồng (5.000 giạ). Số giả định.</Tag>
    </Figure>
  );
}

function Setups3() {
  const panel = (y: number, name: string, l1: string, l2: string, l3: string, chart: ReactNode) => (
    <g>
      <rect x={10} y={y} width={340} height={86} rx={6} fill="var(--surface)" stroke="var(--border)" />
      {chart}
      <text x={134} y={y + 20} {...S}>{name}</text>
      <text x={134} y={y + 40} {...T}>{l1}</text>
      <text x={134} y={y + 56} {...T}>{l2}</text>
      <text x={134} y={y + 74} {...M}>{l3}</text>
    </g>
  );
  return (
    <Figure title="3 setup: Pullback, Breakout–Retest, Range (minh họa)" desc="Ba mẫu giao dịch với điều kiện vào, stop và mục tiêu khác nhau, chọn theo trạng thái thị trường." h={282}>
      {panel(6, '1. Pullback thuận xu hướng', 'Vào: nến từ chối tại hỗ trợ/MA', 'Stop: dưới đáy nhịp; mục tiêu ≥ 2R', 'Dùng khi xu hướng rõ (HH/HL)',
        <polyline points="20,86 40,64 54,74 72,44 88,56 114,22" fill="none" stroke="var(--accent)" strokeWidth={2.5} transform="translate(0 6)" />)}
      {panel(98, '2. Breakout rồi Retest', 'Vào: retest giữ được, nến tăng', 'Stop: dưới vùng cũ; không mua đuổi', 'Dùng khi tích lũy dưới kháng cự',
        <g transform="translate(0 98)">
          <line x1={16} x2={120} y1={34} y2={34} stroke="var(--warning)" strokeDasharray="4 3" />
          <polyline points="20,74 36,42 50,60 64,40 78,24 92,38 108,14" fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        </g>)}
      {panel(190, '3. Range (đi ngang)', 'Vào: gần sàn khi có nến từ chối', 'Stop: ngoài vùng 0,5–1 × ATR', 'Dùng khi MA phẳng, chưa có báo cáo lớn',
        <g transform="translate(0 190)">
          <line x1={16} x2={120} y1={24} y2={24} stroke="var(--border)" />
          <line x1={16} x2={120} y1={68} y2={68} stroke="var(--border)" />
          <polyline points="20,64 36,28 52,64 68,28 84,64 100,30 116,62" fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        </g>)}
    </Figure>
  );
}

function MtfLadder() {
  return (
    <Figure title="1 khung lớn – 1 khung giao dịch – 1 khung vào lệnh" desc="Khung tuần quyết định hướng, khung ngày tìm setup, khung bốn giờ chọn điểm vào. Khung lớn thắng khi mâu thuẫn." h={236}>
      <Defs />
      <Box x={10} y={8} w={340} h={50} tone="accent" lines={['Khung TUẦN → HƯỚNG', 'đỉnh/đáy cao dần: ưu tiên MUA; thấp dần: ưu tiên BÁN']} />
      <Arr x1={180} y1={58} x2={180} y2={70} />
      <Box x={30} y={72} w={300} h={50} lines={['Khung NGÀY → SETUP', 'hỗ trợ/kháng cự, Pullback / Breakout / Range']} />
      <Arr x1={180} y1={122} x2={180} y2={134} />
      <Box x={50} y={136} w={260} h={50} lines={['Khung 4 GIỜ → ĐIỂM VÀO', 'cấu trúc nhỏ đảo chiều, stop chính xác hơn']} />
      <Tag x={180} y={208} anchor="middle">Tỉ lệ giữa các khung khoảng 4–6 lần.</Tag>
      <Tag x={180} y={224} anchor="middle">Chỉ dùng 3 khung, viết kết luận từng khung trước khi vào lệnh.</Tag>
    </Figure>
  );
}

function PsyTraps() {
  const rows: [string, string][] = [
    ['FOMO', 'chỉ vào khi đúng setup đã viết sẵn'],
    ['Gồng lỗ', 'stop chỉ dời theo hướng có lợi'],
    ['Chốt lời quá sớm', 'chốt một phần ở mục tiêu, dời stop'],
    ['Trả thù thị trường', '2 lệnh thua liên tiếp: tắt máy'],
    ['Tự tin thái quá', 'khối lượng theo công thức % vốn'],
    ['Thiên kiến xác nhận', 'viết 2 lý do kịch bản có thể SAI'],
  ];
  return (
    <Figure title="6 cái bẫy tâm lý và quy tắc chặn" desc="FOMO, gồng lỗ, chốt lời sớm, trả thù thị trường, tự tin thái quá, thiên kiến xác nhận, mỗi bẫy kèm một quy tắc viết sẵn." h={254}>
      <Txt x={14} y={20} strong>Bẫy</Txt>
      <Txt x={140} y={20} strong>Quy tắc chặn</Txt>
      {rows.map(([a, b], i) => (
        <g key={a}>
          <rect x={10} y={28 + i * 36} width={340} height={30} rx={6} fill="var(--surface)" stroke="var(--border)" />
          <text x={18} y={47 + i * 36} fill="var(--negative)" fontSize={11} fontWeight={600}>{a}</text>
          <text x={140} y={47 + i * 36} {...T}>{b}</text>
        </g>
      ))}
    </Figure>
  );
}

function PlanCard() {
  const rows: [string, string][] = [
    ['Mã giao dịch', 'ngô, đậu tương, dầu WTI, vàng'],
    ['Khung thời gian', 'Tuần – Ngày – 4 giờ'],
    ['Setup được dùng', 'Pullback, Breakout–Retest'],
    ['Rủi ro mỗi lệnh', '1% vốn; tối đa 3 lệnh, tổng ≤ 3%'],
    ['Giới hạn lỗ', 'ngày 2% thì nghỉ; tuần 6% giảm nửa'],
    ['Tránh báo cáo', '24 giờ trước WASDE / EIA'],
    ['Chốt lời', '50% ở 2R, còn lại dời stop về hoà vốn'],
    ['Đánh giá', 'mỗi Chủ nhật'],
  ];
  return (
    <Figure title="Mẫu thẻ kế hoạch giao dịch (ví dụ)" desc="Thẻ kế hoạch gồm mã, khung thời gian, setup, rủi ro, giới hạn lỗ, tránh báo cáo, chốt lời và lịch đánh giá." h={266}>
      <rect x={8} y={6} width={344} height={254} rx={8} fill="var(--surface)" stroke="var(--accent)" strokeWidth={1.5} />
      <Txt x={18} y={26} strong>KẾ HOẠCH — hợp đồng với chính mình</Txt>
      {rows.map(([a, b], i) => (
        <g key={a}>
          <line x1={14} x2={346} y1={36 + i * 27} y2={36 + i * 27} stroke="var(--border)" />
          <text x={18} y={54 + i * 27} {...M}>{a}</text>
          <text x={116} y={54 + i * 27} {...T}>{b}</text>
        </g>
      ))}
    </Figure>
  );
}

function DailyLoop() {
  return (
    <Figure title="Nhịp làm việc: trước phiên, trong phiên, sau phiên, cuối tuần" desc="Bốn nhịp lặp lại: chuẩn bị 15 đến 30 phút, hành động theo kịch bản, ghi nhật ký 10 đến 15 phút, đọc lại cuối tuần." h={226}>
      <Defs />
      <Box x={10} y={10} w={156} h={72} tone="accent" lines={['1. Trước phiên', '15–30 phút', 'lịch báo cáo, vùng giá']} />
      <Box x={194} y={10} w={156} h={72} lines={['2. Trong phiên', 'chỉ làm khi kịch bản xảy ra', 'đặt stop ngay']} />
      <Box x={194} y={118} w={156} h={72} lines={['3. Sau phiên', '10–15 phút', 'ghi nhật ký, chấm kỷ luật']} />
      <Box x={10} y={118} w={156} h={72} tone="warning" lines={['4. Cuối tuần', 'đọc lại nhật ký', 'đổi tối đa 1 quy tắc']} />
      <Arr x1={166} y1={46} x2={192} y2={46} />
      <Arr x1={272} y1={82} x2={272} y2={116} />
      <Arr x1={192} y1={154} x2={168} y2={154} />
      <Arr x1={88} y1={118} x2={88} y2={84} />
      <Tag x={180} y={214} anchor="middle">Chấm điểm theo kỷ luật, không theo lãi/lỗ từng ngày.</Tag>
    </Figure>
  );
}

function JournalLoop() {
  const nodes: [number, number, string, string][] = [
    [180, 30, 'Ghi lệnh', 'R, cảm xúc, đúng kế hoạch?'],
    [296, 104, 'Tính chỉ số', 'sau 20–30 lệnh'],
    [252, 190, 'Tách nhóm', 'setup / mã / cảm xúc'],
    [108, 190, 'Tìm 1 lỗi lặp', 'và 1 điều làm tốt'],
    [64, 104, 'Sửa 1 quy tắc', 'rồi kiểm lại'],
  ];
  return (
    <Figure title="Vòng lặp nhật ký: ghi, đo, tách, sửa" desc="Ghi lệnh, tính chỉ số, tách theo nhóm, tìm một lỗi lặp lại, sửa một quy tắc, rồi tiếp tục ghi." h={240}>
      <Defs />
      <ellipse cx={180} cy={112} rx={78} ry={52} fill="none" stroke="var(--border)" strokeDasharray="4 4" />
      <Arr x1={236} y1={44} x2={262} y2={80} />
      <Arr x1={290} y1={132} x2={270} y2={168} />
      <Arr x1={198} y1={210} x2={166} y2={210} />
      <Arr x1={92} y1={166} x2={72} y2={132} />
      <Arr x1={80} y1={80} x2={124} y2={44} />
      {nodes.map(([x, y, a, b]) => (
        <Box key={a} x={x - 54} y={y - 20} w={108} h={40} lines={[a, b]} />
      ))}
      <Txt x={180} y={114} anchor="middle" strong>cải tiến</Txt>
      <Tag x={180} y={128} anchor="middle">từng bước nhỏ</Tag>
    </Figure>
  );
}

function MetricsCard() {
  return (
    <Figure title="Ví dụ đọc 40 lệnh giả lập (số giả định, minh họa)" desc="17 thắng trên 40 lệnh, E khoảng +0,29R, profit factor khoảng 1,48. Tách theo setup: Pullback E +0,45R trên 25 lệnh, Breakout E +0,02R trên 15 lệnh. 6 lệnh ngoài kế hoạch tổng −7R." h={238}>
      <Box x={10} y={8} w={110} h={58} lines={['40 lệnh', '17 thắng (42,5%)']} />
      <Box x={125} y={8} w={110} h={58} tone="positive" lines={['E ≈ +0,29R', 'lãi 2,1R / lỗ 1,05R']} />
      <Box x={240} y={8} w={110} h={58} lines={['PF ≈ 1,48', 'max DD 9%']} />
      <Txt x={14} y={92} strong>Tách theo nhóm</Txt>
      <Tag x={14} y={116}>Pullback (25)</Tag>
      <rect x={110} y={104} width={0.45 * 190} height={16} fill="var(--positive)" fillOpacity={0.4} stroke="var(--positive)" />
      <Txt x={110 + 0.45 * 190 + 6} y={116}>+0,45R</Txt>
      <Tag x={14} y={142}>Breakout (15)</Tag>
      <rect x={110} y={130} width={6} height={16} fill="var(--accent)" fillOpacity={0.4} stroke="var(--accent)" />
      <Txt x={124} y={142}>+0,02R</Txt>
      <Tag x={14} y={168}>Ngoài kế hoạch (6)</Tag>
      <rect x={110} y={156} width={80} height={16} fill="var(--negative)" fillOpacity={0.4} stroke="var(--negative)" />
      <Txt x={196} y={168}>tổng −7R</Txt>
      <Tag x={14} y={202}>Kết luận: giữ Pullback, xem lại Breakout, bỏ lệnh ngoài kế hoạch.</Tag>
      <Tag x={14} y={218}>Cần thêm ≥10 lệnh nữa mới đủ tiêu chí 50 lệnh.</Tag>
    </Figure>
  );
}

/* ------------------------------ Level 10 ------------------------------ */

function LongShort() {
  return (
    <Figure title="Mua (Long) và Bán (Short): lãi lỗ theo giá" desc="Lệnh mua lãi khi giá lên và lỗ khi giá xuống. Lệnh bán ngược lại. Hai đường cắt nhau tại giá vào lệnh." h={230}>
      <line x1={40} x2={330} y1={110} y2={110} stroke="var(--border)" strokeWidth={1.5} />
      <line x1={185} x2={185} y1={20} y2={190} stroke="var(--border)" strokeDasharray="3 3" />
      <line x1={50} y1={170} x2={320} y2={40} stroke="var(--positive)" strokeWidth={3} />
      <line x1={50} y1={40} x2={320} y2={170} stroke="var(--negative)" strokeWidth={3} />
      <Txt x={14} y={22} strong>Long: lãi khi giá tăng</Txt>
      <Txt x={14} y={204} strong>Short: lãi khi giá giảm</Txt>
      <Tag x={190} y={32}>giá vào lệnh</Tag>
      <Tag x={44} y={104}>lãi</Tag>
      <Tag x={44} y={124}>lỗ</Tag>
      <Tag x={346} y={224} anchor="end">Đóng vị thế = làm lệnh ngược lại, cùng số hợp đồng.</Tag>
    </Figure>
  );
}

function OrderTypes() {
  return (
    <Figure title="3 loại lệnh cơ bản" desc="Lệnh giới hạn kiểm soát giá nhưng có thể không khớp. Lệnh thị trường chắc khớp nhưng có thể trượt giá. Lệnh dừng kích hoạt khi chạm mức, dùng để cắt lỗ." h={226}>
      <Box x={10} y={8} w={340} h={64} tone="accent" lines={['Lệnh giới hạn (Limit)', 'khớp ở giá bạn đặt hoặc tốt hơn', 'kiểm soát giá, có thể KHÔNG khớp']} />
      <Box x={10} y={80} w={340} h={64} lines={['Lệnh thị trường (Market)', 'khớp ngay ở giá tốt nhất hiện có', 'chắc khớp, có thể bị TRƯỢT GIÁ']} />
      <Box x={10} y={152} w={340} h={64} tone="warning" lines={['Lệnh dừng (Stop)', 'chạm mức kích hoạt thì thành lệnh thị trường', 'dùng để cắt lỗ: đặt ngay sau khi vào lệnh']} />
    </Figure>
  );
}

function ContractSpecs() {
  const rows: [string, string, string, string][] = [
    ['Ngô CBOT (ZC)', '5.000 giạ', 'tick 0,25 cent = 12,5 USD', '1 cent = 50 USD'],
    ['Robusta ICE (RC)', '10 tấn', 'tick 1 USD = 10 USD', '1 USD/tấn = 10 USD'],
    ['Arabica ICE (KC)', '37.500 pound', 'tick 0,05 cent = 18,75 USD', '1 cent = 375 USD'],
  ];
  return (
    <Figure title="4 con số của hợp đồng: quy mô, đơn vị yết, tick, giá trị 1 đơn vị giá" desc="Ngô 5.000 giạ, 1 cent bằng 50 USD. Robusta 10 tấn, 1 USD mỗi tấn bằng 10 USD. Arabica 37.500 pound, 1 cent bằng 375 USD." h={232}>
      {rows.map(([a, b, c, d], i) => (
        <g key={a}>
          <rect x={10} y={8 + i * 62} width={340} height={56} rx={6} fill="var(--surface)" stroke="var(--border)" />
          <text x={18} y={26 + i * 62} {...S}>{a}</text>
          <text x={342} y={26 + i * 62} textAnchor="end" fill="var(--accent)" fontSize={11} fontWeight={600}>{d}</text>
          <text x={18} y={44 + i * 62} {...M}>Quy mô: {b}</text>
          <text x={342} y={44 + i * 62} textAnchor="end" {...M}>{c}</text>
        </g>
      ))}
      <Tag x={180} y={212} anchor="middle">Lãi/lỗ = (giá đóng − giá mở) × giá trị 1 đơn vị × số hợp đồng.</Tag>
      <Tag x={180} y={226} anchor="middle">Lệnh Short đổi dấu.</Tag>
    </Figure>
  );
}

function Leverage() {
  const w = (1700 / 22000) * 332;
  return (
    <Figure title="Đòn bẩy = giá trị hợp đồng ÷ ký quỹ (số giả định)" desc="Ngô 440 cent, giá trị một hợp đồng 22.000 USD, ký quỹ 1.700 USD, đòn bẩy khoảng 13 lần. Giá đi 1 phần trăm bằng 220 USD, khoảng 13 phần trăm ký quỹ." h={210}>
      <Tag x={14} y={22}>Giá trị 1 hợp đồng = 5.000 giạ × 4,40 USD</Tag>
      <rect x={14} y={30} width={332} height={24} rx={4} fill="var(--accent)" fillOpacity={0.25} stroke="var(--accent)" />
      <Txt x={22} y={47}>22.000 USD</Txt>
      <Tag x={14} y={76}>Ký quỹ ban đầu (giả định)</Tag>
      <rect x={14} y={84} width={w} height={24} rx={4} fill="var(--warning)" fillOpacity={0.35} stroke="var(--warning)" />
      <Txt x={14 + w + 8} y={101}>1.700 USD</Txt>
      <Box x={14} y={126} w={332} h={68} tone="warning" lines={['22.000 ÷ 1.700 ≈ 13 lần', 'Giá đi 1% (≈ 4,4 cent = 220 USD)', 'tương đương ≈ 13% ký quỹ']} />
    </Figure>
  );
}

function MarginLadder() {
  return (
    <Figure title="Ký quỹ ban đầu, duy trì và margin call (số giả định)" desc="Ký quỹ ban đầu 1.700 USD, duy trì 1.550 USD. Khoảng đệm 150 USD, khoảng 3 cent với 1 hợp đồng ngô. Dưới mức duy trì có yêu cầu bổ sung ký quỹ." h={236}>
      <Defs />
      <Box x={10} y={8} w={190} h={40} tone="accent" lines={['Ký quỹ ban đầu', '1.700 USD']} />
      <Arr x1={105} y1={48} x2={105} y2={72} />
      <Tag x={114} y={64}>lỗ mỗi ngày</Tag>
      <Box x={10} y={74} w={190} h={40} tone="warning" lines={['Mức duy trì', '1.550 USD']} />
      <Arr x1={105} y1={114} x2={105} y2={138} />
      <Box x={10} y={140} w={190} h={52} tone="negative" lines={['Dưới mức duy trì', 'MARGIN CALL: nộp thêm', 'hoặc bị đóng bớt vị thế']} />
      <rect x={216} y={14} width={134} height={100} rx={6} fill="var(--surface)" stroke="var(--border)" />
      <Txt x={224} y={34} strong>Khoảng đệm</Txt>
      <Txt x={224} y={52}>1.700 − 1.550</Txt>
      <Txt x={224} y={68}>= 150 USD</Txt>
      <Tag x={224} y={86}>≈ 3 cent × 50 USD</Tag>
      <Tag x={224} y={102}>(1 hợp đồng ngô)</Tag>
      <Tag x={180} y={212} anchor="middle">Mức thật do MXV/thành viên công bố.</Tag>
      <Tag x={180} y={228} anchor="middle">Giữ tổng ký quỹ dưới 30–40% tài khoản.</Tag>
    </Figure>
  );
}

function CornTrade() {
  return (
    <Ladder
      title="Ví dụ lệnh MUA ngô: vào 439, stop 432, mục tiêu 453 (minh họa)"
      desc="Điểm vào 439 cent, stop 432, mục tiêu 453. Rủi ro 7 cent bằng 350 USD, lãi mục tiêu 14 cent bằng 700 USD, tức 2R."
      hi={458}
      lo={428}
      unit="cent/giạ"
      levels={[
        { p: 453, tone: 'positive', label: 'Mục tiêu' },
        { p: 439, tone: 'accent', label: 'Mua' },
        { p: 432, tone: 'negative', label: 'Cắt lỗ' },
      ]}
      rows={[
        { from: 453, to: 439, text: '+14 cent = 700 USD', sub: '= 2R', tone: 'positive' },
        { from: 439, to: 432, text: '−7 cent = 350 USD', sub: '= 1R', tone: 'negative' },
      ]}
      note="1 cent = 50 USD/hợp đồng. Rủi ro 350 USD ≤ 1% của 39.000 USD (390)."
    />
  );
}

function OrderCalcFlow() {
  return (
    <Figure title="Máy tính lệnh: từ vốn đến số hợp đồng (số giả định)" desc="Vốn 1 tỷ VNĐ, tỷ giá 25.600, khoảng 39.000 USD. Rủi ro 1 phần trăm bằng 390 USD. Stop 7 cent bằng 350 USD mỗi hợp đồng. 390 chia 350 khoảng 1,11, làm tròn xuống 1 hợp đồng." h={290}>
      <Defs />
      <Box x={20} y={6} w={320} h={36} lines={['1. Vốn 1 tỷ VNĐ ÷ 25.600 ≈ 39.000 USD', 'quy đổi theo tỷ giá giả định']} />
      <Arr x1={180} y1={42} x2={180} y2={52} />
      <Box x={20} y={54} w={320} h={36} lines={['2. Rủi ro 1% × 39.000 = 390 USD', 'ngân sách mất tối đa mỗi lệnh']} />
      <Arr x1={180} y1={90} x2={180} y2={100} />
      <Box x={20} y={102} w={320} h={36} lines={['3. Vào 439, stop 432: 7 cent × 50 = 350 USD', 'rủi ro cho 1 hợp đồng']} />
      <Arr x1={180} y1={138} x2={180} y2={148} />
      <Box x={20} y={150} w={320} h={36} lines={['4. 390 ÷ 350 ≈ 1,11 → làm tròn xuống', 'số hợp đồng = 1']} tone="accent" />
      <Arr x1={180} y1={186} x2={180} y2={196} />
      <Box x={20} y={198} w={320} h={36} lines={['5. Ký quỹ giả định 1.700 USD ≈ 4% tài khoản', 'còn nhiều đệm; mục tiêu 453 = 2R']} tone="positive" />
      <Tag x={180} y={256} anchor="middle">Nếu vốn chỉ 300 triệu (~11.700 USD): 1% = 117 USD, thấp hơn 350 USD</Tag>
      <Tag x={180} y={272} anchor="middle">→ 1 hợp đồng đã rủi ro ~3% vốn, vượt quy tắc.</Tag>
    </Figure>
  );
}

function RobustaTrade() {
  return (
    <Ladder
      title="Ví dụ lệnh BÁN Robusta: vào 4.540, stop 4.640, mục tiêu 4.340 (minh họa)"
      desc="Bán ở 4.540 USD mỗi tấn, cắt lỗ 4.640, mục tiêu 4.340. Rủi ro 100 USD mỗi tấn bằng 1.000 USD, lãi mục tiêu 200 USD mỗi tấn bằng 2.000 USD, tức 2R."
      hi={4680}
      lo={4300}
      unit="USD/tấn"
      levels={[
        { p: 4640, tone: 'negative', label: 'Cắt lỗ' },
        { p: 4540, tone: 'accent', label: 'Bán' },
        { p: 4340, tone: 'positive', label: 'Mục tiêu' },
      ]}
      rows={[
        { from: 4640, to: 4540, text: '100 × 10 = 1.000 USD', sub: '= 1R (lỗ nếu sai)', tone: 'negative' },
        { from: 4540, to: 4340, text: '200 × 10 = 2.000 USD', sub: '= 2R (lãi nếu đúng)', tone: 'positive' },
      ]}
      note="1 USD/tấn = 10 USD/hợp đồng (10 tấn). Short lãi khi giá giảm."
    />
  );
}

function HedgeFarmer() {
  return (
    <Figure title="Người trồng cà phê giữ giá bằng lệnh Bán: lãi sàn bù giá bán thấp (minh họa)" desc="Giả sử 10 tấn cà phê. Giá giảm 200 USD mỗi tấn: bán cà phê thật kém đi 2.000 USD, lệnh bán hợp đồng Robusta lãi 2.000 USD, hai bên bù nhau, chưa tính phí và chênh lệch giá nơi bán." h={254}>
      <line x1={190} x2={190} y1={30} y2={150} stroke="var(--border)" />
      <rect x={110} y={100} width={80} height={46} fill="var(--negative)" fillOpacity={0.35} stroke="var(--negative)" />
      <rect x={190} y={40} width={80} height={46} fill="var(--positive)" fillOpacity={0.35} stroke="var(--positive)" />
      <Txt x={104} y={118} anchor="end" strong>Cà phê thật</Txt>
      <Tag x={104} y={134} anchor="end">−2.000 USD</Tag>
      <Txt x={278} y={58} strong>Bán Robusta</Txt>
      <Tag x={278} y={74}>+2.000 USD</Tag>
      <Tag x={190} y={22} anchor="middle">Giá giảm 200 USD/tấn; 10 tấn = 1 hợp đồng</Tag>
      <Box x={20} y={162} w={320} h={40} tone="accent" lines={['Cộng lại ≈ 0 (bỏ qua phí, chênh lệch nơi bán)', 'Giữ giá bán, đổi lại không hưởng nếu giá tăng']} />
      <Tag x={180} y={226} anchor="middle">Số giả định minh họa. Thực tế còn phí, ký quỹ và</Tag>
      <Tag x={180} y={242} anchor="middle">chênh lệch giá giữa sàn và nơi bán.</Tag>
    </Figure>
  );
}

function CostsStack() {
  return (
    <Figure title="Chi phí bào mòn kế hoạch: phí, trượt giá, tỷ giá, roll" desc="Phí hai chiều 10 USD là khoảng 0,03R với lệnh ngô rủi ro 350 USD nhưng khoảng 0,1R nếu stop chỉ 2 cent bằng 100 USD." h={216}>
      <Box x={10} y={8} w={80} h={44} lines={['Phí', 'sàn + thành viên']} />
      <Box x={95} y={8} w={80} h={44} lines={['Trượt giá', 'lệnh thị trường']} />
      <Box x={180} y={8} w={80} h={44} lines={['Tỷ giá', 'USD ↔ VNĐ']} />
      <Box x={265} y={8} w={85} h={44} lines={['Roll', 'contango tốn']} />
      <Txt x={14} y={78} strong>Phí 10 USD (2 chiều) so với rủi ro</Txt>
      <Tag x={14} y={102}>Stop 7 cent (350 USD)</Tag>
      <rect x={140} y={90} width={8} height={16} fill="var(--accent)" fillOpacity={0.5} stroke="var(--accent)" />
      <Txt x={156} y={102}>≈ 0,03R</Txt>
      <Tag x={14} y={132}>Stop 2 cent (100 USD)</Tag>
      <rect x={140} y={120} width={28} height={16} fill="var(--warning)" fillOpacity={0.5} stroke="var(--warning)" />
      <Txt x={176} y={132}>≈ 0,1R</Txt>
      <Tag x={14} y={164}>Stop càng hẹp, chi phí cố định càng chiếm nhiều rủi ro.</Tag>
      <Tag x={14} y={182}>Phí thực tế: hỏi thành viên môi giới (10 USD là giả định).</Tag>
    </Figure>
  );
}

function RollContango() {
  return (
    <Figure title="Roll trong contango: tháng xa đắt hơn tháng gần (số giả định)" desc="Đóng hợp đồng tháng gần giá 439 cent, mở hợp đồng tháng xa giá 451. Chênh 12 cent bằng 600 USD với 1 hợp đồng ngô, là chi phí khi giữ vị thế Long." h={220}>
      <Defs />
      <rect x={40} y={90} width={90} height={60} fill="var(--accent)" fillOpacity={0.25} stroke="var(--accent)" />
      <rect x={230} y={70} width={90} height={80} fill="var(--warning)" fillOpacity={0.3} stroke="var(--warning)" />
      <Txt x={85} y={84} anchor="middle" strong>439</Txt>
      <Txt x={275} y={64} anchor="middle" strong>451</Txt>
      <Tag x={85} y={168} anchor="middle">Tháng gần (đóng)</Tag>
      <Tag x={275} y={168} anchor="middle">Tháng xa (mở)</Tag>
      <Arr x1={136} y1={120} x2={224} y2={120} />
      <Tag x={180} y={112} anchor="middle">roll</Tag>
      <Txt x={180} y={192} anchor="middle" strong>Chênh 12 cent × 50 USD = 600 USD</Txt>
      <Tag x={180} y={210} anchor="middle">Backwardation (tháng xa rẻ hơn): chiều ngược lại.</Tag>
    </Figure>
  );
}

function FourWays() {
  return (
    <Figure title="4 cách kiếm lợi nhuận và độ phù hợp với người mới" desc="Lướt sóng theo xu hướng, theo cung cầu và báo cáo, theo mùa vụ, giao dịch chênh lệch. Người mới bắt đầu với xu hướng kết hợp kiểm tra cung cầu, mùa vụ là bộ lọc, spread để sau." h={218}>
      <Box x={10} y={8} w={166} h={66} tone="accent" lines={['1. Theo xu hướng', 'giữ vài ngày–tuần', 'quy tắc rõ, kiểm thử được']} />
      <Box x={184} y={8} w={166} h={66} tone="accent" lines={['2. Cung cầu & báo cáo', 'WASDE, EIA, COT, thời tiết', 'kiểm tra bối cảnh']} />
      <Box x={10} y={82} w={166} h={66} lines={['3. Mùa vụ', 'xu hướng thống kê', 'dùng làm bộ lọc']} />
      <Box x={184} y={82} w={166} h={66} lines={['4. Chênh lệch (spread)', 'mua 1 kỳ hạn, bán 1 kỳ hạn', 'để sau khi đã quen']} />
      <rect x={10} y={160} width={340} height={46} rx={6} fill="var(--surface)" stroke="var(--warning)" strokeWidth={1.5} />
      <Txt x={20} y={180}>Người mới: (1) kết hợp kiểm tra (2); (3) làm bộ lọc.</Txt>
      <Tag x={20} y={196}>Chỉ vào lệnh khi xu hướng giá và cung cầu không mâu thuẫn.</Tag>
    </Figure>
  );
}

function DriversMap() {
  const spokes: [number, number, string, string][] = [
    [70, 36, 'Thời tiết', 'vụ mùa'],
    [290, 36, 'Tồn kho', 'WASDE / EIA'],
    [60, 176, 'Xuất khẩu', 'nhu cầu'],
    [300, 176, 'Vị thế quỹ', 'COT'],
  ];
  return (
    <Figure title="Bản đồ yếu tố cung cầu tác động lên giá" desc="Giá ở trung tâm, chịu tác động từ thời tiết vụ mùa, tồn kho từ báo cáo WASDE hoặc EIA, xuất khẩu, vị thế quỹ trong COT và tỷ giá USD." h={240}>
      {spokes.map(([x, y, a]) => (
        <line key={a} x1={180} y1={106} x2={x} y2={y} stroke="var(--border)" strokeWidth={1.5} />
      ))}
      <line x1={180} y1={106} x2={180} y2={186} stroke="var(--border)" strokeWidth={1.5} />
      <circle cx={180} cy={106} r={30} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
      <Txt x={180} y={110} anchor="middle" strong>GIÁ</Txt>
      {spokes.map(([x, y, a, b]) => (
        <Box key={a} x={x - 54} y={y - 20} w={108} h={40} lines={[a, b]} />
      ))}
      <Box x={126} y={166} w={108} h={40} lines={['Tỷ giá USD', 'và vĩ mô']} />
      <Tag x={180} y={226} anchor="middle">Mỗi yếu tố đo bằng báo cáo/dữ liệu riêng; không tự cho biết giá sẽ đi đâu.</Tag>
    </Figure>
  );
}

function ReportCalendar() {
  const days: [string, string, string, string, Tone][] = [
    ['T2', '', '', '', 'plain'],
    ['T3', 'COT', 'chốt số', 'liệu', 'warning'],
    ['T4', 'EIA', 'tồn kho', 'dầu (thường)', 'accent'],
    ['T5', '', '', '', 'plain'],
    ['T6', 'COT', 'công bố', 'số của T3', 'warning'],
  ];
  return (
    <Figure title="Lịch báo cáo trong tuần (tham khảo, theo giờ Mỹ)" desc="COT chốt số liệu thứ Ba và công bố thứ Sáu. EIA tồn kho dầu thường thứ Tư. WASDE công bố hàng tháng theo lịch của USDA." h={230}>
      {days.map(([d, a, b, c, t], i) => (
        <g key={d}>
          <rect x={8 + i * 69} y={10} width={66} height={28} rx={5} fill="var(--surface)" stroke="var(--border)" />
          <text x={41 + i * 69} y={29} textAnchor="middle" {...S}>{d}</text>
          <rect x={8 + i * 69} y={44} width={66} height={72} rx={5} fill="var(--surface)" stroke={col(t)} strokeWidth={t === 'plain' ? 1 : 1.5} />
          <text x={41 + i * 69} y={66} textAnchor="middle" {...S}>{a}</text>
          <text x={41 + i * 69} y={84} textAnchor="middle" {...M}>{b}</text>
          <text x={41 + i * 69} y={98} textAnchor="middle" {...M}>{c}</text>
        </g>
      ))}
      <Box x={8} y={126} w={344} h={34} tone="accent" lines={['WASDE (USDA): hàng tháng, ngày theo lịch USDA']} />
      <Tag x={8} y={182}>Giờ Mỹ chậm hơn giờ Việt Nam khoảng 11–12 giờ (tùy giờ mùa hè),</Tag>
      <Tag x={8} y={198}>nên nhiều báo cáo ra vào đêm/rạng sáng ở Việt Nam.</Tag>
      <Tag x={8} y={216}>Luôn kiểm tra lịch chính thức của USDA, EIA, CFTC.</Tag>
    </Figure>
  );
}

function CalendarSpread() {
  return (
    <Figure title="Spread lịch: mua ngô tháng 7, bán ngô tháng 12 (số giả định)" desc="Mua tháng 7 từ 450 lên 458 lãi 8 cent. Bán tháng 12 từ 462 lên 463 lỗ 1 cent. Chênh lệch đổi từ −12 sang −5: lãi 7 cent bằng 350 USD." h={226}>
      <Box x={10} y={8} w={166} h={78} tone="positive" lines={['Chân 1: MUA tháng 7', '450 → 458', '+8 cent']} />
      <Box x={184} y={8} w={166} h={78} tone="negative" lines={['Chân 2: BÁN tháng 12', '462 → 463', '−1 cent']} />
      <Txt x={180} y={112} anchor="middle" strong>Chênh (T7 − T12): −12 → −5</Txt>
      <Txt x={180} y={134} anchor="middle">Lãi = 8 − 1 = 7 cent × 50 = 350 USD</Txt>
      <Tag x={180} y={160} anchor="middle">Chênh rộng ra thành −18 thì lỗ 6 cent = 300 USD.</Tag>
      <Tag x={180} y={182} anchor="middle">Spread ăn khoảng chênh, ít phụ thuộc hướng chung của giá.</Tag>
      <Tag x={180} y={204} anchor="middle">Vẫn có rủi ro; để sau khi đã quen cách đơn giản hơn.</Tag>
    </Figure>
  );
}

function ReadyGate() {
  return (
    <Figure title="Cổng chuyển từ giả lập sang tiền thật nhỏ (tiêu chí gợi ý)" desc="Cần tối thiểu 50 lệnh giả lập, kỳ vọng trên +0,2R sau phí, tài khoản không sụt quá 15 phần trăm, ít nhất 90 phần trăm lệnh đúng kế hoạch, rồi mới tiền thật nhỏ." h={256}>
      <Defs />
      <StepList
        gap={32}
        hh={26}
        items={[
          ['≥ 50 lệnh giả lập, có nhật ký'],
          ['Kỳ vọng > +0,2R sau phí'],
          ['Sụt vốn tối đa < 15% từ đỉnh'],
          ['≥ 90% lệnh đúng kế hoạch'],
        ]}
      />
      <Arr x1={180} y1={134} x2={180} y2={146} />
      <Box x={20} y={148} w={320} h={42} tone="positive" lines={['Tiền thật nhỏ: 1 hợp đồng, rủi ro ≤ 1%', 'vốn mất hết cũng không ảnh hưởng cuộc sống']} />
      <Box x={20} y={200} w={320} h={46} tone="negative" lines={['Dừng, quay lại giả lập nếu: dời stop, vào ngoài', 'kế hoạch, tăng khối lượng để gỡ, vay tiền giao dịch']} />
    </Figure>
  );
}

export const FIGURES_C: FigureMap = {
  'c-swing-r': SwingR,
  'c-swing-rules': SwingRules,
  'c-backtest-flow': BacktestFlow,
  'c-overfit': Overfit,
  'c-roadmap-stairs': RoadmapStairs,
  'c-dow-hhhl': DowHhHl,
  'c-dow-phases': DowPhases,
  'c-pa-zones': PaZones,
  'c-pa-candles': PaCandles,
  'c-vol-oi': VolOiMatrix,
  'c-five-steps': FiveSteps,
  'c-living-capital': LivingCapital,
  'c-compound': Compound,
  'c-expectancy': Expectancy,
  'c-drawdown': DrawdownRecovery,
  'c-sizing-calc': SizingCalc,
  'c-setups-3': Setups3,
  'c-mtf-ladder': MtfLadder,
  'c-psy-traps': PsyTraps,
  'c-plan-card': PlanCard,
  'c-daily-loop': DailyLoop,
  'c-journal-loop': JournalLoop,
  'c-metrics-card': MetricsCard,
  'c-long-short': LongShort,
  'c-order-types': OrderTypes,
  'c-contract-specs': ContractSpecs,
  'c-leverage': Leverage,
  'c-margin-ladder': MarginLadder,
  'c-corn-trade': CornTrade,
  'c-order-calc': OrderCalcFlow,
  'c-robusta-trade': RobustaTrade,
  'c-hedge-farmer': HedgeFarmer,
  'c-costs-stack': CostsStack,
  'c-roll-contango': RollContango,
  'c-four-ways': FourWays,
  'c-drivers-map': DriversMap,
  'c-report-cal': ReportCalendar,
  'c-calendar-spread': CalendarSpread,
  'c-ready-gate': ReadyGate,
};
