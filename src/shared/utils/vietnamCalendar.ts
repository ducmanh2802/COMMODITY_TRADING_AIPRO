import type { ExchangeCode, ProductCategory } from '../types/instrument';
import { VIETNAM_TIMEZONE } from './time';

export type CalendarEventType = 'MACRO_RELEASE' | 'MARKET_HOLIDAY';
export type VietnamSessionSlot = 'ASIA_VN_DAY' | 'EU_ROBUSTA' | 'US_NIGHT';
export type SessionLiveState = 'OPEN' | 'BREAK' | 'CLOSED' | 'HOLIDAY_CLOSED';

export interface VietnamTradingSessionStatus {
  id: string;
  labelVi: string;
  exchange: ExchangeCode;
  mxvProducts: string[];
  symbols: string[];
  category: ProductCategory;
  sessionSlot: VietnamSessionSlot;
  ictHoursLabel: string;
  localExchangeTimezone: string;
  state: SessionLiveState;
  stateReason: string;
}

export interface MarketHolidayEntry {
  id: string;
  dateIso: string; // YYYY-MM-DD
  nameVi: string;
  nameEn: string;
  region: 'VIETNAM' | 'US' | 'UK_EU' | 'JAPAN';
  affectedExchanges: ExchangeCode[];
  mxvImpact: 'MXV_CLOSED' | 'PARTIAL_CLOSE' | 'BANKING_FX_DELAY';
  impactDescriptionVi: string;
  affectedSymbols: string[];
  /**
   * PROJECTED = the closure is inferred (e.g. from the official public-holiday schedule) and the exchange's own
   * notice was not found; never presented as confirmed. Absent = entry as originally curated.
   */
  status?: 'OFFICIAL' | 'PROJECTED';
  sourceUrl?: string;
}

export interface EconomicCalendarEvent {
  id: string;
  titleVi: string;
  titleEn: string;
  type: CalendarEventType;
  category: ProductCategory | 'MACRO_FX';
  sessionSlot: VietnamSessionSlot;
  ictTimeLabel: string;
  dateIso: string; // YYYY-MM-DD in Asia/Ho_Chi_Minh
  ictIsoTimestamp: string;
  sourceAgency: string;
  impactLevel: 'HIGH' | 'MEDIUM';
  relatedSymbols: string[];
  mxvImpactNote: string;
  cadenceLabel: string;
  /** Always null unless backed by a synced/imported verified macro record */
  verifiedActual?: string | null;
}

interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekdayIndex: number; // 0=Sun..6=Sat
  dateIso: string;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getZonedParts(date: Date, timeZone: string): ZoneParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(get('minute'));
  const weekdayIndex = WEEKDAY_MAP[get('weekday')] ?? 0;

  const dateIso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
    day
  ).padStart(2, '0')}`;

  return { year, month, day, hour, minute, weekdayIndex, dateIso };
}

/** Returns offset difference (Vietnam UTC+7 minus target zone offset) in minutes */
function getZoneToIctDeltaMinutes(date: Date, targetTimeZone: string): number {
  const vn = getZonedParts(date, VIETNAM_TIMEZONE);
  const target = getZonedParts(date, targetTimeZone);
  const vnUtc = Date.UTC(vn.year, vn.month - 1, vn.day, vn.hour, vn.minute);
  const tgtUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  return Math.round((vnUtc - tgtUtc) / 60_000);
}

function formatHm(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const TET_2027_SOURCE = 'https://hatinh.gov.vn/vi/bai-viet/tet-nguyen-dan-2027-cong-chuc-vien-chuc-duoc-nghi-7-ngay-lien-tuc';

/** Tết 2027 rest days (04/02–10/02/2027, Thông báo 11483/TB-BNV). Weekend days are kept for display only. */
function tetMxvClosure2027(): MarketHolidayEntry[] {
  const days: Array<[string, string]> = [
    ['2027-02-04', '28 Tết'],
    ['2027-02-05', '29 Tết (Giao thừa)'],
    ['2027-02-06', 'Mùng 1 Tết'],
    ['2027-02-07', 'Mùng 2 Tết'],
    ['2027-02-08', 'Mùng 3 Tết'],
    ['2027-02-09', 'Mùng 4 Tết (nghỉ bù)'],
    ['2027-02-10', 'Mùng 5 Tết (nghỉ bù)'],
  ];
  return days.map(([dateIso, label]) => ({
    id: `hol-${dateIso}-tet`,
    dateIso,
    nameVi: `Tết Nguyên Đán Đinh Mùi 2027 — ${label} (dự kiến MXV nghỉ)`,
    nameEn: 'Vietnam Lunar New Year 2027 (MXV closure projected)',
    region: 'VIETNAM',
    affectedExchanges: ['MXV'],
    mxvImpact: 'MXV_CLOSED',
    impactDescriptionVi:
      'Lịch nghỉ Tết chính thức của cán bộ, công chức: 04/02–10/02/2027 (Thông báo 11483/TB-BNV). MXV chưa công bố lịch nghỉ giao dịch Tết 2027 — ngày nghỉ MXV là DỰ KIẾN, hãy kiểm tra thông báo chính thức của Sở MXV. Ngân hàng nghỉ nên nạp/rút ký quỹ VND gián đoạn.',
    affectedSymbols: ['RC', 'KC', 'JRU', 'ZS', 'ZC', 'CL', 'SI'],
    status: 'PROJECTED',
    sourceUrl: TET_2027_SOURCE,
  }));
}

/**
 * Official 2026–2027 Market Holidays affecting Vietnam MXV & linked international futures exchanges.
 */
export const MARKET_HOLIDAYS: MarketHolidayEntry[] = [
  // 2026
  {
    id: 'hol-2026-11-26-us',
    dateIso: '2026-11-26',
    nameVi: 'Lễ Tạ Ơn Hoa Kỳ (US Thanksgiving)',
    nameEn: 'US Thanksgiving Day',
    region: 'US',
    affectedExchanges: ['CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
    mxvImpact: 'PARTIAL_CLOSE',
    impactDescriptionVi:
      'CBOT/CME/NYMEX/ICE US nghỉ hoặc đóng cửa sớm; Robusta (LRC) trên ICE Europe vẫn mở bình thường nhưng thanh khoản phiên tối Mỹ giảm mạnh.',
    affectedSymbols: ['ZS', 'ZM', 'ZL', 'ZC', 'ZW', 'KC', 'SB', 'CT', 'CL', 'NG', 'SI', 'HG'],
  },
  {
    id: 'hol-2026-11-27-us',
    dateIso: '2026-11-27',
    nameVi: 'Sau Lễ Tạ Ơn — Đóng cửa sớm Mỹ',
    nameEn: 'Day After Thanksgiving (Early Close)',
    region: 'US',
    affectedExchanges: ['CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
    mxvImpact: 'PARTIAL_CLOSE',
    impactDescriptionVi:
      'Nông sản CBOT & Năng lượng NYMEX đóng cửa sớm quanh 01:05–02:45 sáng ICT (28/11). Biên độ có thể giật cục do thanh khoản mỏng.',
    affectedSymbols: ['ZS', 'ZC', 'ZW', 'CL', 'NG', 'SI', 'HG'],
  },
  {
    id: 'hol-2026-12-25-global',
    dateIso: '2026-12-25',
    nameVi: 'Lễ Giáng Sinh (Christmas Day)',
    nameEn: 'Christmas Day',
    region: 'US',
    affectedExchanges: ['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
    mxvImpact: 'MXV_CLOSED',
    impactDescriptionVi:
      'Đóng cửa toàn bộ các sàn liên thông Mỹ/Âu (ICE, CBOT, CME, NYMEX). MXV tạm ngừng giao dịch các hợp đồng liên thông.',
    affectedSymbols: ['RC', 'KC', 'SB', 'ZS', 'ZC', 'ZW', 'CL', 'BRN', 'SI', 'HG'],
  },
  {
    id: 'hol-2026-12-26-uk',
    dateIso: '2026-12-26',
    nameVi: 'Boxing Day — ICE Europe (London)',
    nameEn: 'UK Boxing Day (Observed)',
    region: 'UK_EU',
    affectedExchanges: ['ICE'],
    mxvImpact: 'PARTIAL_CLOSE',
    impactDescriptionVi: 'Sàn ICE Futures Europe (Robusta LRC, Đường trắng) nghỉ lễ tại London.',
    affectedSymbols: ['RC', 'BRN'],
  },
  // 2027
  {
    id: 'hol-2027-01-01-global',
    dateIso: '2027-01-01',
    nameVi: 'Tết Dương lịch (New Year’s Day)',
    nameEn: 'New Year’s Day',
    region: 'VIETNAM',
    affectedExchanges: ['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
    mxvImpact: 'MXV_CLOSED',
    impactDescriptionVi:
      'Việt Nam & các sàn quốc tế (MXV, ICE, CBOT, CME, NYMEX) đóng cửa nghỉ Tết Dương lịch.',
    affectedSymbols: ['RC', 'KC', 'JRU', 'ZS', 'ZC', 'CL', 'BRN', 'SI', 'HG'],
  },
  {
    id: 'hol-2027-01-18-us',
    dateIso: '2027-01-18',
    nameVi: 'Ngày Martin Luther King Jr.',
    nameEn: 'Martin Luther King Jr. Day',
    region: 'US',
    affectedExchanges: ['CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
    mxvImpact: 'PARTIAL_CLOSE',
    impactDescriptionVi:
      'Nông sản CBOT & ICE US đóng cửa; Kim loại/Năng lượng CME/NYMEX dừng sớm. Cà phê Robusta (LRC) và Cao su RSS3 (JRU) mở bình thường.',
    affectedSymbols: ['ZS', 'ZC', 'ZW', 'KC', 'SB', 'CT', 'CL', 'NG', 'SI'],
  },
  // Tết Nguyên Đán Đinh Mùi 2027 (Mùng 1 = Saturday 2027-02-06).
  // Public-holiday basis (OFFICIAL): Bộ Nội vụ Thông báo số 11483/TB-BNV ngày 09/10/2026 — civil servants rest
  // 7 consecutive days Thu 04/02/2027 .. Wed 10/02/2027 (5 Tết days per Bộ luật Lao động 2019 Art. 112 + 2 compensatory
  // days for the weekend). Reported e.g. at https://hatinh.gov.vn/vi/bai-viet/tet-nguyen-dan-2027-cong-chuc-vien-chuc-duoc-nghi-7-ngay-lien-tuc
  // (retrieved 2026-11-24). MXV CLOSURE on these weekdays is PROJECTED: MXV's own Tết 2027 trading-holiday notice was
  // not found on 2026-11-24; MXV has historically followed the official public-holiday schedule. Confirm on mxv.com.vn.
  ...tetMxvClosure2027(),
  {
    id: 'hol-2027-02-15-us',
    dateIso: '2027-02-15',
    nameVi: 'Ngày Tổng thống Hoa Kỳ (Presidents’ Day)',
    nameEn: 'Presidents’ Day',
    region: 'US',
    affectedExchanges: ['CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
    mxvImpact: 'PARTIAL_CLOSE',
    impactDescriptionVi:
      'CBOT & ICE US nghỉ; CME/NYMEX đóng sớm. Phiên Robusta LRC trên ICE Europe vẫn giao dịch.',
    affectedSymbols: ['ZS', 'ZC', 'ZW', 'KC', 'SB', 'CT', 'CL', 'SI'],
  },
  {
    id: 'hol-2027-03-26-good-friday',
    dateIso: '2027-03-26',
    nameVi: 'Thứ Sáu Tuần Thánh (Good Friday)',
    nameEn: 'Good Friday',
    region: 'UK_EU',
    affectedExchanges: ['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
    mxvImpact: 'MXV_CLOSED',
    impactDescriptionVi:
      'Toàn bộ sàn ICE Europe, ICE US, CBOT, CME, NYMEX nghỉ lễ Phục Sinh. MXV tạm ngưng hầu hết sản phẩm liên thông.',
    affectedSymbols: ['RC', 'KC', 'SB', 'ZS', 'ZC', 'ZW', 'CL', 'BRN', 'SI', 'HG'],
  },
  {
    id: 'hol-2027-04-16-hung-kings',
    dateIso: '2027-04-16',
    nameVi: 'Giỗ Tổ Hùng Vương (10/3 Âm lịch)',
    nameEn: 'Hung Kings Commemoration Day (Vietnam)',
    region: 'VIETNAM',
    affectedExchanges: ['MXV'],
    mxvImpact: 'BANKING_FX_DELAY',
    impactDescriptionVi:
      'Ngân hàng Việt Nam nghỉ lễ (10/3 Âm lịch); lưu ý hạn mức ký quỹ VND và chuyển khoản nạp/rút trước phiên đêm Mỹ.',
    affectedSymbols: ['RC', 'KC', 'ZS', 'ZC', 'CL'],
  },
  {
    id: 'hol-2027-04-30-vn',
    dateIso: '2027-04-30',
    nameVi: 'Ngày Giải phóng miền Nam 30/4',
    nameEn: 'Reunification Day (Vietnam)',
    region: 'VIETNAM',
    affectedExchanges: ['MXV'],
    mxvImpact: 'BANKING_FX_DELAY',
    impactDescriptionVi:
      'Ngày lễ quốc gia Việt Nam; giao dịch liên thông theo thông báo điều chỉnh hàng năm của Sở MXV, thanh toán ngân hàng nội địa tạm nghỉ.',
    affectedSymbols: ['RC', 'KC', 'JRU', 'ZS', 'CL'],
  },
  {
    id: 'hol-2027-05-01-vn',
    dateIso: '2027-05-01',
    nameVi: 'Ngày Quốc tế Lao động 1/5',
    nameEn: 'International Workers’ Day',
    region: 'VIETNAM',
    affectedExchanges: ['MXV'],
    mxvImpact: 'MXV_CLOSED',
    impactDescriptionVi: 'Ngày Quốc tế Lao động; thị trường tài chính Việt Nam nghỉ lễ.',
    affectedSymbols: ['RC', 'KC', 'JRU', 'ZS', 'CL'],
  },
  {
    id: 'hol-2027-05-03-uk',
    dateIso: '2027-05-03',
    nameVi: 'UK Early May Bank Holiday — ICE Europe',
    nameEn: 'UK Early May Bank Holiday',
    region: 'UK_EU',
    affectedExchanges: ['ICE'],
    mxvImpact: 'PARTIAL_CLOSE',
    impactDescriptionVi:
      'Sàn ICE Europe (Cà phê Robusta LRC & Dầu Brent BZE London) nghỉ; các sàn nông sản/năng lượng Mỹ vẫn mở bình thường.',
    affectedSymbols: ['RC', 'BRN'],
  },
  {
    id: 'hol-2027-05-31-us-uk',
    dateIso: '2027-05-31',
    nameVi: 'Memorial Day (Mỹ) & Spring Bank Holiday (Anh)',
    nameEn: 'US Memorial Day & UK Spring Bank Holiday',
    region: 'US',
    affectedExchanges: ['MXV', 'CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
    mxvImpact: 'MXV_CLOSED',
    impactDescriptionVi:
      'Cả Mỹ (CBOT/CME/ICE US) và Anh (ICE Europe Robusta LRC) đều nghỉ; thanh khoản hàng hóa toàn cầu đóng cửa phần lớn.',
    affectedSymbols: ['RC', 'KC', 'SB', 'ZS', 'ZC', 'ZW', 'CL', 'BRN', 'SI', 'HG'],
  },
  {
    id: 'hol-2027-07-05-us',
    dateIso: '2027-07-05',
    nameVi: 'Nghỉ bù Quốc khánh Hoa Kỳ (Independence Day Obs.)',
    nameEn: 'US Independence Day (Observed)',
    region: 'US',
    affectedExchanges: ['CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE'],
    mxvImpact: 'PARTIAL_CLOSE',
    impactDescriptionVi: 'Thị trường hàng hóa Mỹ đóng cửa nghỉ Quốc khánh; ICE Europe Robusta LRC mở.',
    affectedSymbols: ['ZS', 'ZC', 'ZW', 'KC', 'SB', 'CT', 'CL', 'NG', 'SI'],
  },
  {
    id: 'hol-2027-09-02-vn',
    dateIso: '2027-09-02',
    nameVi: 'Quốc khánh Việt Nam 2/9',
    nameEn: 'Vietnam National Day',
    region: 'VIETNAM',
    affectedExchanges: ['MXV'],
    mxvImpact: 'MXV_CLOSED',
    impactDescriptionVi:
      'Nghỉ lễ Quốc khánh CHXHCN Việt Nam (2/9); theo dõi thông báo giao dịch/bù trừ chính thức của Sở Giao dịch Hàng hóa Việt Nam.',
    affectedSymbols: ['RC', 'KC', 'JRU', 'ZS', 'ZC', 'CL'],
  },
];

/**
 * Evaluates live trading session states in Asia/Ho_Chi_Minh (ICT) across major Vietnam MXV product groups.
 */
export function evaluateVietnamTradingSessions(
  now: Date = new Date()
): VietnamTradingSessionStatus[] {
  const vn = getZonedParts(now, VIETNAM_TIMEZONE);
  const nowMinutesIct = vn.hour * 60 + vn.minute;
  const activeHolidaysToday = MARKET_HOLIDAYS.filter((h) => h.dateIso === vn.dateIso);

  const isHolidayFor = (exchanges: ExchangeCode[]): MarketHolidayEntry | undefined =>
    activeHolidaysToday.find(
      (h) => h.mxvImpact === 'MXV_CLOSED' && h.affectedExchanges.some((ex) => exchanges.includes(ex))
    );

  // Convert local exchange windows into live ICT windows dynamically (accounts for US/UK DST automatically)
  const chiDelta = getZoneToIctDeltaMinutes(now, 'America/Chicago'); // CBOT/CME/NYMEX (720 winter, 780 summer)
  const nyDelta = getZoneToIctDeltaMinutes(now, 'America/New_York'); // ICE US
  const lonDelta = getZoneToIctDeltaMinutes(now, 'Europe/London'); // ICE Europe (Robusta LRC)
  const tokDelta = getZoneToIctDeltaMinutes(now, 'Asia/Tokyo'); // OSE/TOCOM (always -120 min)

  // Check Chicago weekend / session helper (in local exchange clock to handle midnight cleanly)
  const chi = getZonedParts(now, 'America/Chicago');
  const lon = getZonedParts(now, 'Europe/London');
  const ny = getZonedParts(now, 'America/New_York');
  const tok = getZonedParts(now, 'Asia/Tokyo');

  const isChiWeekend =
    chi.weekdayIndex === 6 ||
    (chi.weekdayIndex === 5 && chi.hour * 60 + chi.minute >= 16 * 60) ||
    (chi.weekdayIndex === 0 && chi.hour * 60 + chi.minute < 17 * 60);

  // 1. ICE Europe Robusta Coffee (LRC): London 09:00–17:30 Mon-Fri
  const robustaStartIct = formatHm(9 * 60 + lonDelta);
  const robustaEndIct = formatHm(17 * 60 + 30 + lonDelta);
  const robustaHol = isHolidayFor(['MXV', 'ICE']);
  const lonMin = lon.hour * 60 + lon.minute;
  const robustaOpen =
    lon.weekdayIndex >= 1 && lon.weekdayIndex <= 5 && lonMin >= 9 * 60 && lonMin < 17 * 60 + 30;

  // 2. ICE US Arabica / Sugar / Cotton (KCE, SBE, CTE): NY 04:15–13:30 Mon-Fri (KCE); 03:30–13:00 (SBE)
  const iceUsStartIct = formatHm(4 * 60 + 15 + nyDelta);
  const iceUsEndIct = formatHm(13 * 60 + 30 + nyDelta);
  const iceUsHol = isHolidayFor(['MXV', 'ICE']);
  const nyMin = ny.hour * 60 + ny.minute;
  const iceUsOpen =
    ny.weekdayIndex >= 1 && ny.weekdayIndex <= 5 && nyMin >= 4 * 60 + 15 && nyMin < 13 * 60 + 30;

  // 3. CBOT Grains & Oilseeds (ZSE, ZME, ZLE, ZCE, ZWA):
  // Chicago Sun-Fri Day+Night: Day/Overnight 19:00–07:45 CT, Break 07:45–08:30 CT, Day 08:30–13:20 CT
  const cbotAsiaOpenIct = formatHm(19 * 60 + chiDelta);
  const cbotBreakStartIct = formatHm(7 * 60 + 45 + chiDelta);
  const cbotUsOpenIct = formatHm(8 * 60 + 30 + chiDelta);
  const cbotCloseIct = formatHm(13 * 60 + 20 + chiDelta);
  const cbotHol = isHolidayFor(['MXV', 'CBOT']);
  const chiMin = chi.hour * 60 + chi.minute;
  let cbotState: SessionLiveState = 'CLOSED';
  let cbotReason = `Ngoài phiên (${cbotCloseIct}–${cbotAsiaOpenIct} ICT)`;
  if (cbotHol) {
    cbotState = 'HOLIDAY_CLOSED';
    cbotReason = `Đóng cửa nghỉ lễ: ${cbotHol.nameVi}`;
  } else if (chi.weekdayIndex >= 1 && chi.weekdayIndex <= 5) {
    if (chiMin >= 7 * 60 + 45 && chiMin < 8 * 60 + 30) {
      cbotState = 'BREAK';
      cbotReason = `Nghỉ chuyển phiên (${cbotBreakStartIct}–${cbotUsOpenIct} ICT)`;
    } else if (
      (chiMin >= 8 * 60 + 30 && chiMin < 13 * 60 + 20) ||
      (chiMin < 7 * 60 + 45 && chi.weekdayIndex >= 1) ||
      (chiMin >= 19 * 60 && chi.weekdayIndex < 5)
    ) {
      cbotState = 'OPEN';
      cbotReason =
        chiMin >= 8 * 60 + 30 ? 'Phiên chính Mỹ đang giao dịch' : 'Phiên Á–Âu đang giao dịch';
    }
  } else if (chi.weekdayIndex === 0 && chiMin >= 19 * 60) {
    cbotState = 'OPEN';
    cbotReason = 'Phiên mở đầu tuần (Đêm CN CT / Sáng Thứ 2 ICT)';
  }

  // 4. CME / COMEX / NYMEX Energy & Metals (CLE, NGE, SIE, CPE): ~23h (17:00–16:00 CT)
  const nymexOpenIct = formatHm(17 * 60 + chiDelta);
  const nymexCloseIct = formatHm(16 * 60 + chiDelta);
  const nymexHol = isHolidayFor(['MXV', 'NYMEX', 'COMEX']);
  let nymexState: SessionLiveState = 'OPEN';
  let nymexReason = 'Đang khớp lệnh liên tục Globex (23h/ngày)';
  if (nymexHol) {
    nymexState = 'HOLIDAY_CLOSED';
    nymexReason = `Đóng cửa nghỉ lễ: ${nymexHol.nameVi}`;
  } else if (isChiWeekend) {
    nymexState = 'CLOSED';
    nymexReason = 'Nghỉ cuối tuần sàn CME/NYMEX';
  } else if (chiMin >= 16 * 60 && chiMin < 17 * 60) {
    nymexState = 'BREAK';
    nymexReason = `Nghỉ bảo trì cuối ngày (${nymexCloseIct}–${nymexOpenIct} ICT)`;
  }

  // 5. OSE / TOCOM Rubber RSS3 (JRU): Tokyo 09:00–15:15 & 16:30–19:00 (Day+Evening) Mon-Fri
  const rubDayStart = formatHm(9 * 60 + tokDelta); // 07:00 ICT
  const rubDayEnd = formatHm(15 * 60 + 15 + tokDelta); // 13:15 ICT
  const rubEveStart = formatHm(16 * 60 + 30 + tokDelta); // 14:30 ICT
  const rubEveEnd = formatHm(19 * 60 + tokDelta); // 17:00 ICT
  const rubHol = isHolidayFor(['MXV']);
  const tokMin = tok.hour * 60 + tok.minute;
  const rubOpen =
    tok.weekdayIndex >= 1 &&
    tok.weekdayIndex <= 5 &&
    ((tokMin >= 9 * 60 && tokMin < 15 * 60 + 15) ||
      (tokMin >= 16 * 60 + 30 && tokMin < 19 * 60));

  // Suppress unused variable lint while preserving explicit local Vietnam clock context
  void nowMinutesIct;

  return [
    {
      id: 'session-mxv-robusta',
      labelVi: 'Cà phê Robusta & Ca cao (ICE Europe / MXV)',
      exchange: 'ICE',
      mxvProducts: ['LRC (Robusta)', 'CCE (Ca cao)', 'WSE (Đường trắng)'],
      symbols: ['RC', 'CC'],
      category: 'SOFT_COMMODITIES',
      sessionSlot: 'EU_ROBUSTA',
      ictHoursLabel: `${robustaStartIct} – ${robustaEndIct} ICT`,
      localExchangeTimezone: 'Europe/London',
      state: robustaHol ? 'HOLIDAY_CLOSED' : robustaOpen ? 'OPEN' : 'CLOSED',
      stateReason: robustaHol
        ? `Đóng cửa nghỉ lễ: ${robustaHol.nameVi}`
        : robustaOpen
          ? 'Phiên London đang khớp lệnh sôi động'
          : `Đóng cửa (Mở lại ${robustaStartIct} ICT Thứ 2–Thứ 6)`,
    },
    {
      id: 'session-mxv-ice-us',
      labelVi: 'Arabica, Đường thô & Bông sợi (ICE US / MXV)',
      exchange: 'ICE',
      mxvProducts: ['KCE (Arabica)', 'SBE (Đường 11)', 'CTE (Bông 2)'],
      symbols: ['KC', 'SB', 'CT'],
      category: 'SOFT_COMMODITIES',
      sessionSlot: 'EU_ROBUSTA',
      ictHoursLabel: `${iceUsStartIct} – ${iceUsEndIct} ICT`,
      localExchangeTimezone: 'America/New_York',
      state: iceUsHol ? 'HOLIDAY_CLOSED' : iceUsOpen ? 'OPEN' : 'CLOSED',
      stateReason: iceUsHol
        ? `Đóng cửa nghỉ lễ: ${iceUsHol.nameVi}`
        : iceUsOpen
          ? 'Phiên New York đang giao dịch'
          : `Đóng cửa (Mở ${iceUsStartIct} ICT Thứ 2–Thứ 6)`,
    },
    {
      id: 'session-mxv-cbot',
      labelVi: 'Nông sản CBOT (Đậu tương, Khô/Dầu đậu, Ngô, Lúa mì)',
      exchange: 'CBOT',
      mxvProducts: ['ZSE', 'ZME', 'ZLE', 'ZCE', 'ZWA'],
      symbols: ['ZS', 'ZM', 'ZL', 'ZC', 'ZW'],
      category: 'AGRICULTURE',
      sessionSlot: 'US_NIGHT',
      ictHoursLabel: `Á ${cbotAsiaOpenIct}–${cbotBreakStartIct} | Mỹ ${cbotUsOpenIct}–${cbotCloseIct} ICT`,
      localExchangeTimezone: 'America/Chicago',
      state: cbotState,
      stateReason: cbotReason,
    },
    {
      id: 'session-mxv-nymex-comex',
      labelVi: 'Năng lượng & Kim loại (NYMEX / COMEX / MXV)',
      exchange: 'NYMEX',
      mxvProducts: ['CLE (WTI)', 'BZE (Brent)', 'NGE (Khí)', 'SIE (Bạc)', 'CPE (Đồng)'],
      symbols: ['CL', 'BRN', 'NG', 'SI', 'HG', 'PL'],
      category: 'ENERGY',
      sessionSlot: 'ASIA_VN_DAY',
      ictHoursLabel: `${nymexOpenIct} – ${nymexCloseIct} (+1 ngày) ICT`,
      localExchangeTimezone: 'America/Chicago',
      state: nymexState,
      stateReason: nymexReason,
    },
    {
      id: 'session-mxv-rubber',
      labelVi: 'Cao su RSS3 (OSE Tokyo / MXV)',
      exchange: 'MXV',
      mxvProducts: ['JRU (Cao su RSS3)'],
      symbols: ['JRU'],
      category: 'SOFT_COMMODITIES',
      sessionSlot: 'ASIA_VN_DAY',
      ictHoursLabel: `Sáng ${rubDayStart}–${rubDayEnd} | Chiều ${rubEveStart}–${rubEveEnd} ICT`,
      localExchangeTimezone: 'Asia/Tokyo',
      state: rubHol ? 'HOLIDAY_CLOSED' : rubOpen ? 'OPEN' : 'CLOSED',
      stateReason: rubHol
        ? `Đóng cửa nghỉ lễ: ${rubHol.nameVi}`
        : rubOpen
          ? 'Phiên Tokyo đang giao dịch'
          : `Đóng cửa (Mở ${rubDayStart} ICT Thứ 2–Thứ 6)`,
    },
  ];
}

function addDaysUtc(baseDate: Date, offsetDays: number): Date {
  return new Date(baseDate.getTime() + offsetDays * 86_400_000);
}

/**
 * Generates upcoming deterministic macro & commodity calendar events in ICT (UTC+7)
 * across a rolling window starting from `anchorDate`.
 */
export function buildVietnamEconomicCalendar(
  anchorDate: Date = new Date(),
  horizonDays: number = 30
): EconomicCalendarEvent[] {
  const events: EconomicCalendarEvent[] = [];
  const vnToday = getZonedParts(anchorDate, VIETNAM_TIMEZONE);
  const nyDelta = getZoneToIctDeltaMinutes(anchorDate, 'America/New_York');

  const eiaPetroTimeIct = formatHm(10 * 60 + 30 + nyDelta); // 21:30 or 22:30 ICT Wed
  const usdaExportTimeIct = formatHm(8 * 60 + 30 + nyDelta); // 19:30 or 20:30 ICT Thu
  const eiaGasTimeIct = formatHm(10 * 60 + 30 + nyDelta); // 21:30 or 22:30 ICT Thu

  const holidayDatesMap = new Map<string, MarketHolidayEntry[]>();
  for (const h of MARKET_HOLIDAYS) {
    const arr = holidayDatesMap.get(h.dateIso) ?? [];
    arr.push(h);
    holidayDatesMap.set(h.dateIso, arr);
  }

  for (let d = 0; d <= horizonDays; d++) {
    const dayDate = addDaysUtc(anchorDate, d);
    const vn = getZonedParts(dayDate, VIETNAM_TIMEZONE);
    const holidaysToday = holidayDatesMap.get(vn.dateIso) ?? [];

    // Include holidays inside the horizon
    for (const h of holidaysToday) {
      events.push({
        id: h.id,
        titleVi: h.nameVi,
        titleEn: h.nameEn,
        type: 'MARKET_HOLIDAY',
        category: h.affectedSymbols.includes('CL') ? 'ENERGY' : 'SOFT_COMMODITIES',
        sessionSlot:
          h.region === 'VIETNAM' || h.region === 'JAPAN'
            ? 'ASIA_VN_DAY'
            : h.region === 'UK_EU'
              ? 'EU_ROBUSTA'
              : 'US_NIGHT',
        ictTimeLabel: 'Cả ngày (All Day ICT)',
        dateIso: h.dateIso,
        ictIsoTimestamp: `${h.dateIso}T00:00:00+07:00`,
        sourceAgency: `${h.region} Exchange Calendar`,
        impactLevel: h.mxvImpact === 'MXV_CLOSED' ? 'HIGH' : 'MEDIUM',
        relatedSymbols: h.affectedSymbols,
        mxvImpactNote: h.impactDescriptionVi,
        cadenceLabel: 'Market Holiday',
      });
    }

    // 1. Weekly EIA Crude Oil Inventories — Wednesday evening ICT (unless US holiday shifts it to Thu)
    if (vn.weekdayIndex === 3) {
      events.push({
        id: `eia-crude-${vn.dateIso}`,
        titleVi: 'Báo cáo Tồn kho Dầu thô Mỹ hàng tuần (EIA Petroleum Status)',
        titleEn: 'EIA Weekly Petroleum Status Report',
        type: 'MACRO_RELEASE',
        category: 'ENERGY',
        sessionSlot: 'US_NIGHT',
        ictTimeLabel: `${eiaPetroTimeIct} ICT`,
        dateIso: vn.dateIso,
        ictIsoTimestamp: `${vn.dateIso}T${eiaPetroTimeIct}:00+07:00`,
        sourceAgency: 'U.S. EIA (api.eia.gov)',
        impactLevel: 'HIGH',
        relatedSymbols: ['CL', 'BRN'],
        mxvImpactNote:
          'Biến động mạnh nhóm Năng lượng MXV (CLE, BZE); đồng bộ trực tiếp được qua EIA_API_KEY.',
        cadenceLabel: 'Hàng tuần (Thứ 4 ICT)',
      });
    }

    // 2. Weekly USDA Export Sales & EIA Natural Gas Storage — Thursday evening ICT
    if (vn.weekdayIndex === 4) {
      events.push({
        id: `usda-export-${vn.dateIso}`,
        titleVi: 'Báo cáo Doanh số Xuất khẩu Nông sản Mỹ (USDA Export Sales)',
        titleEn: 'USDA Weekly Export Sales',
        type: 'MACRO_RELEASE',
        category: 'AGRICULTURE',
        sessionSlot: 'US_NIGHT',
        ictTimeLabel: `${usdaExportTimeIct} ICT`,
        dateIso: vn.dateIso,
        ictIsoTimestamp: `${vn.dateIso}T${usdaExportTimeIct}:00+07:00`,
        sourceAgency: 'USDA FAS',
        impactLevel: 'HIGH',
        relatedSymbols: ['ZS', 'ZM', 'ZL', 'ZC', 'ZW', 'CT'],
        mxvImpactNote:
          'Dẫn dắt dòng tiền phiên tối Nông sản CBOT/MXV (Đậu tương, Khô đậu, Ngô, Lúa mì, Bông).',
        cadenceLabel: 'Hàng tuần (Thứ 5 ICT)',
      });

      events.push({
        id: `eia-ng-${vn.dateIso}`,
        titleVi: 'Báo cáo Tồn kho Khí tự nhiên Mỹ (EIA Natural Gas Storage)',
        titleEn: 'EIA Weekly Natural Gas Storage',
        type: 'MACRO_RELEASE',
        category: 'ENERGY',
        sessionSlot: 'US_NIGHT',
        ictTimeLabel: `${eiaGasTimeIct} ICT`,
        dateIso: vn.dateIso,
        ictIsoTimestamp: `${vn.dateIso}T${eiaGasTimeIct}:00+07:00`,
        sourceAgency: 'U.S. EIA (api.eia.gov)',
        impactLevel: 'HIGH',
        relatedSymbols: ['NG'],
        mxvImpactNote:
          'Gây giật biên độ mạnh hợp đồng Khí tự nhiên MXV (NGE); hỗ trợ đồng bộ qua EIA_API_KEY.',
        cadenceLabel: 'Hàng tuần (Thứ 5 ICT)',
      });
    }

    // 3. Vietnam General Department of Customs & VICOFA Semi-monthly Coffee Export Update (~2nd & 17th)
    if (vn.day === 2 || vn.day === 17) {
      events.push({
        id: `vn-customs-coffee-${vn.dateIso}`,
        titleVi: 'Thống kê Xuất khẩu Cà phê & Cao su Việt Nam (Hải quan VN / VICOFA)',
        titleEn: 'Vietnam Customs Semi-Monthly Coffee & Rubber Exports',
        type: 'MACRO_RELEASE',
        category: 'SOFT_COMMODITIES',
        sessionSlot: 'ASIA_VN_DAY',
        ictTimeLabel: '09:00 – 16:00 ICT',
        dateIso: vn.dateIso,
        ictIsoTimestamp: `${vn.dateIso}T10:00:00+07:00`,
        sourceAgency: 'Tổng cục Hải quan VN / VICOFA',
        impactLevel: 'HIGH',
        relatedSymbols: ['RC', 'JRU'],
        mxvImpactNote:
          'Tác động trực tiếp nguồn cung giao ngay Tây Nguyên và mở cửa phiên Robusta ICE/MXV (LRC) lúc 15:00–16:00 ICT.',
        cadenceLabel: 'Định kỳ 2 lần/tháng (Giờ VN)',
      });
    }

    // 4. USDA WASDE Monthly Supply/Demand Report (typically ~9th–12th of month, weekday)
    if (vn.day >= 9 && vn.day <= 12 && vn.weekdayIndex >= 1 && vn.weekdayIndex <= 5 && vn.day === 10) {
      const wasdeTimeIct = formatHm(12 * 60 + nyDelta);
      events.push({
        id: `usda-wasde-${vn.dateIso}`,
        titleVi: 'Báo cáo Cung Cầu Nông sản Toàn cầu (USDA WASDE)',
        titleEn: 'USDA Monthly WASDE Report',
        type: 'MACRO_RELEASE',
        category: 'AGRICULTURE',
        sessionSlot: 'US_NIGHT',
        ictTimeLabel: `~${wasdeTimeIct} ICT`,
        dateIso: vn.dateIso,
        ictIsoTimestamp: `${vn.dateIso}T${wasdeTimeIct}:00+07:00`,
        sourceAgency: 'USDA OCE',
        impactLevel: 'HIGH',
        relatedSymbols: ['ZS', 'ZM', 'ZL', 'ZC', 'ZW', 'CT', 'SB'],
        mxvImpactNote:
          'Sự kiện vĩ mô quan trọng nhất tháng đối với Nông sản & Bông trên MXV; kiểm tra tỷ lệ ký quỹ trước giờ ra tin.',
        cadenceLabel: 'Hàng tháng (Quanh ngày 9–12)',
      });
    }

    // 5. SBV Central USD/VND Rate & Interbank Liquidity Open (Weekdays Asia VN morning)
    if (vn.weekdayIndex >= 1 && vn.weekdayIndex <= 5 && d <= 2) {
      events.push({
        id: `sbv-fx-${vn.dateIso}`,
        titleVi: 'Tỷ giá Trung tâm USD/VND (NHNN) & Thanh toán Ký quỹ MXV',
        titleEn: 'SBV Central USD/VND Fix & MXV VND Settlement Window',
        type: 'MACRO_RELEASE',
        category: 'MACRO_FX',
        sessionSlot: 'ASIA_VN_DAY',
        ictTimeLabel: '08:30 – 16:30 ICT',
        dateIso: vn.dateIso,
        ictIsoTimestamp: `${vn.dateIso}T08:30:00+07:00`,
        sourceAgency: 'Ngân hàng Nhà nước VN (SBV)',
        impactLevel: 'MEDIUM',
        relatedSymbols: ['RC', 'ZS', 'CL'],
        mxvImpactNote:
          'Ảnh hưởng trực tiếp quy đổi ký quỹ VND/USD và giá cà phê/nông sản nội địa tại Việt Nam.',
        cadenceLabel: 'Phiên sáng Việt Nam',
      });
    }
  }

  // Ensure any future holidays within 365 days remain reachable in holiday-only views if horizonDays >= 60
  if (horizonDays >= 60) {
    for (const h of MARKET_HOLIDAYS) {
      if (h.dateIso >= vnToday.dateIso && !events.some((e) => e.id === h.id)) {
        events.push({
          id: h.id,
          titleVi: h.nameVi,
          titleEn: h.nameEn,
          type: 'MARKET_HOLIDAY',
          category: h.affectedSymbols.includes('CL') ? 'ENERGY' : 'SOFT_COMMODITIES',
          sessionSlot:
            h.region === 'VIETNAM' || h.region === 'JAPAN'
              ? 'ASIA_VN_DAY'
              : h.region === 'UK_EU'
                ? 'EU_ROBUSTA'
                : 'US_NIGHT',
          ictTimeLabel: 'Cả ngày (All Day ICT)',
          dateIso: h.dateIso,
          ictIsoTimestamp: `${h.dateIso}T00:00:00+07:00`,
          sourceAgency: `${h.region} Exchange Calendar`,
          impactLevel: h.mxvImpact === 'MXV_CLOSED' ? 'HIGH' : 'MEDIUM',
          relatedSymbols: h.affectedSymbols,
          mxvImpactNote: h.impactDescriptionVi,
          cadenceLabel: 'Market Holiday',
        });
      }
    }
  }

  return events.sort((a, b) => a.ictIsoTimestamp.localeCompare(b.ictIsoTimestamp));
}

export interface CalendarFilterCriteria {
  eventType: 'ALL' | CalendarEventType;
  sessionSlot: 'ALL' | VietnamSessionSlot;
  category: 'ALL' | ProductCategory | 'MACRO_FX';
  region: 'ALL' | 'VIETNAM' | 'GLOBAL';
}

export function filterVietnamCalendarEvents(
  events: EconomicCalendarEvent[],
  criteria: CalendarFilterCriteria
): EconomicCalendarEvent[] {
  return events.filter((ev) => {
    if (criteria.eventType !== 'ALL' && ev.type !== criteria.eventType) return false;
    if (criteria.sessionSlot !== 'ALL' && ev.sessionSlot !== criteria.sessionSlot) return false;
    if (criteria.category !== 'ALL' && ev.category !== criteria.category) return false;
    if (criteria.region === 'VIETNAM') {
      const isVn =
        ev.sourceAgency.includes('VN') ||
        ev.sourceAgency.includes('VIETNAM') ||
        ev.sourceAgency.includes('VICOFA') ||
        ev.sourceAgency.includes('SBV') ||
        ev.relatedSymbols.includes('RC');
      if (!isVn) return false;
    }
    return true;
  });
}
