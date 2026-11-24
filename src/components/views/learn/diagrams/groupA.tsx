import type { ReactNode } from 'react';
import { Figure, M, S, T, type FigureMap } from './kit';

/* Lesson figures for curriculum levels 1–3. Keys unique across groups, prefixed 'a-'. Theme tokens only. */

type Tone = 'accent' | 'up' | 'down' | 'warn' | 'mute';
const TONE: Record<Tone, string> = { accent: 'var(--accent)', up: 'var(--positive)', down: 'var(--negative)', warn: 'var(--warning)', mute: 'var(--border)' };

/** Greedy word wrap by character budget (SVG has no auto wrap). */
function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if (cur && (cur + ' ' + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push(cur);
  return out;
}

const Defs = () => (
  <defs>
    <marker id="a-arr" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L8 4 L0 8 z" fill="var(--muted)" />
    </marker>
  </defs>
);

function Line({ x1, y1, x2, y2, both }: { x1: number; y1: number; x2: number; y2: number; both?: boolean }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted)" strokeWidth={1.5} markerEnd="url(#a-arr)" markerStart={both ? 'url(#a-arr)' : undefined} />;
}

function Box({ x, y, w, h, tone = 'mute', fill = 'var(--surface)' }: { x: number; y: number; w: number; h: number; tone?: Tone; fill?: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={6} fill={fill} stroke={TONE[tone]} strokeWidth={tone === 'mute' ? 1 : 1.5} />;
}

/** Centered box with a bold head and wrapped lines. Returns nothing but draws; height is fixed by caller. */
function Node({ x, y, w, h, head, lines = [], tone = 'mute' }: { x: number; y: number; w: number; h: number; head: string; lines?: string[]; tone?: Tone }) {
  const top = y + (h - (lines.length ? 16 + lines.length * 13 : 0)) / 2 + 12;
  return (
    <g>
      <Box x={x} y={y} w={w} h={h} tone={tone} />
      <text x={x + w / 2} y={lines.length ? top : y + h / 2 + 4} textAnchor="middle" {...S}>{head}</text>
      {lines.map((l, i) => (
        <text key={i} x={x + w / 2} y={top + 16 + i * 13} textAnchor="middle" {...M}>{l}</text>
      ))}
    </g>
  );
}

/* ---------- generic layouts ---------- */

interface CardSpec { head: string; items: string[]; tone?: Tone }

function Cards({ title, desc, cols = 2, cards }: { title: string; desc: string; cols?: 1 | 2; cards: CardSpec[] }) {
  const W = 360, pad = 8, gap = 10;
  const cw = (W - 2 * pad - gap * (cols - 1)) / cols;
  const maxc = Math.floor((cw - 22) / 5.9);
  const laid = cards.map((c) => {
    const rows = c.items.map((i) => wrap(i, maxc));
    const lines = rows.reduce((n, r) => n + r.length, 0);
    return { c, rows, h: 30 + lines * 13.5 + (rows.length - 1) * 4 + 8 };
  });
  const out: ReactNode[] = [];
  let y = pad;
  for (let r = 0; r < laid.length; r += cols) {
    const row = laid.slice(r, r + cols);
    const rh = Math.max(...row.map((l) => l.h));
    row.forEach((l, i) => {
      const x = pad + i * (cw + gap);
      let ty = y + 34;
      out.push(
        <g key={r + i}>
          <Box x={x} y={y} w={cw} h={rh} />
          <rect x={x} y={y} width={4} height={rh} rx={2} fill={TONE[l.c.tone ?? 'accent']} />
          <text x={x + 12} y={y + 19} {...S}>{l.c.head}</text>
          {l.rows.map((ls, k) => {
            const nodes = ls.map((t, j) => {
              const el = (
                <text key={`${k}-${j}`} x={x + 12 + (j > 0 ? 8 : 0)} y={ty} {...T}>{(j === 0 ? '• ' : '') + t}</text>
              );
              ty += 13.5;
              return el;
            });
            ty += 4;
            return nodes;
          })}
        </g>,
      );
    });
    y += rh + gap;
  }
  const H = y - gap + pad;
  return (
    <Figure title={title} desc={desc} h={H}>
      {out}
    </Figure>
  );
}

interface StepSpec { head: string; text?: string; tone?: Tone }

function Steps({ title, desc, steps }: { title: string; desc: string; steps: StepSpec[] }) {
  const maxc = 44;
  const laid = steps.map((s) => ({ s, ls: s.text ? wrap(s.text, maxc) : [] }));
  const out: ReactNode[] = [];
  let y = 10;
  laid.forEach(({ s, ls }, i) => {
    const h = 20 + ls.length * 13.5;
    const cy = y + 11;
    if (i < laid.length - 1) out.push(<line key={`l${i}`} x1={22} x2={22} y1={cy + 12} y2={y + h + 10 + 0} stroke="var(--border)" strokeWidth={2} />);
    out.push(
      <g key={i}>
        <circle cx={22} cy={cy} r={11} fill="var(--surface)" stroke={TONE[s.tone ?? 'accent']} strokeWidth={1.8} />
        <text x={22} y={cy + 4} textAnchor="middle" {...S} fontSize={11}>{i + 1}</text>
        <text x={42} y={cy + 4} {...S}>{s.head}</text>
        {ls.map((l, k) => (
          <text key={k} x={42} y={cy + 20 + k * 13.5} {...T}>{l}</text>
        ))}
      </g>,
    );
    y += h + 12;
  });
  return (
    <Figure title={title} desc={desc} h={y}>
      {out}
    </Figure>
  );
}

interface FlowNode { head: string; lines?: string[]; tone?: Tone }

function Stack({ title, desc, nodes, note }: { title: string; desc: string; nodes: FlowNode[]; note?: string }) {
  const w = 280, x = 40, gap = 20;
  let y = 8;
  const out: ReactNode[] = [];
  nodes.forEach((n, i) => {
    const h = 30 + (n.lines?.length ?? 0) * 13;
    out.push(<Node key={i} x={x} y={y} w={w} h={h} head={n.head} lines={n.lines} tone={n.tone} />);
    if (i < nodes.length - 1) out.push(<Line key={`a${i}`} x1={180} y1={y + h} x2={180} y2={y + h + gap - 2} />);
    y += h + gap;
  });
  y -= gap;
  if (note) {
    wrap(note, 56).forEach((l, i) => out.push(<text key={`n${i}`} x={180} y={y + 20 + i * 13} textAnchor="middle" {...M}>{l}</text>));
    y += 14 + wrap(note, 56).length * 13;
  }
  return (
    <Figure title={title} desc={desc} h={y + 12}>
      <Defs />
      {out}
    </Figure>
  );
}

/* ---------- Level 1 ---------- */

function CommodityGroups() {
  return (
    <Cards
      cols={1}
      title="Ba nhóm hàng hoá chính trên thị trường phái sinh"
      desc="Nông sản như ngô, đậu tương, cà phê, đường; kim loại như vàng, bạc, đồng; năng lượng như dầu thô và khí tự nhiên. Mỗi nhóm có yếu tố ảnh hưởng giá riêng."
      cards={[
        { head: 'Nông sản', tone: 'accent', items: ['Ngô, đậu tương, cà phê, đường...', 'Thời tiết, mùa vụ, tồn kho, chính sách'] },
        { head: 'Kim loại', tone: 'warn', items: ['Vàng, bạc, đồng...', 'Lãi suất, đồng USD, nhu cầu công nghiệp'] },
        { head: 'Năng lượng', tone: 'up', items: ['Dầu thô, khí tự nhiên', 'Sản lượng, tồn kho, thời tiết, địa chính trị'] },
      ]}
    />
  );
}

function SupplyDemand() {
  return (
    <Stack
      title="Cung và cầu quyết định giá (ví dụ cà phê)"
      desc="Chuỗi nhân quả: hạn hán, sản lượng cà phê giảm, nguồn cung giảm, giá có xu hướng tăng. Đây là quan hệ cung cầu, không phải lời hứa giá sẽ tăng."
      nodes={[
        { head: 'Hạn hán kéo dài', tone: 'warn' },
        { head: 'Sản lượng cà phê giảm', tone: 'mute' },
        { head: 'Nguồn cung giảm', tone: 'mute' },
        { head: 'Giá có xu hướng tăng', tone: 'up' },
      ]}
      note="Quan hệ cung–cầu cơ bản, không phải lời hứa giá sẽ tăng."
    />
  );
}

function SpotForwardFutures() {
  return (
    <Cards
      cols={1}
      title="Giao ngay, forward và futures"
      desc="Giao ngay: mua bán và giao hàng gần như tức thời. Forward: hai bên tự thoả thuận, không qua sàn nên có rủi ro đối tác. Futures: hợp đồng chuẩn hoá trên sàn, có trung tâm bù trừ."
      cards={[
        { head: 'Giao ngay (spot)', tone: 'mute', items: ['Mua bán, giao hàng gần như tức thời ở giá hiện tại'] },
        { head: 'Forward', tone: 'warn', items: ['Hai bên tự thoả thuận giá, giao trong tương lai', 'Không qua sàn: có rủi ro đối tác không thực hiện'] },
        { head: 'Futures', tone: 'up', items: ['Chuẩn hoá khối lượng, chất lượng, tháng giao', 'Giao dịch trên sàn, có trung tâm bù trừ ở giữa'] },
      ]}
    />
  );
}

function ClearingFlow() {
  return (
    <Figure
      title="Trung tâm bù trừ đứng giữa người mua và người bán"
      desc="Người mua và người bán không đối mặt trực tiếp mà cùng giao dịch với trung tâm bù trừ. Lãi lỗ được tính lại hằng ngày theo giá thanh toán."
      h={196}
    >
      <Defs />
      <Node x={8} y={30} w={96} h={56} head="Người mua" lines={['(long)']} tone="up" />
      <Node x={132} y={30} w={96} h={56} head="Bù trừ" lines={['đứng giữa']} tone="accent" />
      <Node x={256} y={30} w={96} h={56} head="Người bán" lines={['(short)']} tone="down" />
      <Line x1={104} y1={58} x2={132} y2={58} both />
      <Line x1={228} y1={58} x2={256} y2={58} both />
      <text x={180} y={20} textAnchor="middle" {...M}>Giao dịch trên sàn (hợp đồng chuẩn hoá)</text>
      <Box x={8} y={112} w={344} h={72} tone="mute" />
      <text x={20} y={132} {...S}>Mỗi ngày: mark-to-market</text>
      <text x={20} y={150} {...T}>Giá thanh toán đổi → bên có lãi được ghi có,</text>
      <text x={20} y={164} {...T}>bên có lỗ bị trừ tiền ký quỹ, ngay trong ngày.</text>
      <text x={20} y={178} {...M}>Phần lớn người chơi đóng vị thế trước đáo hạn.</text>
    </Figure>
  );
}

function SpecCard() {
  const rows: [string, string][] = [
    ['Sản phẩm', 'Ngô CBOT (ZC)'],
    ['Khối lượng 1 hợp đồng', '5.000 bushel'],
    ['Tick (bước giá nhỏ nhất)', '0,25 cent/bushel'],
    ['Giá trị 1 tick', '12,5 USD'],
    ['Ví dụ mã hợp đồng', 'ZCZ6 = ngô, tháng 12/2026'],
  ];
  return (
    <Figure
      title="Đọc thẻ đặc tả hợp đồng ngô ZC"
      desc="Thẻ đặc tả: khối lượng 5.000 bushel, tick 0,25 cent mỗi bushel, giá trị tick 12,5 USD, bằng 5.000 nhân 0,0025 USD."
      h={228}
    >
      <Box x={8} y={8} w={344} h={212} tone="accent" />
      {rows.map(([k, v], i) => (
        <g key={k}>
          <text x={20} y={34 + i * 28} {...M}>{k}</text>
          <text x={340} y={34 + i * 28} textAnchor="end" {...S}>{v}</text>
          <line x1={20} x2={340} y1={42 + i * 28} y2={42 + i * 28} stroke="var(--border)" />
        </g>
      ))}
      <rect x={20} y={168} width={320} height={42} rx={6} fill="var(--surface-2)" stroke="var(--accent)" />
      <text x={180} y={186} textAnchor="middle" {...T}>Giá trị tick = khối lượng × tick</text>
      <text x={180} y={202} textAnchor="middle" {...S}>5.000 × 0,0025 USD = 12,5 USD</text>
    </Figure>
  );
}

const MONTHS: [string, number][] = [['F', 1], ['G', 2], ['H', 3], ['J', 4], ['K', 5], ['M', 6], ['N', 7], ['Q', 8], ['U', 9], ['V', 10], ['X', 11], ['Z', 12]];

function MonthCodes() {
  return (
    <Figure
      title="Mã tháng đáo hạn: F G H J K M N Q U V X Z"
      desc="Mười hai chữ cái ứng với tháng 1 đến tháng 12. Ví dụ ZCZ6 gồm ZC là ngô, Z là tháng 12, 6 là năm 2026."
      h={196}
    >
      {MONTHS.map(([c, n], i) => {
        const x = 8 + (i % 6) * 58, y = 8 + Math.floor(i / 6) * 58;
        const hi = c === 'Z';
        return (
          <g key={c}>
            <Box x={x} y={y} w={52} h={50} tone={hi ? 'accent' : 'mute'} />
            <text x={x + 26} y={y + 26} textAnchor="middle" {...S} fontSize={18}>{c}</text>
            <text x={x + 26} y={y + 42} textAnchor="middle" {...M}>Tháng {n}</text>
          </g>
        );
      })}
      <Box x={8} y={128} w={344} h={58} tone="accent" />
      <text x={180} y={148} textAnchor="middle" {...M}>Ví dụ đọc mã</text>
      <text x={180} y={168} textAnchor="middle" {...S} fontSize={15}>ZC · Z · 6</text>
      <text x={180} y={182} textAnchor="middle" {...T}>ngô · tháng 12 · năm 2026</text>
    </Figure>
  );
}

function LeverageBars() {
  // 22.500 USD ↔ 300px; 1.500 USD ↔ 20px
  return (
    <Figure
      title="Ký quỹ nhỏ, giá trị hợp đồng lớn: đòn bẩy 15 lần (số minh hoạ)"
      desc="Giá ngô 450 cent, một hợp đồng 5.000 bushel có giá trị danh nghĩa 22.500 USD. Ký quỹ giả định 1.500 USD, bằng một phần mười lăm. Giá giảm 3 phần trăm là lỗ 675 USD, bằng 45 phần trăm ký quỹ."
      h={236}
    >
      <text x={20} y={22} {...M}>Giá trị danh nghĩa (450 cent × 5.000 bushel)</text>
      <rect x={20} y={30} width={320} height={26} rx={4} fill="var(--surface)" stroke="var(--accent)" strokeWidth={1.5} />
      <text x={180} y={48} textAnchor="middle" {...S}>22.500 USD</text>
      <text x={20} y={80} {...M}>Ký quỹ bạn nộp (giả định)</text>
      <rect x={20} y={88} width={21.3} height={26} rx={4} fill="var(--warning)" fillOpacity={0.35} stroke="var(--warning)" strokeWidth={1.5} />
      <text x={50} y={106} {...S}>1.500 USD</text>
      <text x={20} y={138} {...T}>Đòn bẩy = 22.500 ÷ 1.500 = 15 lần</text>
      <Box x={8} y={152} w={344} h={76} tone="down" />
      <text x={20} y={172} {...S}>Giá đi ngược 3%</text>
      <text x={20} y={190} {...T}>Lỗ = 22.500 × 3% = 675 USD</text>
      <text x={20} y={208} {...T}>675 ÷ 1.500 = 45% ký quỹ đã mất</text>
      <text x={20} y={222} {...M}>Giá đi thuận 3% cũng lãi 675 USD: đòn bẩy khuếch đại hai chiều.</text>
    </Figure>
  );
}

function MarginSteps() {
  return (
    <Steps
      title="Ký quỹ ban đầu, duy trì và gọi ký quỹ"
      desc="Bốn bước: nộp ký quỹ ban đầu, giá đi ngược làm tiền giảm, tiền xuống dưới mức duy trì thì bị gọi ký quỹ, không bổ sung kịp thì có thể bị thanh lý bắt buộc."
      steps={[
        { head: 'Nộp ký quỹ ban đầu', text: 'Khoản đảm bảo để mở vị thế, không phải phí và không phải giá mua.', tone: 'accent' },
        { head: 'Giá đi ngược, tiền trong tài khoản giảm', text: 'Lỗ được trừ vào số dư mỗi ngày (mark-to-market).', tone: 'down' },
        { head: 'Số dư xuống dưới mức duy trì', text: 'Bạn bị gọi ký quỹ: phải nộp bổ sung.', tone: 'warn' },
        { head: 'Không bổ sung kịp', text: 'Vị thế có thể bị thanh lý bắt buộc.', tone: 'down' },
      ]}
    />
  );
}

function LongShort() {
  return (
    <Figure
      title="Lãi lỗ của vị thế mua (long) và bán (short)"
      desc="Đồ thị lãi lỗ theo giá. Vị thế mua có lãi khi giá tăng, đường màu xanh dương đi lên. Vị thế bán có lãi khi giá giảm, đường màu cam đi xuống. Hai đường cắt nhau tại giá vào lệnh."
      h={236}
    >
      <text x={20} y={20} fill="var(--positive)" fontSize={11} fontWeight={600}>━ Mua (long): lãi khi giá tăng</text>
      <text x={20} y={37} fill="var(--negative)" fontSize={11} fontWeight={600}>━ Bán (short): lãi khi giá giảm</text>
      <line x1={36} x2={344} y1={134} y2={134} stroke="var(--muted)" strokeDasharray="4 3" />
      <line x1={190} x2={190} y1={56} y2={212} stroke="var(--border)" />
      <line x1={40} y1={196} x2={340} y2={72} stroke="var(--positive)" strokeWidth={3} />
      <line x1={40} y1={72} x2={340} y2={196} stroke="var(--negative)" strokeWidth={3} />
      <circle cx={190} cy={134} r={5} fill="var(--accent)" />
      <text x={8} y={74} {...M}>Lãi</text>
      <text x={8} y={206} {...M}>Lỗ</text>
      <text x={196} y={208} {...M}>Giá vào lệnh</text>
      <text x={40} y={226} {...M}>← giá giảm</text>
      <text x={340} y={226} textAnchor="end" {...M}>giá tăng →</text>
    </Figure>
  );
}

function PnlWorked() {
  return (
    <Steps
      title="Ví dụ: mua 2 hợp đồng ngô ZC, giá giảm 6 cent"
      desc="Giá giảm 6 cent là 24 tick. Mỗi tick 12,5 USD nên một hợp đồng lỗ 300 USD. Hai hợp đồng lỗ 600 USD, chưa gồm phí và trượt giá."
      steps={[
        { head: 'Số tick: 6 cent ÷ 0,25 = 24 tick', tone: 'accent' },
        { head: 'Mỗi hợp đồng: 24 × 12,5 USD = 300 USD', tone: 'accent' },
        { head: 'Hai hợp đồng: 300 × 2 = 600 USD', text: 'Mua (long) mà giá giảm nên là lỗ 600 USD.', tone: 'down' },
        { head: 'Chưa gồm phí và trượt giá', text: 'Kết quả thực tế có thể kém hơn con số này.', tone: 'warn' },
      ]}
    />
  );
}

function ExpiryTimeline() {
  const xs = [36, 128, 236, 324];
  return (
    <Figure
      title="Vòng đời hợp đồng: đóng hoặc roll trước FND"
      desc="Dòng thời gian: mở vị thế, đóng hoặc roll sang tháng sau trước FND, ngày FND bên bán có thể thông báo giao hàng, rồi ngày giao dịch cuối LTD."
      h={190}
    >
      <rect x={xs[0]} y={46} width={xs[1] - xs[0]} height={10} rx={5} fill="var(--accent)" fillOpacity={0.35} />
      <rect x={xs[1]} y={46} width={xs[2] - xs[1]} height={10} rx={5} fill="var(--warning)" fillOpacity={0.4} />
      <rect x={xs[2]} y={46} width={xs[3] - xs[2]} height={10} rx={5} fill="var(--negative)" fillOpacity={0.4} />
      {[
        ['Mở vị thế', 'kỳ gần', 'accent'],
        ['Đóng hoặc roll', 'trước FND', 'accent'],
        ['FND', 'bên bán có thể', 'warn'],
        ['LTD', 'ngày giao dịch', 'down'],
      ].map(([a, b, t], i) => (
        <g key={a}>
          <circle cx={xs[i]} cy={51} r={7} fill="var(--surface)" stroke={TONE[t as Tone]} strokeWidth={2.5} />
          <text x={xs[i]} y={80} textAnchor="middle" {...S} fontSize={11}>{a}</text>
          <text x={xs[i]} y={94} textAnchor="middle" {...M}>{b}</text>
        </g>
      ))}
      <text x={xs[2]} y={106} textAnchor="middle" {...M}>thông báo giao</text>
      <text x={xs[2]} y={118} textAnchor="middle" {...M}>hàng</text>
      <text x={xs[3]} y={106} textAnchor="middle" {...M}>cuối cùng</text>
      <text x={(xs[0] + xs[1]) / 2} y={30} textAnchor="middle" {...M}>giữ vị thế</text>
      <text x={(xs[1] + xs[2]) / 2} y={30} textAnchor="middle" {...M}>vùng cần chú ý</text>
      <Box x={8} y={132} w={344} h={50} tone="warn" />
      <text x={20} y={152} {...T}>Nhà đầu cơ không muốn giao nhận hàng thật nên</text>
      <text x={20} y={168} {...T}>thường xong trước FND. Ngày chính xác: hỏi MXV/môi giới.</text>
    </Figure>
  );
}

function RollSteps() {
  return (
    <Steps
      title="Roll 2 hợp đồng ngô mua (giá minh hoạ)"
      desc="Roll là bán tháng gần ở 450 và mua tháng xa ở 455. Chênh 5 cent, mỗi cent của một hợp đồng ngô là 50 USD, nên hai hợp đồng tốn 500 USD khi thị trường ở contango."
      steps={[
        { head: 'Bán đóng tháng gần ở 450 cent', tone: 'down' },
        { head: 'Mua mở tháng xa ở 455 cent', tone: 'up' },
        { head: 'Chênh lệch: 455 − 450 = 5 cent', text: '1 cent × 5.000 bushel = 50 USD mỗi hợp đồng.', tone: 'accent' },
        { head: 'Chi phí roll: 5 × 50 × 2 = 500 USD', text: 'Contango tốn chi phí cho vị thế mua; backwardation thì có lợi.', tone: 'warn' },
      ]}
    />
  );
}

function HedgerSpecCards() {
  return (
    <Cards
      title="Nhà phòng hộ và nhà đầu cơ"
      desc="Nhà phòng hộ có hàng thật và dùng futures để khoá giá. Nhà đầu cơ nhận rủi ro giá để tìm lợi nhuận và tạo thanh khoản."
      cards={[
        { head: 'Phòng hộ', tone: 'accent', items: ['Có hàng thật: nông dân, nhà nhập khẩu, nhà chế biến', 'Muốn khoá giá, giảm rủi ro biến động'] },
        { head: 'Đầu cơ', tone: 'warn', items: ['Chấp nhận rủi ro giá để tìm lợi nhuận', 'Đóng góp thanh khoản cho thị trường'] },
      ]}
    />
  );
}

function RiskTransfer() {
  return (
    <Figure
      title="Hai nhóm cần nhau: chuyển rủi ro và nhận rủi ro"
      desc="Nhà phòng hộ chuyển rủi ro giá sang nhà đầu cơ qua hợp đồng tương lai; nhà đầu cơ nhận rủi ro và tạo thanh khoản. Nhận rủi ro không có nghĩa là có lợi thế."
      h={150}
    >
      <Defs />
      <Node x={8} y={30} w={110} h={64} head="Phòng hộ" lines={['có hàng thật']} tone="accent" />
      <Node x={242} y={30} w={110} h={64} head="Đầu cơ" lines={['nhận rủi ro']} tone="warn" />
      <text x={180} y={44} textAnchor="middle" {...M}>chuyển rủi ro giá</text>
      <Line x1={122} y1={50} x2={238} y2={50} />
      <text x={180} y={86} textAnchor="middle" {...M}>thanh khoản</text>
      <Line x1={238} y1={70} x2={122} y2={70} />
      <text x={180} y={124} textAnchor="middle" {...T}>Qua hợp đồng tương lai trên sàn</text>
      <text x={180} y={140} textAnchor="middle" {...M}>Nhận rủi ro không có nghĩa là có lợi thế.</text>
    </Figure>
  );
}

/* ---------- Level 2 ---------- */

function MxvEcosystem() {
  return (
    <Stack
      title="Đường đi của lệnh: nhà đầu tư, thành viên, MXV, sàn quốc tế"
      desc="Nhà đầu tư giao dịch qua thành viên môi giới của MXV. MXV là sở giao dịch hàng hoá tại Việt Nam, liên thông với các sàn quốc tế như CME Group, ICE, LME, SGX, OSE và Bursa Malaysia Derivatives."
      nodes={[
        { head: 'Nhà đầu tư', lines: ['mở tài khoản, nộp ký quỹ'], tone: 'accent' },
        { head: 'Thành viên môi giới', lines: ['được MXV cấp phép, nhận lệnh của bạn'], tone: 'warn' },
        { head: 'MXV', lines: ['Sở Giao dịch Hàng hoá Việt Nam'], tone: 'up' },
        { head: 'Sàn quốc tế (liên thông)', lines: ['CME, ICE, LME, SGX, OSE, Bursa Malaysia'], tone: 'mute' },
      ]}
      note="Danh mục hợp đồng có thể thay đổi: xem trang chính thức của MXV."
    />
  );
}

function MxvVsHnx() {
  return (
    <Cards
      title="MXV khác HNX"
      desc="MXV là sàn giao dịch hàng hoá. HNX là Sở Giao dịch Chứng khoán Hà Nội, niêm yết chứng khoán phái sinh như hợp đồng tương lai VN30 và trái phiếu Chính phủ."
      cards={[
        { head: 'MXV', tone: 'accent', items: ['Hàng hoá', 'Liên thông CME, ICE, SGX...', 'Bộ Công Thương quản lý'] },
        { head: 'HNX', tone: 'mute', items: ['Chứng khoán phái sinh', 'Hợp đồng tương lai VN30, trái phiếu Chính phủ'] },
      ]}
    />
  );
}

function BrokerCheck() {
  return (
    <Steps
      title="Kiểm tra thành viên môi giới trước khi nộp tiền"
      desc="Ba bước: tìm tên công ty trong danh sách thành viên trên website MXV, đối chiếu thay vì tin quảng cáo, và chỉ nộp tiền theo hợp đồng chứ không chuyển vào tài khoản cá nhân."
      steps={[
        { head: 'Mở danh sách thành viên trên website MXV', text: 'Tìm đúng tên pháp lý của công ty.', tone: 'accent' },
        { head: 'Đối chiếu, không chỉ tin quảng cáo', text: 'Không có tên trong danh sách: dừng lại.', tone: 'warn' },
        { head: 'Đọc kỹ hợp đồng và biểu phí', text: 'Không chuyển tiền vào tài khoản cá nhân.', tone: 'down' },
      ]}
    />
  );
}

function BrokerFlags() {
  return (
    <Cards
      title="Dấu hiệu an toàn hơn và dấu hiệu cảnh báo"
      desc="Dấu hiệu an toàn hơn: tên công ty có trong danh sách thành viên MXV, biểu phí rõ ràng. Dấu hiệu cảnh báo: không có tên trong danh sách, hứa hẹn lợi nhuận, yêu cầu chuyển tiền vào tài khoản cá nhân."
      cards={[
        { head: 'An toàn hơn', tone: 'up', items: ['Tên có trong danh sách thành viên MXV', 'Hợp đồng, biểu phí bằng văn bản'] },
        { head: 'Cảnh báo', tone: 'down', items: ['Không có tên trong danh sách', 'Hứa hẹn lợi nhuận', 'Đòi chuyển tiền vào tài khoản cá nhân'] },
      ]}
    />
  );
}

function TimeShift() {
  const X = (h: number) => 16 + (h * 328) / 24;
  return (
    <Figure
      title="Giờ Mỹ đổi theo mùa, giờ Việt Nam thì không"
      desc="Thước 24 giờ theo giờ Việt Nam. Lúc 9 giờ sáng tại New York, giờ Việt Nam là 20 giờ khi Mỹ dùng giờ mùa hè và 21 giờ khi dùng giờ mùa đông."
      h={206}
    >
      <line x1={16} x2={344} y1={110} y2={110} stroke="var(--border)" strokeWidth={2} />
      {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
        <g key={h}>
          <line x1={X(h)} x2={X(h)} y1={104} y2={116} stroke="var(--muted)" />
          <text x={X(h)} y={132} textAnchor="middle" {...M}>{h}h</text>
        </g>
      ))}
      <text x={180} y={150} textAnchor="middle" {...M}>Giờ Việt Nam (UTC+7, không đổi giờ)</text>
      <text x={16} y={18} {...S}>Ví dụ: 9:00 sáng tại New York</text>
      <circle cx={X(20)} cy={110} r={6} fill="var(--accent)" />
      <text x={X(20) - 28} y={64} textAnchor="middle" {...T}>Mùa hè Mỹ</text>
      <text x={X(20) - 28} y={78} textAnchor="middle" {...S}>20:00 VN</text>
      <line x1={X(20)} x2={X(20)} y1={84} y2={103} stroke="var(--accent)" />
      <circle cx={X(21)} cy={110} r={6} fill="var(--warning)" />
      <text x={X(21) - 24} y={34} textAnchor="middle" {...T}>Mùa đông Mỹ</text>
      <text x={X(21) - 24} y={48} textAnchor="middle" {...S}>21:00 VN</text>
      <line x1={X(21)} x2={X(21)} y1={54} y2={103} stroke="var(--warning)" />
      <text x={180} y={180} textAnchor="middle" {...T}>Chênh 11 giờ (giờ mùa hè) hoặc 12 giờ (giờ mùa đông)</text>
      <text x={180} y={196} textAnchor="middle" {...M}>Giờ mở/đóng cửa từng mã: tra lịch của MXV/môi giới.</text>
    </Figure>
  );
}

