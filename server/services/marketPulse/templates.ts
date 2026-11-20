/** Fixed, neutral Vietnamese/English templates for the market pulse. No forecasts, no recommendations. */
import type { MarketPulse, PulseIndicator, PulseText } from '../../../src/shared/types/marketPulse.ts';

export const FOMC_CALENDAR_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';

export const PULSE_DISCLAIMER: PulseText = {
  vi: 'Công cụ nghiên cứu, không phải khuyến nghị mua/bán. Các câu mô tả được tạo tự động theo mẫu cố định từ số liệu, không dự báo giá. Quan hệ giữa biến số vĩ mô và giá hàng hoá thay đổi theo thời kỳ.',
  en: 'Research tool, not a buy/sell recommendation. Sentences are generated from fixed templates over the numbers and do not forecast prices. Relationships between macro variables and commodity prices change over time.',
};

export const FOMC_NOTE: PulseText = {
  vi: 'Chưa có nguồn máy đọc được chính thức cho lịch họp FOMC, nên không hiển thị ngày cụ thể. Xem lịch chính thức tại trang của Cục Dự trữ Liên bang.',
  en: 'No official machine-readable source for FOMC meeting dates is wired in, so no dates are shown. See the official calendar on the Federal Reserve website.',
};

export const PULSE_EXPLANATIONS: MarketPulse['explanations'] = [
  {
    id: 'fedfunds',
    title: { vi: 'Lãi suất Fed (Fed funds)', en: 'Fed funds rate' },
    body: {
      vi: 'Lãi suất chính sách cao hơn thường làm đồng USD hấp dẫn hơn và tăng chi phí giữ hàng tồn kho, nên có xu hướng gây áp lực lên giá hàng hoá tính bằng USD; lãi suất giảm thường có chiều ngược lại. Đây là quan hệ chung, không cố định và hay bị các yếu tố cung cầu lấn át.',
      en: 'A higher policy rate tends to support the dollar and raise inventory carrying costs, which often weighs on USD-priced commodities; lower rates tend to work the other way. This is a general relationship, not fixed, and supply and demand factors often dominate.',
    },
  },
  {
    id: 'yields',
    title: { vi: 'Lợi suất trái phiếu 2 năm và 10 năm, chênh lệch 10Y-2Y', en: '2Y and 10Y yields, 10Y-2Y spread' },
    body: {
      vi: 'Lợi suất 2 năm phản ánh kỳ vọng thị trường về lãi suất ngắn hạn; lợi suất 10 năm phản ánh kỳ vọng dài hơn. Chênh lệch 10Y-2Y âm (đường cong đảo ngược) trong quá khứ thường đi trước giai đoạn tăng trưởng chậm lại, nhưng độ trễ rất thay đổi và không phải lúc nào cũng xảy ra. Tăng trưởng yếu có thể làm giảm nhu cầu với kim loại công nghiệp và năng lượng.',
      en: 'The 2Y yield reflects market expectations for short-term rates; the 10Y reflects longer expectations. A negative 10Y-2Y spread (inverted curve) has historically preceded slower growth, but the lag varies and it does not always happen. Weaker growth can reduce demand for industrial metals and energy.',
    },
  },
  {
    id: 'cpi',
    title: { vi: 'Lạm phát CPI', en: 'CPI inflation' },
    body: {
      vi: 'Lạm phát cao hơn kỳ vọng thường khiến thị trường dự đoán lãi suất cao lâu hơn, đồng thời một số hàng hoá (năng lượng, nông sản) tự là thành phần của CPI. Vàng đôi khi được xem là công cụ giữ giá trị khi lạm phát cao, nhưng quan hệ này không ổn định giữa các giai đoạn.',
      en: 'Inflation above expectations often leads markets to price higher rates for longer, and some commodities (energy, food) are themselves CPI components. Gold is sometimes viewed as a store of value when inflation is high, but that link is unstable across periods.',
    },
  },
  {
    id: 'realyield',
    title: { vi: 'Lợi suất thực 10 năm', en: '10Y real yield' },
    body: {
      vi: 'Lãi suất thực tăng thường gây áp lực lên vàng vì chi phí cơ hội nắm giữ tài sản không sinh lãi tăng; lãi suất thực giảm thường có chiều ngược lại. Quan hệ không cố định và có những giai đoạn vàng đi ngược.',
      en: 'Rising real yields often weigh on gold because the opportunity cost of holding a non-yielding asset rises; falling real yields tend to work the other way. The relationship is not fixed and gold has diverged in some periods.',
    },
  },
  {
    id: 'usd',
    title: { vi: 'Chỉ số đồng USD diện rộng', en: 'Broad dollar index' },
    body: {
      vi: 'Hàng hoá chủ yếu niêm yết bằng USD, nên USD mạnh lên thường làm giá tính bằng USD chịu áp lực (người mua dùng tiền khác phải trả đắt hơn) và ngược lại. Hệ số tương quan trong thẻ nhóm hàng chỉ mô tả 60 phiên gần nhất, không chứng minh quan hệ nhân quả.',
      en: 'Commodities are mostly quoted in USD, so a stronger dollar often pressures USD prices (buyers using other currencies pay more) and vice versa. The correlation shown per group describes only the last 60 sessions and does not prove causation.',
    },
  },
];

