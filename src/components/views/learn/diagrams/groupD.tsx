import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BellRing,
  Building2,
  CheckCircle2,
  ClipboardX,
  Coins,
  Factory,
  Gauge,
  Landmark,
  LineChart,
  Power,
  Scale,
  Search,
  ShieldAlert,
  User,
  type LucideIcon,
} from 'lucide-react';
import { DataStatusBadge } from '../../../common/DataStatusBadge';
import type { FigureMap } from './kit';

/*
 * Lesson figures, group D (keys prefixed 'd-'). Mostly HTML so text stays ≥ 11px and wraps at 390px;
 * small inline SVG charts use a viewBox no wider than their rendered width. Every number drawn here is
 * quoted from the lesson text it sits in. Theme tokens only: --positive (blue, up/gain), --negative
 * (apricot, down/loss), --warning (gold), --accent. No green/red.
 */

type Tone = 'accent' | 'positive' | 'negative' | 'warning' | 'muted';
const v = (t: Tone) => `var(--${t})`;

/** HTML figure shell: the visual is one image for assistive tech, described by `label`. */
function HFig({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  return (
    <figure className="m-0 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 min-w-0">
      <div role="img" aria-label={label} className="min-w-0">
        {children}
      </div>
      <figcaption className="text-[11px] text-[var(--muted)] pt-2">{title}</figcaption>
    </figure>
  );
}

function IconDot({ icon: Icon, tone = 'accent' }: { icon: LucideIcon; tone?: Tone }) {
  return (
    <span aria-hidden="true" className="shrink-0 grid place-items-center w-8 h-8 rounded-full" style={{ background: `color-mix(in srgb, ${v(tone)} 14%, transparent)`, color: v(tone) }}>
      <Icon className="w-4 h-4" />
    </span>
  );
}

const card = 'rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 min-w-0';

/** Horizontal bar 0..max with a label inside the row. */
function Bar({ value, max, tone, label, sub }: { value: number; max: number; tone: Tone; label: string; sub?: string }) {
  const pct = Math.max(2, Math.min(100, (Math.abs(value) / max) * 100));
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
        <span className="font-medium text-[var(--text-strong)]">{label}</span>
        {sub && <span className="text-[var(--muted)] tabular-nums text-right">{sub}</span>}
      </div>
      <div className="mt-1 h-3 rounded-full bg-[var(--border)]/50 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: v(tone) }} />
      </div>
    </div>
  );
}

const svgText = { fontSize: 11, fill: 'var(--text)' } as const;
const svgMuted = { fontSize: 11, fill: 'var(--muted)' } as const;
const svgStrong = { fontSize: 12, fill: 'var(--text-strong)', fontWeight: 600 } as const;

/* ───────────── l5-who-profits ───────────── */

function CotGroups() {
  const groups: { n: string; name: string; who: string; icon: LucideIcon; tone: Tone }[] = [
    { n: '1', name: 'Producer / Merchant / Processor / User', who: 'Doanh nghiệp sản xuất, thương mại, chế biến, sử dụng hàng thật', icon: Factory, tone: 'accent' },
    { n: '2', name: 'Swap Dealer', who: 'Tổ chức tạo lập giao dịch hoán đổi cho khách', icon: ArrowLeftRight, tone: 'muted' },
    { n: '3', name: 'Managed Money', who: 'Quỹ và nhà quản lý tài sản (gồm CTA, quỹ hedge)', icon: LineChart, tone: 'positive' },
    { n: '4', name: 'Other Reportables', who: 'Các tổ chức còn lại', icon: Building2, tone: 'muted' },
  ];
  return (
    <HFig
      title="Báo cáo COT (disaggregated) của CFTC: 4 nhóm vị thế lớn + nhóm không báo cáo"
      label="Bốn nhóm trong báo cáo COT disaggregated của CFTC: 1 Producer/Merchant/Processor/User là doanh nghiệp hàng thật; 2 Swap Dealer tạo lập giao dịch hoán đổi; 3 Managed Money là quỹ và nhà quản lý tài sản gồm CTA, quỹ hedge; 4 Other Reportables là các tổ chức còn lại. Nhà đầu tư nhỏ lẻ nằm trong nhóm vị thế không báo cáo (nonreportable)."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.n} className={`${card} flex gap-2.5`}>
            <IconDot icon={g.icon} tone={g.tone} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-strong)] break-words">
                ({g.n}) {g.name}
              </p>
              <p className="text-xs text-[var(--muted)] leading-snug">{g.who}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2.5 rounded-md border border-dashed border-[var(--warning)]/60 p-2.5">
        <IconDot icon={User} tone="warning" />
        <p className="text-xs leading-snug">
          <span className="font-semibold text-[var(--text-strong)]">Nhà đầu tư nhỏ lẻ</span> nằm trong nhóm vị thế <span className="font-semibold">“không báo cáo”</span> (nonreportable).
        </p>
      </div>
    </HFig>
  );
}