function FxFlow() {
  return (
    <Figure
      title="Từ USD sang VND: 1 tick ngô ZC"
      desc="Một tick ngô là 12,5 USD. Nhân với tỷ giá minh hoạ 25.000 VND mỗi USD được 312.500 VND."
      h={170}
    >
      <Node x={4} y={30} w={100} h={62} head="12,5 USD" lines={['1 tick ngô ZC']} tone="accent" />
      <text x={116} y={66} textAnchor="middle" {...S} fontSize={16}>×</text>
      <Node x={128} y={30} w={104} h={62} head="25.000" lines={['VND/USD', '(giả định)']} tone="warn" />
      <text x={244} y={66} textAnchor="middle" {...S} fontSize={16}>=</text>
      <Node x={256} y={30} w={100} h={62} head="312.500" lines={['VND mỗi tick']} tone="up" />
      <text x={180} y={118} textAnchor="middle" {...T}>Tỷ giá thật do thành viên/sàn áp dụng.</text>
      <text x={180} y={134} textAnchor="middle" {...T}>Giá niêm yết bằng USD, ký quỹ nộp bằng VND:</text>
      <text x={180} y={150} textAnchor="middle" {...T}>tỷ giá là một lớp rủi ro nữa.</text>
    </Figure>
  );
}