const f1 = (x: number): string => x.toFixed(2);
const sgn = (x: number, d = 2): string => `${x > 0 ? '+' : ''}${x.toFixed(d)}`;

export interface SummaryInput {
  fed: PulseIndicator[];
  commodities: {
    breadth: { instrumentsWithData: number; up1d: number; down1d: number; up5d: number; down5d: number; asOf: string | null };
    avg5d: number | null;
    avg20d: number | null;
    groups: { group: string; label: PulseText; volLevel: 'HIGH' | 'NORMAL' | 'LOW' | null }[];
  };
}

const VOL_VI = { HIGH: 'cao', NORMAL: 'bình thường', LOW: 'thấp' } as const;
const VOL_EN = { HIGH: 'high', NORMAL: 'normal', LOW: 'low' } as const;

/** 3-5 neutral sentences built only from available numbers. */
export function buildPulseSummary(x: SummaryInput): PulseText[] {
  const out: PulseText[] = [];
  const by = (id: PulseIndicator['id']) => x.fed.find((i) => i.id === id);
  const ff = by('FED_FUNDS');
  const y10 = by('DGS10');
  const sp = by('SPREAD_10Y2Y');
  const cpi = by('CPI_YOY');
  const real = by('REAL_10Y');
  const usd = by('USD_BROAD');

  if (ff?.value != null) {
    out.push({
      vi: `Lãi suất Fed funds hiệu dụng là ${f1(ff.value)}% (số liệu ${ff.asOf}); lợi suất 10 năm${y10?.value != null ? ` là ${f1(y10.value)}%` : ' chưa có số liệu'}.`,
      en: `The effective Fed funds rate is ${f1(ff.value)}% (as of ${ff.asOf}); the 10Y yield ${y10?.value != null ? `is ${f1(y10.value)}%` : 'is unavailable'}.`,
    });
  }
  if (sp?.value != null) {
    const inv = sp.value < 0;
    out.push({
      vi: `Chênh lệch lợi suất 10Y-2Y là ${sgn(sp.value)} điểm %, đường cong đang ${inv ? 'đảo ngược (ngắn hạn cao hơn dài hạn)' : 'dốc lên bình thường (dài hạn cao hơn ngắn hạn)'}.`,
      en: `The 10Y-2Y spread is ${sgn(sp.value)} pp, so the curve is ${inv ? 'inverted (short-term above long-term)' : 'upward sloping (long-term above short-term)'}.`,
    });
  }
  if (cpi?.value != null) {
    out.push({
      vi: `CPI Mỹ tăng ${f1(cpi.value)}% so với cùng kỳ năm trước (tháng ${cpi.asOf?.slice(0, 7)})${real?.value != null ? `, lợi suất thực 10 năm ${f1(real.value)}%` : ''}.`,
      en: `US CPI is up ${f1(cpi.value)}% year over year (month ${cpi.asOf?.slice(0, 7)})${real?.value != null ? `, 10Y real yield ${f1(real.value)}%` : ''}.`,
    });
  }
  if (usd?.value != null && usd.change1m != null) {
    out.push({
      vi: `Chỉ số USD diện rộng ở mức ${f1(usd.value)}, ${usd.change1m >= 0 ? 'tăng' : 'giảm'} ${Math.abs(usd.change1m).toFixed(2)}% so với 1 tháng trước.`,
      en: `The broad dollar index is ${f1(usd.value)}, ${usd.change1m >= 0 ? 'up' : 'down'} ${Math.abs(usd.change1m).toFixed(2)}% from one month ago.`,
    });
  }
  const b = x.commodities.breadth;
  if (b.instrumentsWithData > 0) {
    const vols = x.commodities.groups.filter((g) => g.volLevel);
    const volVi = vols.map((g) => `${g.label.vi.toLowerCase()} ${VOL_VI[g.volLevel!]}`).join(', ');
    const volEn = vols.map((g) => `${g.label.en.toLowerCase()} ${VOL_EN[g.volLevel!]}`).join(', ');
    out.push({
      vi: `Trong ${b.instrumentsWithData} mã có dữ liệu, ${b.up1d} mã tăng và ${b.down1d} mã giảm ở phiên gần nhất (5 phiên: ${b.up5d} tăng, ${b.down5d} giảm)${volVi ? `; biến động so với chính 1 năm qua: ${volVi}` : ''}.`,
      en: `Of ${b.instrumentsWithData} instruments with data, ${b.up1d} rose and ${b.down1d} fell in the latest session (5 sessions: ${b.up5d} up, ${b.down5d} down)${volEn ? `; volatility versus its own past year: ${volEn}` : ''}.`,
    });
  }
  return out.slice(0, 5);
}
