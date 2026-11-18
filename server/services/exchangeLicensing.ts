import type { ExchangeCode } from '../../src/shared/types/instrument.ts';

export type AccessTier =
  | 'FREE_PUBLIC'
  | 'FREE_API_KEY'
  | 'MEMBER_ONLY'
  | 'LICENSED_COMMERCIAL'
  | 'UNOFFICIAL_PERSONAL';

export interface ExchangeProviderAssessment {
  id: string;
  exchangeGroup: string;
  exchanges: ExchangeCode[];
  primaryOfficialFeed: string;
  accessTier: AccessTier;
  requiresPaidLicense: boolean;
  publicApiAvailable: boolean;
  supportedFreeSources: string[];
  rateLimitNote: string;
  contractRollPolicy: string;
  csvImportTemplateHint: string;
  legalAndComplianceNote: string;
}

/**
 * Task 3: Independent Exchange Adapter & Licensing Matrix.
 * Evaluates true data availability, license boundaries, and CSV fallback mechanisms for
 * MXV, CME/CBOT, ICE, COMEX, NYMEX — without unauthorized scraping or simulated prices.
 */
export const EXCHANGE_LICENSING_MATRIX: readonly ExchangeProviderAssessment[] = [
  {
    id: 'MXV_EXCHANGE',
    exchangeGroup: 'MXV — Sở Giao dịch Hàng hóa Việt Nam',
    exchanges: ['MXV'],
    primaryOfficialFeed: 'MXV Official / CQG M-System Member Feed (MXV_API_URL + MXV_API_KEY)',
    accessTier: 'MEMBER_ONLY',
    requiresPaidLicense: true,
    publicApiAvailable: false,
    supportedFreeSources: ['CSV Historical Upload (POST /api/data/import)', 'Linked International Proxy (ICE/CBOT via FMP/Yahoo)'],
    rateLimitNote: 'Realtime L1/L2 qua CQG/M-System dành riêng cho Thành viên Kinh doanh MXV; không có REST/WS công khai miễn phí.',
    contractRollPolicy: 'Mỗi kỳ hạn (vd LRCZ26, JRUH26) tách biệt khỏi chuỗi CONTINUOUS; không nối giá thủ công bỏ qua chênh lệch kỳ hạn.',
    csvImportTemplateHint: 'Export dữ liệu ngày/H4 từ CQG/TradingView/Sở (Date,Open,High,Low,Close,Volume,Open Interest) chọn timezone Asia/Ho_Chi_Minh.',
    legalAndComplianceNote: 'Cấm crawl trái phép cổng MXV/CQG. Dùng kết nối thành viên hợp lệ hoặc CSV chính thống từ phần mềm giao dịch được cấp phép.',
  },
  {
    id: 'CME_CBOT_GROUP',
    exchangeGroup: 'CME Group / CBOT (Nông sản: ZC, ZS, ZM, ZL, ZW, ZR, TIO)',
    exchanges: ['CBOT', 'CME'],
    primaryOfficialFeed: 'CME DataMine / Market Data Platform (CME_DATAMINE_API_KEY)',
    accessTier: 'LICENSED_COMMERCIAL',
    requiresPaidLicense: true,
    publicApiAvailable: false,
    supportedFreeSources: [
      'Yahoo Finance Delayed Continuous (YAHOO_ENABLED=true, ~10m delay, 2y–10y D1, CBOT grains/soy)',
      'CFTC Disaggregated COT (Socrata + Historical ZIP, miễn phí 100%)',
      'USDA NASS QuickStats (USDA_API_KEY miễn phí)',
    ],
    rateLimitNote: 'CME DataMine tính phí thương mại theo dataset; Yahoo chart endpoint giới hạn <= 1 req/s (dành cho nghiên cứu cá nhân).',
    contractRollPolicy: 'Tách riêng hợp đồng kỳ hạn cụ thể (ZCH25) với CONTINUOUS (UNADJUSTED / BACK_ADJUSTED / RATIO_ADJUSTED).',
    csvImportTemplateHint: 'Chuẩn hóa đơn vị US cents/bushel (ZC, ZS, ZW) vs USD/short ton (ZM) vs USD/cwt (ZR); timezone America/Chicago.',
    legalAndComplianceNote: 'CME DataMine yêu cầu hợp đồng bản quyền thương mại. Dữ liệu Yahoo Finance chỉ dùng cho mục đích cá nhân, ghi rõ nhãn UNOFFICIAL DELAYED.',
  },
  {
    id: 'ICE_FUTURES_GROUP',
    exchangeGroup: 'ICE Futures US & Europe (RC, KC, SB, CC, CT, BRN)',
    exchanges: ['ICE'],
    primaryOfficialFeed: 'ICE Consolidated Feed / WebICE (ICE_API_KEY)',
    accessTier: 'LICENSED_COMMERCIAL',
    requiresPaidLicense: true,
    publicApiAvailable: false,
    supportedFreeSources: [
      'Yahoo Finance Delayed Continuous (KC=F, SB=F, CC=F ~30m delay; KHÔNG hỗ trợ RC=F Robusta & CT=F chính xác)',
      'Commodities-API / FMP (yêu cầu API key riêng)',
      'CFTC COT cho ICE US (KC, SB, CC, CT)',
    ],
    rateLimitNote: 'ICE Data Services yêu cầu hợp đồng doanh nghiệp; Robusta (RC) và Cotton (CT) không có feed Yahoo hợp lệ -> cần FMP/Commodities-API/CSV.',
    contractRollPolicy: 'Đọc tháng hợp đồng ICE (H/K/N/U/Z cho Coffee/Sugar; F/H/K/N/U/X cho Robusta) từ contractCode chuẩn.',
    csvImportTemplateHint: 'Robusta ICE Europe tính theo USD/metric ton (timezone Europe/London); KC/SB/CT theo US cents/lb (America/New_York).',
    legalAndComplianceNote: 'ICE không cung cấp API giá miễn phí công khai. Không tự suy diễn giá RC từ KC hay BZ từ BRN.',
  },
  {
    id: 'COMEX_METALS_GROUP',
    exchangeGroup: 'COMEX Metals (Vàng GC, Bạc SI, Đồng HG, Bạch kim PL)',
    exchanges: ['COMEX'],
    primaryOfficialFeed: 'CME DataMine COMEX (CME_DATAMINE_API_KEY) / Twelve Data Spot (TWELVEDATA_API_KEY)',
    accessTier: 'FREE_API_KEY',
    requiresPaidLicense: false,
    publicApiAvailable: false,
    supportedFreeSources: [
      'Twelve Data Free Tier (XAU/USD, XAG/USD, XPT/USD — 8 req/min, 800/day, cần TWELVEDATA_API_KEY)',
      'Yahoo Finance Continuous (GC=F, SI=F, HG=F, PL=F — ~30m delay, tới 10y D1)',
      'CFTC Disaggregated COT (GC, SI, HG, PL)',
    ],
    rateLimitNote: 'Twelve Data miễn phí 800 request/ngày; FMP miễn phí 250 request/ngày; CFTC miễn phí hoàn toàn.',
    contractRollPolicy: 'Đồng HG (USD/lb) cần kiểm tra nghiêm ngặt tránh nhầm với LME Đồng (USD/tấn); giữ riêng COMEX vs Spot FX.',
    csvImportTemplateHint: 'Vàng/Bạc/Bạch kim đơn vị USD/troy oz; Đồng HG đơn vị USD/lb; timezone America/New_York.',
    legalAndComplianceNote: 'Twelve Data XAU/USD là giá spot proxy (tách rõ khỏi hợp đồng tương lai COMEX GC nếu so sánh kỳ hạn).',
  },
  {
    id: 'NYMEX_ENERGY_GROUP',
    exchangeGroup: 'NYMEX Energy (Dầu WTI CL, Khí tự nhiên NG)',
    exchanges: ['NYMEX'],
    primaryOfficialFeed: 'CME DataMine NYMEX / U.S. EIA Open Data v2 Spot & Inventories',
    accessTier: 'FREE_API_KEY',
    requiresPaidLicense: false,
    publicApiAvailable: true,
    supportedFreeSources: [
      'U.S. EIA Open Data v2 (miễn phí 100%, key chính phủ — WTI/Brent spot + tồn kho dầu/khí hàng tuần)',
      'Yahoo Finance Continuous (CL=F, NG=F — ~30m delay, 5y–10y D1)',
      'CFTC Disaggregated COT (CL, NG)',
    ],
    rateLimitNote: 'EIA v2 API miễn phí chính thức; Alpha Vantage miễn phí 25 req/day cho WTI/NG.',
    contractRollPolicy: 'WTI CL từng có giá âm lịch sử ngày 20/04/2020 (-37.63 USD/bbl); Continuous BACK_ADJUSTED cũng có thể âm — bật flag allowNonPositivePrices đúng ngữ cảnh.',
    csvImportTemplateHint: 'WTI CL đơn vị USD/barrel; NG đơn vị USD/MMBtu; timezone America/New_York.',
    legalAndComplianceNote: 'EIA cung cấp giá spot Cushing (D1) và báo cáo tồn kho chính thức hoàn toàn miễn phí và hợp lệ thương mại/nghiên cứu.',
  },
  {
    id: 'MACRO_CFTC_PUBLIC',
    exchangeGroup: 'Vĩ mô FRED & Định vị CFTC COT (Công khai / Không cần key hoặc Free Key)',
    exchanges: ['CBOT', 'CME', 'COMEX', 'NYMEX', 'ICE', 'MXV'],
    primaryOfficialFeed: 'FRED Public CSV & API + CFTC Socrata/Historical Archive',
    accessTier: 'FREE_PUBLIC',
    requiresPaidLicense: false,
    publicApiAvailable: true,
    supportedFreeSources: [
      'CFTC Socrata Open Data API + CFTC Historical .zip (Public domain US Gov, 0 key)',
      'FRED Public CSV fredgraph.csv (DTWEXBGS, FEDFUNDS, DGS10, CPIAUCSL — 0 key) hoặc FRED_API_KEY JSON',
    ],
    rateLimitNote: 'CFTC & FRED public CSV không cần khóa API; chạy nối tiếp lịch sự, tôn trọng publication lag.',
    contractRollPolicy: 'CFTC COT chốt vị thế thứ Ba và công bố thứ Sáu 15:30 ET (+3 ngày trễ) — tuyệt đối áp dụng no-look-ahead.',
    csvImportTemplateHint: 'Hoàn toàn tự động qua POST /api/cot/sync và Sync Public Macro.',
    legalAndComplianceNote: 'Dữ liệu công bố chính thức của Chính phủ Hoa Kỳ (CFTC / Federal Reserve St. Louis), hợp lệ để phân tích định lượng.',
  },
];