function FeeList() {
  return (
    <Cards
      title="Các loại phí cần hỏi thành viên môi giới"
      desc="Phí giao dịch mỗi lot, phí dữ liệu giá, phí qua đêm hoặc phí khác nếu có. Mức phí khác nhau giữa các thành viên, hãy hỏi bằng văn bản."
      cards={[
        { head: 'Phí giao dịch', tone: 'accent', items: ['Mỗi lot, thường cố định'] },
        { head: 'Phí dữ liệu giá', tone: 'accent', items: ['Xem giá thời gian thực hay chậm'] },
        { head: 'Phí khác', tone: 'warn', items: ['Qua đêm hoặc phí khác nếu có'] },
        { head: 'Trượt giá', tone: 'down', items: ['Không phải phí, nhưng làm lãi lỗ lệch'] },
      ]}
    />
  );
}

function AccountSteps() {
  return (
    <Steps
      title="Các bước mở tài khoản điển hình"
      desc="Chọn thành viên, đăng ký và ký hợp đồng, xác thực danh tính, nộp ký quỹ, nhận tài khoản và phần mềm giao dịch. Thủ tục cụ thể do từng thành viên quy định."
      steps={[
        { head: 'Chọn thành viên của MXV', tone: 'accent' },
        { head: 'Đăng ký mở tài khoản, ký hợp đồng', text: 'Đọc kỹ biểu phí, quy tắc ký quỹ/thanh lý, quy định đóng/roll trước FND, cách rút tiền.', tone: 'warn' },
        { head: 'Xác thực danh tính', tone: 'accent' },
        { head: 'Nộp ký quỹ', tone: 'accent' },
        { head: 'Nhận tài khoản và phần mềm giao dịch', text: 'Giấy tờ, điều kiện cụ thể do từng thành viên quy định.', tone: 'up' },
      ]}
    />
  );
}