function CftcStudy() {
  return (
    <HFig
      title="Nghiên cứu nhân viên CFTC (Ferko, Mixon, Onur, 02/2024): nhìn chung nhà giao dịch cá nhân thua lỗ"
      label="Nghiên cứu của nhân viên Văn phòng Kinh tế trưởng CFTC, 02/2024: 36.538 nhà giao dịch cá nhân, 50 thị trường futures Mỹ, giai đoạn 02/2021 đến 11/2022. Kết luận nhìn chung nhà giao dịch cá nhân thua lỗ, lỗ trung vị ước tính khoảng 100 đến 200 USD, phân phối lãi lỗ lệch về phía lỗ. Giới hạn: nghiên cứu của nhân viên, không phải quan điểm chính thức của CFTC; lãi lỗ ước tính từ dữ liệu cuối ngày; mẫu nghiêng về hợp đồng micro chỉ số chứng khoán Mỹ. Tham khảo: SEBI Ấn Độ báo cáo 91 phần trăm nhà giao dịch cá nhân phái sinh cổ phiếu thua lỗ trong FY2024-25, thị trường khác."
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['36.538', 'nhà giao dịch cá nhân'],
          ['50', 'thị trường futures Mỹ'],
          ['02/2021–11/2022', 'giai đoạn dữ liệu'],
        ].map(([big, small]) => (
          <div key={small} className={card}>
            <p className="text-sm sm:text-base font-semibold tabular-nums text-[var(--text-strong)] break-words">{big}</p>
            <p className="text-[11px] text-[var(--muted)] leading-tight">{small}</p>
          </div>
        ))}
      </div>
      <div className={`${card} mt-2`}>
        <p className="text-xs font-semibold text-[var(--text-strong)]">Kết luận: nhìn chung thua lỗ</p>
        <svg viewBox="0 0 300 74" className="w-full h-auto mt-1 max-w-[380px]" aria-hidden="true">
          {/* Shape only: loss side heavier (skewed to losses); no percentages are implied. */}
          {[4, 9, 15, 24, 34, 40, 30, 14, 8, 5, 3, 2].map((h, i) => (
            <rect key={i} x={12 + i * 23} y={50 - h} width={19} height={h} rx={2} fill={i < 7 ? v('negative') : v('positive')} fillOpacity={0.8} />
          ))}
          <line x1={173} x2={173} y1={2} y2={54} stroke="var(--text-strong)" strokeDasharray="3 3" />
          <text x={173} y={68} textAnchor="middle" {...svgMuted}>0</text>
          <text x={12} y={68} {...svgMuted}>← lỗ</text>
          <text x={288} y={68} textAnchor="end" {...svgMuted}>lãi →</text>
        </svg>
        <p className="text-xs text-[var(--text)]">
          Lỗ trung vị ước tính <span className="font-semibold tabular-nums">~100–200 USD</span>; phân phối lãi lỗ lệch về phía lỗ <span className="text-[var(--muted)]">(hình dạng minh hoạ, không phải số liệu)</span>.
        </p>
      </div>
      <div className={`${card} mt-2 space-y-1.5`}>
        <Bar value={91} max={100} tone="negative" label="SEBI (Ấn Độ), FY2024-25: 91% thua lỗ" sub="phái sinh cổ phiếu" />
        <p className="text-[11px] text-[var(--muted)]">Thị trường khác, chỉ để tham khảo.</p>
      </div>
      <ul className="mt-2 grid gap-1 text-[11px] text-[var(--muted)] list-none p-0">
        <li>• Nghiên cứu của nhân viên, không phải quan điểm chính thức của CFTC.</li>
        <li>• Lãi lỗ là ước tính từ dữ liệu cuối ngày.</li>
        <li>• Mẫu nghiêng về hợp đồng micro chỉ số chứng khoán Mỹ; chưa chắc áp dụng nguyên cho hàng hoá MXV.</li>
      </ul>
    </HFig>
  );
}