function LegalMap() {
  return (
    <Cards
      cols={1}
      title="Bản đồ văn bản pháp lý (theo bài học, cần đối chiếu văn bản gốc)"
      desc="NĐ 158/2020 về chứng khoán phái sinh của HNX. Giao dịch hàng hoá qua Sở Giao dịch Hàng hoá trước đây theo NĐ 158/2006 và NĐ 51/2018. NĐ 302/2026 hiệu lực 15/09/2026 và chấm dứt hiệu lực hai nghị định cũ, kèm Thông tư 47/2026."
      cards={[
        { head: 'Chứng khoán phái sinh (HNX)', tone: 'mute', items: ['NĐ 158/2020/NĐ-CP: không phải khung riêng của hàng hoá MXV'] },
        { head: 'Hàng hoá, trước đây', tone: 'warn', items: ['NĐ 158/2006/NĐ-CP và NĐ 51/2018/NĐ-CP'] },
        { head: 'Hàng hoá, hiện hành theo nguồn đối chiếu', tone: 'up', items: ['NĐ 302/2026/NĐ-CP: ban hành 01/08/2026, hiệu lực 15/09/2026', 'Thông tư 47/2026/TT-BCT hướng dẫn thi hành'] },
      ]}
    />
  );
}

/* ---------- Level 3 ---------- */

function CornUses() {
  return (
    <Stack
      title="Ngô dùng để làm gì?"
      desc="Ngô dùng cho chăn nuôi, sản xuất ethanol và xuất khẩu. Mỹ là nước sản xuất và xuất khẩu lớn."
      nodes={[
        { head: 'Ngô (ZC)', lines: ['Mỹ là nước sản xuất và xuất khẩu lớn'], tone: 'accent' },
        { head: 'Chăn nuôi · Ethanol · Xuất khẩu', lines: ['ba nhóm nhu cầu chính'], tone: 'up' },
      ]}
      note="Việt Nam nhập khẩu ngô và lúa mì cho thức ăn chăn nuôi và bột mì."
    />
  );
}

function GrainCalendar() {
  return (
    <Figure
      title="Lịch tham chiếu cho ngô: thời tiết vụ hè và báo cáo WASDE"
      desc="Dải 12 tháng. Tháng 6 đến tháng 8 được tô nổi bật là giai đoạn thời tiết vụ hè của ngô rất quan trọng. Báo cáo WASDE công bố hằng tháng."
      h={170}
    >
      {Array.from({ length: 12 }, (_, i) => {
        const m = i + 1, x = 8 + i * 28.5, hot = m >= 6 && m <= 8;
        return (
          <g key={m}>
            <rect x={x} y={32} width={27} height={34} rx={4} fill={hot ? 'var(--warning)' : 'var(--surface)'} fillOpacity={hot ? 0.4 : 1} stroke={hot ? 'var(--warning)' : 'var(--border)'} />
            <text x={x + 13.5} y={54} textAnchor="middle" {...T}>T{m}</text>
            <circle cx={x + 13.5} cy={82} r={3.5} fill="var(--accent)" />
          </g>
        );
      })}
      <text x={8} y={20} {...S}>12 tháng trong năm</text>
      <text x={8} y={106} {...T}>● WASDE (USDA): công bố hằng tháng</text>
      <text x={8} y={124} {...T}>Vùng tô vàng (T6–T8): thời tiết vụ hè của ngô rất quan trọng</text>
      <text x={8} y={144} {...M}>Lịch báo cáo cụ thể: xem usda.gov. Không dự đoán giá từ lịch.</text>
    </Figure>
  );
}