function WhyLose() {
  const chips: [LucideIcon, string, string][] = [
    [Scale, 'Đòn bẩy', 'biến động giá nhỏ thành lỗ lớn so với vốn'],
    [BellRing, 'Gọi ký quỹ', 'buộc cắt lỗ đúng lúc bất lợi'],
    [Coins, 'Phí và trượt giá', 'bào mòn vốn'],
    [ClipboardX, 'Thiếu quy tắc', 'quản lý khối lượng và kỷ luật'],
    [Building2, 'Thua tổ chức', 'về thông tin và công cụ'],
  ];
  return (
    <HFig title="5 lý do nhà đầu tư cá nhân dễ thua" label={`Năm lý do dễ thua: ${chips.map((c) => `${c[1]}: ${c[2]}`).join('; ')}.`}>
      <ul className="grid gap-2 sm:grid-cols-2 list-none p-0 m-0">
        {chips.map(([icon, head, sub]) => (
          <li key={head} className={`${card} flex items-center gap-2.5`}>
            <IconDot icon={icon} tone="negative" />
            <span className="text-xs leading-snug">
              <span className="font-semibold text-[var(--text-strong)]">{head}</span>
              <span className="text-[var(--muted)]"> — {sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </HFig>
  );
}

function SafeBroker() {
  const flags = ['Hứa lợi nhuận', '“Room” copy lệnh', 'Chuyển tiền vào tài khoản cá nhân', 'Sàn CFD/forex nước ngoài', 'Giả mạo MXV'];
  return (
    <HFig
      title="Kiểm tra môi giới an toàn: 3 bước (hướng dẫn thực tế, không phải trích dẫn pháp lý)"
      label={`Ba bước: 1 tìm tên thành viên môi giới trên mxv.com.vn; 2 tự đối chiếu, không tin lời giới thiệu; 3 soát dấu hiệu cảnh báo: ${flags.join(', ')}. Có dấu hiệu thì dừng.`}
    >
      <ol className="grid gap-2 list-none p-0 m-0">
        <li className={`${card} flex gap-2.5`}>
          <IconDot icon={Search} />
          <p className="text-xs">
            <span className="font-semibold text-[var(--text-strong)]">1. Tìm tên</span> thành viên môi giới trên <span className="font-mono">mxv.com.vn</span>.
          </p>
        </li>
        <li className={`${card} flex gap-2.5`}>
          <IconDot icon={CheckCircle2} tone="positive" />
          <p className="text-xs">
            <span className="font-semibold text-[var(--text-strong)]">2. Tự đối chiếu</span> — không chỉ tin lời giới thiệu hay đường link được gửi.
          </p>
        </li>
        <li className={`${card} flex gap-2.5`}>
          <IconDot icon={AlertTriangle} tone="warning" />
          <div className="min-w-0">
            <p className="text-xs">
              <span className="font-semibold text-[var(--text-strong)]">3. Soát dấu hiệu cảnh báo</span> — gặp một dấu hiệu là dừng:
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {flags.map((f) => (
                <span key={f} className="inline-flex rounded-full border border-[var(--warning)]/50 bg-[var(--warning)]/10 px-2 py-0.5 text-[11px] text-[var(--text-strong)]">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </li>
      </ol>
    </HFig>
  );
}

/* ───────────── l9-money ───────────── */

function Breakers() {
  const rows: { name: string; trip: string; action: string; tone: Tone }[] = [
    { name: 'Cầu dao NGÀY', trip: 'Lỗ 2–3% vốn trong ngày', action: 'Dừng giao dịch đến hôm sau', tone: 'warning' },
    { name: 'Cầu dao TUẦN / THÁNG', trip: 'Lỗ 6% tuần hoặc 10% tháng', action: 'Giảm một nửa khối lượng, xem lại nhật ký', tone: 'negative' },
    { name: 'Cầu dao VỊ THẾ', trip: 'Tổng rủi ro mọi lệnh mở ≤ 4–5% vốn', action: 'Không mở nhiều lệnh cùng chiều trên mã tương quan cao (ngô + lúa mì + đậu tương cùng mua ≈ một lệnh lớn)', tone: 'accent' },
  ];
  return (
    <HFig title="Ba “cầu dao” bảo vệ tài khoản" label={`Ba cầu dao: ${rows.map((r) => `${r.name}: ${r.trip}, ${r.action}`).join('. ')}.`}>
      <div className="grid gap-2 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.name} className={`${card} flex sm:flex-col gap-2.5`} style={{ borderTop: `3px solid ${v(r.tone)}` }}>
            <IconDot icon={Power} tone={r.tone} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-strong)]">{r.name}</p>
              <p className="text-xs font-medium tabular-nums mt-0.5" style={{ color: v(r.tone) }}>
                {r.trip}
              </p>
              <p className="text-xs text-[var(--muted)] leading-snug mt-0.5">→ {r.action}</p>
            </div>
          </div>
        ))}
      </div>
    </HFig>
  );
}

/* ───────────── l9-setups ───────────── */

/** Small chart with entry / stop / target lines labelled at the right edge. */
function MiniChart({ points, entry, stop, target, zone, entryAt }: { points: string; entry: number; stop: number; target: number; zone?: [number, number]; entryAt: [number, number] }) {
  const line = (y: number, tone: Tone, label: string) => (
    <g>
      <line x1={6} x2={214} y1={y} y2={y} stroke={v(tone)} strokeWidth={1.4} strokeDasharray="5 3" />
      <text x={214} y={y - 3} textAnchor="end" {...svgText} fill={v(tone)} fontWeight={600}>
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 220 140" className="w-full h-auto" aria-hidden="true">
      {zone && <rect x={6} y={zone[0]} width={208} height={zone[1] - zone[0]} fill="var(--warning)" fillOpacity={0.12} />}
      <polyline points={points} fill="none" stroke="var(--text-strong)" strokeWidth={2} strokeLinejoin="round" />
      {line(target, 'positive', 'mục tiêu')}
      {line(entry, 'accent', 'vào')}
      {line(stop, 'negative', 'stop')}
      <circle cx={entryAt[0]} cy={entryAt[1]} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}

function SetupCharts() {
  const panels: { name: string; chart: ReactNode; lines: [string, string][] }[] = [
    {
      name: '1. Pullback thuận xu hướng',
      chart: <MiniChart points="8,124 40,84 58,100 92,40 122,88 134,80 168,52 206,30" entry={80} stop={100} target={34} entryAt={[134, 80]} />,
      lines: [
        ['Vào', 'nến từ chối/nhấn chìm tăng tại hỗ trợ'],
        ['Stop', 'dưới đáy nhịp điều chỉnh (hoặc 1,5×ATR)'],
        ['Mục tiêu', 'đỉnh cũ, tối thiểu 2R'],
      ],
    },
    {
      name: '2. Breakout rồi Retest',
      chart: <MiniChart points="8,112 28,70 48,108 70,70 92,106 112,70 130,46 150,66 166,56 206,22" entry={58} stop={86} target={26} zone={[64, 76]} entryAt={[158, 60]} />,
      lines: [
        ['Vào', 'retest giữ được + nến tăng (không mua đuổi)'],
        ['Stop', 'dưới vùng kháng cự cũ'],
        ['Mục tiêu', 'chiều cao vùng tích lũy + điểm phá vỡ'],
      ],
    },
    {
      name: '3. Range (đi ngang)',
      chart: <MiniChart points="8,104 34,52 60,104 86,52 112,102 138,54 164,100 206,72" entry={98} stop={122} target={76} zone={[46, 108]} entryAt={[164, 100]} />,
      lines: [
        ['Vào', 'mua gần sàn khi có nến từ chối'],
        ['Stop', 'ngoài vùng 0,5–1×ATR'],
        ['Mục tiêu', 'giữa vùng hoặc biên đối diện'],
      ],
    },
  ];
  return (
    <HFig
      title="3 setup: điểm vào, stop và mục tiêu trên biểu đồ (minh hoạ, không phải dữ liệu thật)"
      label={`Ba biểu đồ minh hoạ. ${panels.map((p) => `${p.name}: ${p.lines.map((l) => `${l[0]} ${l[1]}`).join('; ')}`).join('. ')}.`}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {panels.map((p) => (
          <div key={p.name} className={card}>
            <p className="text-xs font-semibold text-[var(--text-strong)] mb-1">{p.name}</p>
            {p.chart}
            <dl className="mt-1 grid gap-0.5 text-[11px] leading-snug">
              {p.lines.map(([k, t]) => (
                <div key={k} className="flex gap-1.5">
                  <dt className="font-semibold shrink-0" style={{ color: v(k === 'Vào' ? 'accent' : k === 'Stop' ? 'negative' : 'positive') }}>
                    {k}:
                  </dt>
                  <dd className="m-0 text-[var(--text)]">{t}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </HFig>
  );
}

function SetupTree() {
  const rows: [string, string, string][] = [
    ['Có xu hướng rõ', 'HH/HL, giá trên MA50 dốc lên', 'Setup 1 – Pullback'],
    ['Tích lũy chặt dưới kháng cự', 'kháng cự chạm ≥2–3 lần', 'Setup 2 – Breakout–Retest'],
    ['Đi ngang biên rộng', 'MA đi ngang, chưa có báo cáo lớn', 'Setup 3 – Range'],
  ];
  return (
    <HFig title="Chọn setup theo trạng thái thị trường" label={`Cây quyết định: trạng thái thị trường. ${rows.map((r) => `${r[0]} (${r[1]}) thì ${r[2]}`).join('; ')}. Dùng sai setup cho sai trạng thái là nguyên nhân thua phổ biến.`}>
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent-text)]">
          <Gauge aria-hidden="true" className="w-3.5 h-3.5" /> Thị trường đang ở trạng thái nào?
        </span>
      </div>
      <div className="mx-auto h-3 w-px bg-[var(--border)]" />
      <div className="grid gap-2 sm:grid-cols-3">
        {rows.map(([state, hint, setup]) => (
          <div key={setup} className={`${card} text-center`}>
            <p className="text-xs font-semibold text-[var(--text-strong)]">{state}</p>
            <p className="text-[11px] text-[var(--muted)]">{hint}</p>
            <p aria-hidden="true" className="text-[var(--muted)] text-xs my-0.5">↓</p>
            <p className="inline-block rounded-md border border-[var(--positive)]/50 bg-[var(--positive)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--text-strong)]">{setup}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--warning)]">
        <AlertTriangle aria-hidden="true" className="w-3.5 h-3.5 shrink-0" /> Dùng sai setup cho sai trạng thái là nguyên nhân thua phổ biến.
      </p>
    </HFig>
  );
}

/* ───────────── l7-swing / l7-backtest ───────────── */

function MarginHit() {
  return (
    <HFig
      title="Giá đi ngược 2–3% ăn bao nhiêu ký quỹ? (số giả định)"
      label="Số giả định: ký quỹ 10 phần trăm giá trị hợp đồng, giá đi ngược 2 phần trăm thì mất khoảng 20 phần trăm ký quỹ. Ký quỹ 5 phần trăm, giá đi ngược 3 phần trăm thì mất khoảng 60 phần trăm ký quỹ."
    >
      <div className="space-y-3">
        <Bar value={20} max={100} tone="warning" label="Ký quỹ 10%, giá ngược 2%" sub="≈ 20% ký quỹ" />
        <Bar value={60} max={100} tone="negative" label="Ký quỹ 5%, giá ngược 3%" sub="≈ 60% ký quỹ" />
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)]">Thanh = phần ký quỹ của vị thế bị mất. Biến động giá nhỏ, tác động lên ký quỹ lớn.</p>
    </HFig>
  );
}

function BtDashboard() {
  const tiles: { k: string; ask: string; tone: Tone }[] = [
    { k: 'Tổng lợi nhuận', ask: 'Đã trừ phí và trượt giá chưa?', tone: 'positive' },
    { k: 'Max drawdown', ask: 'Mức sụt vốn lớn nhất — bạn có chịu được không?', tone: 'negative' },
    { k: 'Tỷ lệ thắng', ask: 'Một mình chưa nói gì: thắng 70% nhưng lỗ lớn vẫn có thể thua.', tone: 'muted' },
    { k: 'Profit factor', ask: 'Tổng lãi ÷ tổng lỗ; trên 1 là có lãi trước các sai lệch.', tone: 'accent' },
  ];
  return (
    <HFig
      title="Đọc bảng kết quả backtest: 4 chỉ số chính (giao diện minh hoạ, không có số)"
      label={`Bảng kết quả backtest minh hoạ. ${tiles.map((t) => `${t.k}: ${t.ask}`).join(' ')} Xem thêm số lệnh, phí và trượt giá.`}
    >
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div key={t.k} className={card} style={{ borderLeft: `3px solid ${v(t.tone)}` }}>
            <p className="text-xs font-semibold text-[var(--text-strong)]">{t.k}</p>
            <p aria-hidden="true" className="font-mono text-sm text-[var(--muted)]">— —</p>
            <p className="text-[11px] text-[var(--muted)] leading-snug">{t.ask}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)]">Xem thêm: số lệnh, tổng phí và trượt giá.</p>
    </HFig>
  );
}

function BtFlags() {
  const flags = [
    'Quá ít lệnh (vài chục lệnh trở xuống → kết quả không ổn định)',
    'Kết quả tốt nhờ một vài lệnh lớn',
    'Tinh chỉnh tham số cho đẹp trên một mã/giai đoạn (overfitting)',
    'Chỉ tốt khi phí/trượt giá bằng 0',
    'Chỉ tốt trên một mã',
  ];
  return (
    <HFig title="5 dấu hiệu backtest đáng ngờ" label={`Năm dấu hiệu đáng ngờ: ${flags.join('; ')}.`}>
      <ul className="grid gap-1.5 list-none p-0 m-0">
        {flags.map((f) => (
          <li key={f} className="flex items-start gap-2 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-2.5 py-2 text-xs">
            <ShieldAlert aria-hidden="true" className="w-4 h-4 shrink-0 text-[var(--warning)]" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </HFig>
  );
}

/* ───────────── l8-price-action / l8-volume ───────────── */

function BreakoutVsFalse() {
  const panel = (ok: boolean) => (
    <svg viewBox="0 0 200 165" className="w-full h-auto" aria-hidden="true">
      <rect x={4} y={52} width={192} height={14} fill="var(--warning)" fillOpacity={0.16} />
      <text x={8} y={47} {...svgMuted}>vùng kháng cự</text>
      <polyline
        points={ok ? '6,108 28,70 46,98 66,68 86,94 104,66 122,40 140,46 160,30 194,18' : '6,108 28,70 46,98 66,68 86,94 104,66 122,42 136,62 152,88 194,104'}
        fill="none"
        stroke="var(--text-strong)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <circle cx={122} cy={ok ? 40 : 42} r={4} fill={ok ? v('positive') : v('warning')} />
      {ok ? <circle cx={140} cy={46} r={4} fill={v('positive')} /> : <circle cx={152} cy={88} r={4} fill={v('negative')} />}
      {[10, 12, 9, 13, 10, 12, ok ? 30 : 11, ok ? 26 : 9, ok ? 22 : 8].map((h, i) => (
        <rect key={i} x={12 + i * 20} y={160 - h} width={12} height={h} rx={1.5} fill={i >= 6 && ok ? v('positive') : 'var(--muted)'} fillOpacity={0.55} />
      ))}
      <text x={194} y={126} textAnchor="end" {...svgMuted}>khối lượng</text>
    </svg>
  );
  return (
    <HFig
      title="Phá vỡ đáng tin vs phá vỡ giả (minh hoạ)"
      label="Hai biểu đồ minh hoạ. Trái: giá vượt kháng cự rồi đóng cửa trên vùng, khối lượng tăng, phá vỡ đáng tin hơn. Phải: giá vượt lên rồi nhanh chóng quay lại dưới vùng cũ, khối lượng không tăng, phá vỡ giả hay bẫy người mua đuổi."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div className={card}>
          <p className="text-xs font-semibold text-[var(--positive)]">Phá vỡ đáng tin hơn</p>
          {panel(true)}
          <p className="text-[11px] leading-snug">Đóng cửa TRÊN vùng, khối lượng tăng.</p>
        </div>
        <div className={card}>
          <p className="text-xs font-semibold text-[var(--negative)]">Phá vỡ giả</p>
          {panel(false)}
          <p className="text-[11px] leading-snug">Vượt lên rồi quay lại DƯỚI vùng cũ → bẫy người mua đuổi.</p>
        </div>
      </div>
    </HFig>
  );
}

function VolumeTrend() {
  const panel = (price: string, vols: number[], hi: number[]) => (
    <svg viewBox="0 0 200 140" className="w-full h-auto" aria-hidden="true">
      <polyline points={price} fill="none" stroke="var(--text-strong)" strokeWidth={2} strokeLinejoin="round" />
      <line x1={4} x2={196} y1={136} y2={136} stroke="var(--border)" />
      {vols.map((h, i) => (
        <rect key={i} x={8 + i * 19} y={136 - h} width={13} height={h} rx={1.5} fill={hi.includes(i) ? v('accent') : 'var(--muted)'} fillOpacity={hi.includes(i) ? 0.85 : 0.45} />
      ))}
    </svg>
  );
  const panels: { name: string; note: string; tone: Tone; svg: ReactNode }[] = [
    {
      name: 'Xu hướng khỏe',
      note: 'Khối lượng tăng theo hướng xu hướng, giảm ở nhịp điều chỉnh.',
      tone: 'positive',
      svg: panel('6,80 40,50 58,62 96,30 116,42 156,12 190,8', [18, 26, 30, 12, 10, 28, 34, 12, 30, 36], [1, 2, 5, 6, 8, 9]),
    },
    {
      name: 'Phân kỳ',
      note: 'Giá tạo đỉnh mới nhưng khối lượng ngày càng nhỏ: lực đẩy yếu đi.',
      tone: 'warning',
      svg: panel('6,84 40,44 60,60 100,32 120,48 160,22 190,30', [16, 38, 20, 32, 16, 26, 14, 20, 12, 10], [1, 3, 5, 7]),
    },
    {
      name: 'Cao trào (climax)',
      note: 'Khối lượng cực lớn sau đợt chạy dài: có thể kiệt sức, chưa chắc đảo chiều.',
      tone: 'negative',
      svg: panel('6,90 40,74 70,60 100,46 130,30 160,10 176,24 190,22', [12, 14, 13, 16, 15, 18, 20, 48, 22, 16], [7]),
    },
  ];
  return (
    <HFig title="Khối lượng so với xu hướng: 3 tình huống (minh hoạ)" label={`Ba tình huống minh hoạ: ${panels.map((p) => `${p.name}: ${p.note}`).join(' ')}`}>
      <div className="grid gap-2 sm:grid-cols-3">
        {panels.map((p) => (
          <div key={p.name} className={card}>
            <p className="text-xs font-semibold" style={{ color: v(p.tone) }}>
              {p.name}
            </p>
            {p.svg}
            <p className="text-[11px] leading-snug mt-1">{p.note}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)]">Đường = giá; cột = khối lượng (cột đậm là nhịp đáng chú ý).</p>
    </HFig>
  );
}

/* ───────────── l10-corn / l10-costs ───────────── */

function CornOutcomes() {
  return (
    <HFig
      title="Hai kết quả của cùng một lệnh “đúng quy trình” (số giả định)"
      label="Kết quả A, đúng kịch bản: 6 phiên sau giá chạm 453, lãi 14 nhân 50 bằng 700 USD, trừ phí 2 chiều 10 USD còn 690 USD, khoảng 17,7 triệu đồng, cộng 1,77 phần trăm vốn. Kết quả B, sai kịch bản: giá phá 432, lệnh dừng khớp 431,75, trượt 1 tick, lỗ 7,25 nhân 50 cộng 10 bằng 372,5 USD, khoảng 9,5 triệu, trừ 0,95 phần trăm vốn."
    >
      <div className="grid gap-3">
        <div className={card}>
          <Bar value={690} max={720} tone="positive" label="A — đúng kịch bản: +690 USD" sub="≈ 17,7 triệu · +1,77% vốn" />
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            6 phiên sau chạm 453: <span className="font-mono">14 × 50 = 700</span> − phí 10 = <span className="font-mono">690 USD</span>
          </p>
        </div>
        <div className={card}>
          <Bar value={372.5} max={720} tone="negative" label="B — sai kịch bản: −372,5 USD" sub="≈ 9,5 triệu · −0,95% vốn" />
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Phá 432, dừng khớp 431,75 (trượt 1 tick): <span className="font-mono">7,25 × 50 + 10 = 372,5 USD</span>
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)]">Cả hai đều là lệnh “đúng quy trình”.</p>
    </HFig>
  );
}

function RiskGauge() {
  const max = 3.5;
  const at = (p: number) => `${(p / max) * 100}%`;
  return (
    <HFig
      title="Vốn 300 triệu: 1 hợp đồng ngô vượt quy tắc 1% (số giả định)"
      label="Vốn 300 triệu đồng, khoảng 11.700 USD; quy tắc 1 phần trăm bằng 117 USD. Cùng cắt lỗ 7 cent, 1 hợp đồng rủi ro 350 USD bằng 3 phần trăm vốn, vượt quy tắc. So sánh: với vốn 1 tỷ, 1 phần trăm bằng 390 USD nên 350 USD vẫn trong quy tắc."
    >
      <div className={card}>
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold text-[var(--text-strong)]">Rủi ro 1 hợp đồng / vốn</span>
          <span className="tabular-nums text-[var(--negative)] font-semibold">3%</span>
        </div>
        <div className="relative mt-6 mb-1 h-3 rounded-full bg-[var(--border)]/50">
          <div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: at(1), background: v('positive'), opacity: 0.5 }} />
          <div className="absolute inset-y-0 rounded-r-full" style={{ left: at(1), width: `calc(${at(3)} - ${at(1)})`, background: v('negative'), opacity: 0.7 }} />
          <div className="absolute -top-5 -translate-x-1/2 text-[11px] font-semibold text-[var(--text-strong)] whitespace-nowrap" style={{ left: at(1) }}>
            quy tắc 1%
          </div>
          <div className="absolute -top-1 bottom-[-4px] w-0.5 bg-[var(--text-strong)]" style={{ left: at(1) }} />
          <div className="absolute -top-1.5 w-3 h-6 -translate-x-1/2 rounded-sm" style={{ left: at(3), background: v('negative') }} />
        </div>
        <div className="flex justify-between text-[11px] text-[var(--muted)] tabular-nums">
          <span>0%</span>
          <span>vượt quy tắc gấp 3</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className={card}>
          <p className="font-semibold text-[var(--text-strong)]">300 triệu</p>
          <p className="text-[var(--muted)] tabular-nums">~11.700 USD · 1% = 117 USD</p>
          <p className="tabular-nums text-[var(--negative)]">350 USD = 3% → không vào</p>
        </div>
        <div className={card}>
          <p className="font-semibold text-[var(--text-strong)]">1 tỷ</p>
          <p className="text-[var(--muted)] tabular-nums">~39.000 USD · 1% = 390 USD</p>
          <p className="tabular-nums text-[var(--positive)]">350 USD ≤ 390 → 1 hợp đồng</p>
        </div>
      </div>
    </HFig>
  );
}

function FeeR() {
  return (
    <HFig
      title="Phí tính theo R: cắt lỗ càng ngắn, phí càng nặng (số giả định)"
      label="Phí 2 chiều 10 USD. Lệnh ngô rủi ro 350 USD: phí khoảng 0,03R, không đáng kể. Lệnh lướt cắt lỗ 2 cent tức 100 USD: phí khoảng 0,1R mỗi lệnh; 100 lệnh mất 10R chỉ vì phí."
    >
      <div className="space-y-3">
        <Bar value={0.03} max={0.12} tone="positive" label="Rủi ro 350 USD → phí ≈ 0,03R" sub="không đáng kể" />
        <Bar value={0.1} max={0.12} tone="negative" label="Cắt lỗ 2 cent (100 USD) → phí ≈ 0,1R" sub="mỗi lệnh" />
      </div>
      <div className="mt-3 flex items-center gap-2.5 rounded-md border border-[var(--negative)]/40 bg-[var(--negative)]/10 p-2.5">
        <IconDot icon={Coins} tone="negative" />
        <p className="text-xs">
          <span className="font-semibold tabular-nums text-[var(--text-strong)]">100 lệnh × 0,1R = 10R</span> mất chỉ vì phí.
        </p>
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)]">Phí 2 chiều giả định 10 USD.</p>
    </HFig>
  );
}

function ExpiryStrip() {
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const corn = new Set([3, 5, 7, 9, 12]);
  return (
    <HFig title="Tháng đáo hạn ví dụ của ngô: 3, 5, 7, 9, 12" label="Dải 12 tháng; ngô có tháng đáo hạn ví dụ 3, 5, 7, 9 và 12. Nhà đầu tư cá nhân thường phải đóng vị thế trước ngày thông báo hoặc đáo hạn theo quy định của MXV; ghi ngày đó vào lịch khi mở lệnh.">
      <div className="grid grid-cols-12 gap-0.5">
        {months.map((m) => (
          <div
            key={m}
            className={`rounded-sm py-1.5 text-center text-[11px] tabular-nums ${corn.has(m) ? 'font-semibold text-[var(--text-strong)] bg-[var(--accent-soft)] border border-[var(--accent)]' : 'text-[var(--muted)] border border-[var(--border)]'}`}
          >
            {m}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)]">Ô viền đậm = tháng đáo hạn. Đóng vị thế trước ngày thông báo/đáo hạn theo quy định MXV — ghi lịch ngay khi mở lệnh.</p>
    </HFig>
  );
}

/* ───────────── l2-legal ───────────── */

function DecreeTimeline() {
  const items: { code: string; note: string; tone: Tone }[] = [
    { code: 'NĐ 158/2006/NĐ-CP', note: 'Khung giao dịch hàng hoá qua Sở (trước đây)', tone: 'muted' },
    { code: 'NĐ 51/2018/NĐ-CP', note: 'Cùng NĐ 158/2006 là khung trước đây', tone: 'muted' },
    { code: 'NĐ 302/2026/NĐ-CP', note: 'Ban hành 01/08/2026 · hiệu lực 15/09/2026. Điều 40 chấm dứt hiệu lực NĐ 158/2006 và NĐ 51/2018. Thông tư 47/2026/TT-BCT hướng dẫn thi hành.', tone: 'positive' },
  ];
  return (
    <HFig
      title="Dòng thời gian văn bản (đối chiếu trên LuatVietnam, kiểm tra 20/11/2026 — cần đối chiếu văn bản gốc)"
      label="Dòng thời gian: Nghị định 158/2006 và 51/2018 là khung giao dịch hàng hoá qua Sở trước đây. Nghị định 302/2026 ban hành 01/08/2026, hiệu lực 15/09/2026, theo Điều 40 chấm dứt hiệu lực hai nghị định cũ; Thông tư 47/2026/TT-BCT hướng dẫn thi hành. Riêng Nghị định 158/2020 là về chứng khoán phái sinh (HNX), không phải khung riêng của hàng hoá MXV."
    >
      <ol className="relative list-none p-0 m-0 space-y-3">
        {items.map((it, i) => (
          <li key={it.code} className="relative flex gap-3">
            {i < items.length - 1 && <span aria-hidden="true" className="absolute left-[15px] top-8 bottom-[-12px] w-px bg-[var(--border)]" />}
            <IconDot icon={Landmark} tone={it.tone} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-strong)] font-mono">{it.code}</p>
              <p className="text-xs text-[var(--muted)] leading-snug">{it.note}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 rounded-md border border-dashed border-[var(--border)] p-2.5 text-xs">
        <span className="font-semibold font-mono text-[var(--text-strong)]">NĐ 158/2020/NĐ-CP</span>
        <span className="text-[var(--muted)]"> — chứng khoán phái sinh (HNX), không phải khung riêng của hàng hoá MXV.</span>
      </div>
    </HFig>
  );
}

/* ───────────── l6-data-labels ───────────── */

function DataBadges() {
  const rows: { badge: ReactNode; means: string }[] = [
    { badge: <DataStatusBadge status="DELAYED" delayMinutes={15} />, means: 'Nguồn miễn phí có độ trễ: dùng để học, nghiên cứu xu hướng dài hạn.' },
    { badge: <DataStatusBadge status="STALE" />, means: 'Dữ liệu quá hạn so với kỳ vọng → dừng và kiểm tra lại.' },
    {
      // Same classes as the UNOFFICIAL pill inside DataStatusBadge (shown alone, without a status pill).
      badge: <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap text-[var(--accent-text)] bg-[var(--accent-soft)] border-[var(--accent)]/30">Nguồn không chính thức</span>, means: 'Không phải dữ liệu của sàn → đừng dựa vào một mức giá cụ thể.' },
    { badge: <span className="text-xs text-[var(--muted)] whitespace-nowrap">cập nhật X giây trước</span>, means: 'Độ tươi của giá; lâu bất thường → dừng và kiểm tra lại.' },
  ];
  return (
    <HFig
      title="Các nhãn dữ liệu trông thế nào trên màn hình (cách ghi có thể khác theo màn hình)"
      label="Các nhãn: Giá trễ khoảng 15 phút là nguồn miễn phí có độ trễ, dùng để học. Giá cũ là dữ liệu quá hạn, dừng và kiểm tra lại. Nguồn không chính thức là không phải dữ liệu của sàn. Cập nhật X giây trước cho biết độ tươi; lâu bất thường thì dừng và kiểm tra lại."
    >
      <ul className="grid gap-1.5 list-none p-0 m-0" aria-hidden="true">
        {rows.map((r, i) => (
          <li key={i} className={`${card} grid gap-1.5 sm:grid-cols-[13rem_1fr] sm:items-center`}>
            <span className="min-w-0">{r.badge}</span>
            <span className="text-xs leading-snug">{r.means}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
        <Landmark aria-hidden="true" className="w-3.5 h-3.5 shrink-0" /> Tiền thật: đối chiếu bảng giá của công ty môi giới (thành viên MXV).
      </p>
    </HFig>
  );
}

export const FIGURES_D: FigureMap = {
  'd-cot-groups': CotGroups,
  'd-cftc-study': CftcStudy,
  'd-why-lose': WhyLose,
  'd-safe-broker': SafeBroker,
  'd-breakers': Breakers,
  'd-setup-charts': SetupCharts,
  'd-setup-tree': SetupTree,
  'd-margin-hit': MarginHit,
  'd-bt-dashboard': BtDashboard,
  'd-bt-flags': BtFlags,
  'd-breakout-vs-false': BreakoutVsFalse,
  'd-volume-trend': VolumeTrend,
  'd-corn-outcomes': CornOutcomes,
  'd-risk-gauge': RiskGauge,
  'd-fee-r': FeeR,
  'd-expiry-strip': ExpiryStrip,
  'd-decree-timeline': DecreeTimeline,
  'd-data-badges': DataBadges,
};