function SoyCrush() {
  return (
    <Figure
      title="Bộ ba đậu tương: ép đậu tương ra khô đậu và dầu"
      desc="Đậu tương ZS được ép thành khô đậu ZM dùng làm thức ăn chăn nuôi và dầu đậu tương ZL dùng thực phẩm và nhiên liệu sinh học. Biên ép là chênh lệch giữa giá đậu tương và giá hai sản phẩm."
      h={212}
    >
      <Defs />
      <Node x={110} y={8} w={140} h={44} head="Đậu tương (ZS)" tone="accent" />
      <text x={180} y={74} textAnchor="middle" {...M}>ép</text>
      <Line x1={150} y1={52} x2={90} y2={92} />
      <Line x1={210} y1={52} x2={270} y2={92} />
      <Node x={8} y={94} w={166} h={62} head="Khô đậu (ZM)" lines={['thức ăn chăn nuôi']} tone="up" />
      <Node x={186} y={94} w={166} h={62} head="Dầu đậu tương (ZL)" lines={['thực phẩm, nhiên liệu sinh học']} tone="warn" />
      <Box x={8} y={168} w={344} h={38} tone="mute" />
      <text x={180} y={185} textAnchor="middle" {...T}>Biên ép: chênh lệch giữa giá đậu tương</text>
      <text x={180} y={199} textAnchor="middle" {...T}>và giá hai sản phẩm.</text>
    </Figure>
  );
}

function CoffeeCompare() {
  return (
    <Cards
      title="Arabica (KC) và robusta (RC)"
      desc="Arabica niêm yết ICE US, chủ yếu từ Brazil và Colombia, mùa thu hoạch Brazil khoảng giữa năm. Robusta niêm yết ICE Europe, chủ yếu từ Việt Nam, Brazil, Indonesia, thu hoạch Việt Nam khoảng cuối năm."
      cards={[
        { head: 'Arabica · KC', tone: 'accent', items: ['Sàn: ICE US', 'Nguồn: Brazil, Colombia', 'Thu hoạch Brazil: khoảng giữa năm', 'Sương giá ở Brazil'] },
        { head: 'Robusta · RC', tone: 'warn', items: ['Sàn: ICE Europe', 'Nguồn: Việt Nam, Brazil, Indonesia', 'Thu hoạch Việt Nam: khoảng cuối năm', 'Hạn hán/mưa lớn ở Tây Nguyên'] },
      ]}
    />
  );
}

function SoftsCards() {
  return (
    <Cards
      title="Bốn mặt hàng mềm: yếu tố riêng"
      desc="Đường: Brazil, liên quan ethanol và dầu thô. Ca cao: Tây Phi, thời tiết và bệnh cây. Bông: Mỹ, Trung Quốc, Ấn Độ, ngành dệt may. Cao su: Việt Nam là nước sản xuất lớn."
      cards={[
        { head: 'Đường · SB', tone: 'accent', items: ['Brazil sản xuất lớn', 'Giá liên quan ethanol, dầu thô'] },
        { head: 'Ca cao · CC', tone: 'warn', items: ['Tây Phi: Bờ Biển Ngà, Ghana', 'Thời tiết, bệnh cây'] },
        { head: 'Bông · CT', tone: 'up', items: ['Mỹ, Trung Quốc, Ấn Độ', 'Nhu cầu dệt may'] },
        { head: 'Cao su', tone: 'mute', items: ['Việt Nam sản xuất lớn', 'Quy cách: kiểm tra với MXV'] },
      ]}
    />
  );
}

function PreciousCards() {
  return (
    <Cards
      cols={1}
      title="Vàng, bạc, bạch kim: điều gì tác động giá"
      desc="Vàng thường được coi là tài sản trú ẩn, chịu ảnh hưởng của lãi suất thực, đồng USD, ngân hàng trung ương và tâm lý rủi ro. Bạc vừa đầu tư vừa công nghiệp nên biến động mạnh hơn. Bạch kim liên quan ngành ô tô và nguồn cung hạn chế."
      cards={[
        { head: 'Vàng · GC', tone: 'warn', items: ['Tài sản trú ẩn: lãi suất thực, USD, ngân hàng trung ương, tâm lý rủi ro'] },
        { head: 'Bạc · SI', tone: 'mute', items: ['Vừa đầu tư vừa công nghiệp nên biến động mạnh hơn vàng'] },
        { head: 'Bạch kim · PL', tone: 'accent', items: ['Ngành ô tô (xúc tác khí thải), nguồn cung hạn chế'] },
      ]}
    />
  );
}

function CopperChain() {
  return (
    <Stack
      title="Nhu cầu Trung Quốc và chuỗi kim loại công nghiệp"
      desc="Nhu cầu và sản xuất thép của Trung Quốc ảnh hưởng giá quặng sắt và đồng. Quặng sắt là nguyên liệu chính của thép. Ngành thép Việt Nam phụ thuộc nguyên liệu nhập khẩu."
      nodes={[
        { head: 'Xây dựng, điện, ô tô, bất động sản', lines: ['nhu cầu của Trung Quốc rất lớn'], tone: 'accent' },
        { head: 'Đồng (HG) · Quặng sắt (TIO, FEF)', lines: ['đồng: phong vũ biểu kinh tế', 'quặng sắt: nguyên liệu chính của thép'], tone: 'warn' },
        { head: 'Giá thép, chi phí sản xuất', lines: ['Việt Nam nhập nguyên liệu nên chịu tác động'], tone: 'mute' },
      ]}
    />
  );
}

function WtiBrent() {
  return (
    <Cards
      title="WTI và Brent"
      desc="WTI niêm yết NYMEX là chuẩn của Mỹ. Brent niêm yết ICE là chuẩn quốc tế phổ biến. Hai giá thường đi cùng nhau nhưng có chênh lệch. Báo cáo tồn kho dầu hằng tuần của EIA."
      cards={[
        { head: 'WTI · CL', tone: 'accent', items: ['Sàn NYMEX', 'Chuẩn của Mỹ'] },
        { head: 'Brent · BRN', tone: 'warn', items: ['Sàn ICE', 'Chuẩn quốc tế phổ biến'] },
        { head: 'Yếu tố chung', tone: 'mute', items: ['OPEC+, dầu đá phiến Mỹ', 'Nhu cầu, địa chính trị, USD'] },
        { head: 'Báo cáo', tone: 'up', items: ['Tồn kho dầu hằng tuần của EIA và API'] },
      ]}
    />
  );
}

function GasSeason() {
  return (
    <Cards
      title="Khí tự nhiên: hai mùa nhu cầu"
      desc="Mùa đông lạnh tăng nhu cầu sưởi. Mùa hè nóng tăng nhu cầu điện làm mát. Tồn kho hằng tuần của EIA được so sánh với mức trung bình nhiều năm."
      cards={[
        { head: 'Mùa đông lạnh', tone: 'up', items: ['Tăng nhu cầu sưởi'] },
        { head: 'Mùa hè nóng', tone: 'warn', items: ['Tăng nhu cầu điện làm mát'] },
        { head: 'Báo cáo EIA hằng tuần', tone: 'accent', items: ['So tồn kho với mức trung bình nhiều năm'] },
        { head: 'Rủi ro', tone: 'down', items: ['Biến động rất mạnh trong thời gian ngắn'] },
      ]}
    />
  );
}

export const FIGURES_A: FigureMap = {
  'a-commodity-groups': CommodityGroups,
  'a-supply-demand': SupplyDemand,
  'a-spot-forward-futures': SpotForwardFutures,
  'a-clearing-flow': ClearingFlow,
  'a-spec-card': SpecCard,
  'a-month-codes': MonthCodes,
  'a-leverage-bars': LeverageBars,
  'a-margin-steps': MarginSteps,
  'a-long-short': LongShort,
  'a-pnl-worked': PnlWorked,
  'a-expiry-timeline': ExpiryTimeline,
  'a-roll-steps': RollSteps,
  'a-hedger-spec': HedgerSpecCards,
  'a-risk-transfer': RiskTransfer,
  'a-mxv-ecosystem': MxvEcosystem,
  'a-mxv-vs-hnx': MxvVsHnx,
  'a-broker-check': BrokerCheck,
  'a-broker-flags': BrokerFlags,
  'a-time-shift': TimeShift,
  'a-fx-flow': FxFlow,
  'a-fee-list': FeeList,
  'a-account-steps': AccountSteps,
  'a-legal-map': LegalMap,
  'a-corn-uses': CornUses,
  'a-grain-calendar': GrainCalendar,
  'a-soy-crush': SoyCrush,
  'a-coffee-compare': CoffeeCompare,
  'a-softs-cards': SoftsCards,
  'a-precious-cards': PreciousCards,
  'a-copper-chain': CopperChain,
  'a-wti-brent': WtiBrent,
  'a-gas-season': GasSeason,
};
