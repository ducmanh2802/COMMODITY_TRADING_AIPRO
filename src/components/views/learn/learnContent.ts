import type { AppModuleId } from '../../../shared/types/risk';

/**
 * Structured Vietnamese lesson content for the "Học" module (mirrors docs/LEARNING_PATH.md).
 * Plain data — no markdown parsing. Regulatory/market facts carry a source URL.
 */

export type ExerciseId = 'tick-pnl' | 'margin-leverage' | 'position-sizing' | 'curve-quiz';

export interface Source {
  label: string;
  url: string;
}

export interface Lesson {
  id: string;
  title: string;
  points: string[];
  example?: string;
  links?: { module: AppModuleId; label: string }[];
  sources?: Source[];
  exercise?: ExerciseId;
}

export interface Level {
  id: string;
  title: string;
  goal: string;
  lessons: Lesson[];
}

const FINHAY_RULES: Source = { label: 'Quy định giao dịch HHPS (thành viên Finhay)', url: 'https://www.finhay.com.vn/quy-dinh-giao-dich-hang-hoa-phai-sinh' };
const MXV_OVERVIEW: Source = { label: 'MXV – tổng quan', url: 'https://en.mxv.com.vn/overview.html' };
const MXV_MARGIN: Source = { label: 'MXV – bảng ký quỹ', url: 'https://en.mxv.com.vn/trading/margin.html' };

export const LEVELS: Level[] = [
  {
    id: 'l1',
    title: 'Cấp 1 — Nền tảng',
    goal: 'Hiểu hợp đồng tương lai là gì, một bước giá đáng bao nhiêu tiền, và đòn bẩy nguy hiểm thế nào.',
    lessons: [
      {
        id: 'l1-instruments',
        title: 'Forward, futures, options',
        points: [
          'Forward: thỏa thuận riêng mua/bán tại giá định trước, giao trong tương lai; không qua sàn nên có rủi ro đối tác.',
          'Futures: forward được chuẩn hóa (khối lượng, chất lượng, tháng giao), giao dịch trên sàn; trung tâm bù trừ đứng giữa, lãi/lỗ thanh toán hằng ngày.',
          'Options: người mua trả phí (premium) để có quyền — không phải nghĩa vụ — mua (call) hoặc bán (put). Người bán quyền chọn nhận phí nhưng chịu nghĩa vụ, rủi ro có thể rất lớn.',
        ],
      },
      {
        id: 'l1-specs',
        title: 'Đặc tả hợp đồng, tick và tick value',
        points: [
          'Mỗi hợp đồng có: khối lượng, đơn vị yết giá, bước giá tối thiểu (tick), giá trị một bước giá (tick value), tháng niêm yết, giờ giao dịch, phương thức thanh toán.',
          'Tick value = khối lượng × tick (quy ra USD). Ví dụ Ngô CBOT (ZC): 5.000 bushel × 0,25 cent = 12,5 USD.',
          'Lãi/lỗ = (biến động giá ÷ tick) × tick value × số hợp đồng.',
        ],
        example: 'Ngô tăng 10 cent/bushel = 40 tick × 12,5 USD = 500 USD mỗi hợp đồng (chưa trừ phí). Hãy tự kiểm tra bằng bài tập bên dưới.',
        links: [{ module: 'explorer', label: 'Contract Explorer' }],
        exercise: 'tick-pnl',
      },
      {
        id: 'l1-longshort',
        title: 'Long và short',
        points: [
          'Long (mua): lãi khi giá tăng. Short (bán): lãi khi giá giảm.',
          'Với futures có thể bán trước mà không cần có hàng — nhưng lỗ của vị thế short về lý thuyết không giới hạn.',
        ],
      },
      {
        id: 'l1-margin',
        title: 'Ký quỹ và đòn bẩy',
        points: [
          'Bạn chỉ nộp ký quỹ ban đầu, không trả toàn bộ giá trị hợp đồng. Dưới mức duy trì → gọi ký quỹ; xuống sâu hơn → thanh lý bắt buộc.',
          'Đòn bẩy = giá trị danh nghĩa ÷ ký quỹ. Đòn bẩy 15x: giá đi ngược ~6,7% là mất toàn bộ ký quỹ.',
          'MXV (theo thành viên): ký quỹ ban đầu cho cá nhân = ký quỹ cơ sở của sàn × 120% × tỷ giá USD/VND; khoảng 80% thì bị thanh lý bắt buộc (tùy thời kỳ).',
          'Mức ký quỹ thay đổi thường xuyên; ứng dụng không lưu ký quỹ trong đặc tả, nên bài tập yêu cầu bạn tự nhập.',
        ],
        sources: [FINHAY_RULES, MXV_MARGIN],
        links: [{ module: 'risk', label: 'Risk' }],
        exercise: 'margin-leverage',
      },
      {
        id: 'l1-markets',
        title: 'MXV khác HNX thế nào',
        points: [
          'MXV (Sở Giao dịch Hàng hóa VN) do Bộ Công Thương quản lý; hợp đồng liên thông các sàn quốc tế (CBOT, ICE, COMEX, NYMEX, LME, SGX…); giao dịch chủ yếu chiều tối – rạng sáng giờ VN.',
          'HNX niêm yết chứng khoán phái sinh (HĐTL VN30, VN100, trái phiếu Chính phủ), do UBCKNN/Bộ Tài chính quản lý, giao dịch 08:45–14:45.',
          'Khung pháp lý hàng hóa mới: NĐ 302/2026/NĐ-CP, hiệu lực 15/09/2026, thay NĐ 158/2006 và 51/2018.',
        ],
        sources: [
          MXV_OVERVIEW,
          { label: 'NĐ 302/2026 (LuatVietnam)', url: 'https://luatvietnam.vn/tin-van-ban-moi/tu-15-9-2026-lan-dau-tien-so-giao-dich-hang-hoa-phai-co-von-dieu-le-toi-thieu-1500-ty-dong-186-111173-article.html' },
          { label: 'NĐ 158/2020 (CK phái sinh)', url: 'https://caselaw.vn/van-ban-phap-luat/368992-nghi-dinh-so-158-2020-nd-cp-ngay-31-12-2020-cua-chinh-phu-ve-chung-khoan-phai-sinh-va-thi-truong-chung-khoan-phai-sinh' },
          { label: 'Giờ giao dịch phái sinh HNX (DSC)', url: 'https://dsc.com.vn/kien-thuc/gio-giao-dich-phai-sinh' },
        ],
      },
      {
        id: 'l1-account',
        title: 'Mở tài khoản qua thành viên MXV',
        points: [
          'Chọn một thành viên kinh doanh của MXV (33 thành viên tại 01/09/2026) và kiểm tra tên trên website MXV. Không giao dịch qua "sàn" không phải thành viên.',
          'Ký hợp đồng mở tài khoản, đọc kỹ biểu phí (phí cố định theo lot) và phí dữ liệu; nộp ký quỹ bằng VND.',
          'Khách cá nhân không được nhận hàng vật chất: phải đóng/roll trước FND; 3–5 ngày trước FND hợp đồng chuyển "Only Close".',
          'Cơ chế bảo vệ tài sản khách hàng khi thành viên mất khả năng thanh toán còn đang được xây dựng trong dự thảo Luật.',
        ],
        sources: [
          { label: 'MXV 33 thành viên (Tạp chí Công Thương, 01/09/2026)', url: 'https://tapchicongthuong.vn/so-giao-dich-hang-hoa-viet-nam--vung-vang-niem-tin--khong-ngung-phat-trien-546232.htm' },
          FINHAY_RULES,
          { label: 'Dự thảo Luật Giao dịch HHPS', url: 'https://daibieunhandan.vn/kien-tao-thi-truong-giao-dich-hang-hoa-phai-sinh-an-toan-hien-dai-10431895.html' },
        ],
      },
    ],
  },
  {
    id: 'l2',
    title: 'Cấp 2 — Cơ chế',
    goal: 'Hiểu vòng đời hợp đồng, roll, cấu trúc kỳ hạn và thanh khoản.',
    lessons: [
      {
        id: 'l2-expiry',
        title: 'Đáo hạn, LTD, FND, giao vật chất vs tiền mặt',
        points: [
          'LTD (Last Trading Day): ngày cuối hợp đồng còn được giao dịch. FND (First Notice Day): ngày đầu bên bán có thể thông báo giao hàng.',
          'Physical settlement: đáo hạn thì giao hàng thật (ZS, ZC, KC…). Cash settlement: thanh toán chênh lệch theo giá tham chiếu.',
          'Ứng dụng tính lịch theo quy tắc niêm yết; ngày cụ thể phải đối chiếu lịch của sàn.',
        ],
        links: [{ module: 'explorer', label: 'Contract Explorer (contract chain)' }],
      },
      {
        id: 'l2-roll',
        title: 'Roll và chuỗi liên tục',
        points: [
          'Roll = đóng hợp đồng tháng gần, mở tháng xa để giữ vị thế; chi phí roll phụ thuộc chênh lệch hai tháng.',
          'Chuỗi liên tục (ví dụ ZC=F) ghép nhiều hợp đồng; tại điểm roll có bước nhảy giá không phải lãi/lỗ thật → backtest phải điều chỉnh hoặc dùng dữ liệu theo từng kỳ hạn.',
        ],
        links: [{ module: 'backtest', label: 'Backtest' }],
      },
      {
        id: 'l2-curve',
        title: 'Cấu trúc kỳ hạn: contango và backwardation',
        points: [
          'Contango: giá tháng xa cao hơn tháng gần (chi phí lưu kho, lãi vốn). Long và roll liên tục thường chịu roll yield âm.',
          'Backwardation: giá tháng xa thấp hơn tháng gần — thường khi hàng hiện tại khan hiếm.',
          'Basis = giá giao ngay địa phương − giá futures; doanh nghiệp phòng hộ vẫn chịu rủi ro basis và tỷ giá.',
        ],
        links: [{ module: 'term-structure', label: 'Term Structure' }],
        exercise: 'curve-quiz',
      },
      {
        id: 'l2-liquidity',
        title: 'Thanh khoản',
        points: [
          'Ưu tiên tháng gần, khối lượng và OI lớn. Thanh khoản thấp → chênh lệch mua/bán rộng, trượt giá cao.',
          'Ví dụ HNX 10/2026: VN100F chỉ ~179 HĐ/phiên; HĐTL trái phiếu không có giao dịch.',
        ],
        sources: [{ label: 'Thanh khoản phái sinh 10/2026 (24hmoney)', url: 'https://24hmoney.vn/news/thanh-khoan-phai-sinh-sut-giam-trong-thang-10-c1a2857234.html' }],
      },
    ],
  },
  {
    id: 'l3',
    title: 'Cấp 3 — Phân tích',
    goal: 'Biết đọc dữ liệu cơ bản, COT, chỉ báo kỹ thuật và thống kê — và giới hạn của chúng.',
    lessons: [
      {
        id: 'l3-fundamental',
        title: 'Phân tích cơ bản',
        points: [
          'USDA WASDE (hằng tháng): cung–cầu ngô, đậu tương, lúa mì, bông, đường. EIA (hằng tuần): tồn kho dầu, khí.',
          'Thời tiết (NOAA), sức mạnh USD (hàng hóa yết giá USD), và USD/VND (ký quỹ và lãi/lỗ ở MXV quy ra VND).',
        ],
        sources: [
          { label: 'USDA WASDE', url: 'https://www.usda.gov/node/42884' },
          { label: 'NOAA NCEI CDO', url: 'https://www.ncei.noaa.gov/cdo-web/webservices/v2' },
          { label: 'Tỷ giá trung tâm NHNN 05/11/2026 (VnExpress)', url: 'https://e.vnexpress.net/news/business/markets/vietnam-central-bank-s-exchange-rate-reaches-another-peak-5121481.html' },
        ],
        links: [{ module: 'fundamental', label: 'Macro Data' }],
      },
      {
        id: 'l3-cot',
        title: 'COT (Commitments of Traders)',
        points: [
          'CFTC công bố thứ Sáu 15:30 ET (rạng sáng thứ Bảy giờ VN), số liệu chốt thứ Ba.',
          'COT Index = vị trí của vị thế ròng hiện tại trong khoảng min–max của N tuần. Vị thế cực đoan là bối cảnh, không phải tín hiệu vào lệnh.',
        ],
        sources: [{ label: 'CFTC – About the COT Reports', url: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/AbouttheCOTReports/index.htm' }],
        links: [{ module: 'cot', label: 'COT' }],
      },
      {
        id: 'l3-technical',
        title: 'Chỉ báo kỹ thuật được tính thế nào',
        points: [
          'SMA(n) = trung bình n giá đóng cửa. EMA: EMAₜ = α·Giáₜ + (1−α)·EMAₜ₋₁ với α = 2/(n+1).',
          'RSI(14) = 100 − 100/(1+RS), RS = trung bình tăng ÷ trung bình giảm (làm trơn Wilder).',
          'MACD = EMA12 − EMA26; đường tín hiệu = EMA9 của MACD. Bollinger = SMA20 ± 2 độ lệch chuẩn.',
          'ATR(14) = trung bình True Range = max(H−L, |H−C trước|, |L−C trước|) — dùng đặt stop theo biến động.',
          'Chỉ báo mô tả giá quá khứ, không dự đoán; phải kiểm định bằng backtest có chi phí.',
        ],
        links: [
          { module: 'technical', label: 'Technical' },
          { module: 'charts', label: 'Charts' },
        ],
      },
      {
        id: 'l3-stats',
        title: 'Thống kê: biến động, tương quan, mùa vụ',
        points: [
          'Biến động năm hóa = độ lệch chuẩn lợi suất log × √252.',
          'Tương quan tính trên lợi suất, không phải trên giá. Hai vị thế tương quan cao ≈ một rủi ro gấp đôi.',
          'Mùa vụ: lợi suất trung bình theo tháng qua nhiều năm — cần đủ số năm và có thể không lặp lại.',
        ],
        links: [{ module: 'analysis', label: 'Analysis' }],
      },
    ],
  },
  {
    id: 'l4',
    title: 'Cấp 4 — Quản trị rủi ro',
    goal: 'Quyết định khối lượng trước khi quyết định vào lệnh.',
    lessons: [
      {
        id: 'l4-sizing',
        title: 'Khối lượng vị thế theo khoảng cách stop',
        points: [
          'Rủi ro/hợp đồng = (|giá vào − stop| ÷ tick) × tick value + phí, trượt giá.',
          'Số hợp đồng = floor(vốn × %rủi ro ÷ rủi ro/hợp đồng). Kết quả 0 → không vào lệnh (hoặc dùng hợp đồng Micro).',
        ],
        example: 'Vốn 10.000 USD, rủi ro 1% = 100 USD; ZC stop 8 cent = 32 tick × 12,5 = 400 USD/HĐ → 0 hợp đồng ZC chuẩn.',
        links: [{ module: 'risk', label: 'Risk' }],
        exercise: 'position-sizing',
      },
      {
        id: 'l4-limits',
        title: 'Giới hạn lỗ ngày và rủi ro tương quan',
        points: [
          'Đặt trước giới hạn lỗ ngày (ví dụ 2–3% vốn); chạm là dừng giao dịch hết ngày.',
          'Long đậu tương + khô đậu + dầu đậu ≈ một vị thế lớn trên "phức hợp đậu tương": cộng rủi ro theo nhóm.',
        ],
        links: [
          { module: 'portfolio', label: 'Portfolio' },
          { module: 'analysis', label: 'Analysis → Correlation' },
        ],
      },
      {
        id: 'l4-journal',
        title: 'Nhật ký và R-multiple',
        points: [
          '1R = số tiền rủi ro dự kiến của lệnh; kết quả ghi bằng R (lãi 2R, lỗ −1R).',
          'Kỳ vọng = tỷ lệ thắng × R thắng TB − tỷ lệ thua × R thua TB. Cần ≥ 30–50 lệnh mới có ý nghĩa sơ bộ.',
        ],
        links: [{ module: 'journal', label: 'Journal' }],
      },
    ],
  },
  {
    id: 'l5',
    title: 'Cấp 5 — Nâng cao',
    goal: 'Spread, kiểm định chiến lược đúng cách, quyền chọn và giao dịch hệ thống.',
    lessons: [
      {
        id: 'l5-spreads',
        title: 'Spread: calendar, inter-commodity, inter-exchange',
        points: [
          'Calendar: long tháng này, short tháng khác cùng hàng hóa (ví dụ ngô old crop/new crop).',
          'Inter-commodity: giữa hàng hóa liên quan — crush đậu tương (ZS vs ZM + ZL), Brent–WTI.',
          'Inter-exchange: Arabica ICE US vs Robusta ICE EU — khác chất lượng và đơn vị (cent/lb vs USD/tấn), phải quy đổi.',
          'Spread thường ít biến động hơn vị thế đơn nhưng không phải không rủi ro.',
        ],
        links: [
          { module: 'term-structure', label: 'Term Structure (spread history)' },
          { module: 'analysis', label: 'Analysis → Spreads' },
        ],
      },
      {
        id: 'l5-backtest',
        title: 'Bẫy khi backtest',
        points: [
          'Look-ahead bias: dùng thông tin chưa có tại thời điểm quyết định (vào lệnh bằng giá đóng cửa của chính nến tín hiệu; coi ngày chốt COT thứ Ba là ngày công bố).',
          'Bỏ qua chi phí: phí, trượt giá, chi phí roll.',
          'Overfitting: tối ưu quá nhiều tham số; hãy giữ dữ liệu out-of-sample, ít tham số, thử trên nhiều thị trường.',
          'Chuỗi continuous chưa điều chỉnh roll tạo lãi/lỗ giả.',
        ],
        links: [{ module: 'backtest', label: 'Backtest' }],
      },
      {
        id: 'l5-options',
        title: 'Quyền chọn: Greeks và IV',
        points: [
          'Delta: thay đổi giá quyền chọn khi futures +1. Gamma: tốc độ đổi delta. Theta: mất giá theo thời gian. Vega: nhạy với biến động hàm ý.',
          'IV: biến động mà giá quyền chọn hàm ý — so với biến động lịch sử để biết quyền chọn "đắt/rẻ" tương đối.',
          'Quyền chọn chỉ số tại HNX dự kiến kiểm thử nội bộ năm 2027.',
        ],
        sources: [{ label: 'Lộ trình CCP & quyền chọn (Thời báo Tài chính)', url: 'https://thoibaotaichinhvietnam.vn/tang-toc-trien-khai-ccp-dam-bao-van-hanh-dung-lo-trinh-vao-dau-nam-2027-206550.html' }],
      },
      {
        id: 'l5-systematic',
        title: 'Giao dịch hệ thống',
        points: [
          'Quy tắc vào/ra/khối lượng được viết rõ, kiểm định, rồi tuân thủ — loại bỏ cảm xúc, đo lường được.',
          'Nhược điểm: drawdown kéo dài, chiến lược có thể hết hiệu quả.',
        ],
        links: [
          { module: 'signals', label: 'Strategies' },
          { module: 'scanner', label: 'Scanner' },
          { module: 'backtest', label: 'Backtest' },
        ],
      },
    ],
  },
];

export interface MoneyWay {
  name: string;
  description: string;
  fit: string;
  risk: string;
}

export const MONEY_WAYS: MoneyWay[] = [
  { name: 'Đầu cơ theo xu hướng', description: 'Theo xu hướng trung/dài hạn, cắt lỗ sớm, để lãi chạy.', fit: 'Cá nhân có kỷ luật, vốn đủ chịu chuỗi thua.', risk: 'Thị trường đi ngang, chuỗi thua dài, đòn bẩy.' },
  { name: 'Đầu cơ spread', description: 'Calendar / inter-commodity spread.', fit: 'Người đã vững cấp 2–3.', risk: 'Spread có thể nới rộng mạnh; thanh khoản chân xa.' },
  { name: 'Đầu cơ mùa vụ', description: 'Dựa trên chu kỳ trồng/thu hoạch.', fit: 'Người có dữ liệu nhiều năm.', risk: 'Mùa vụ không lặp lại; thời tiết bất thường.' },
  { name: 'Phòng hộ cho doanh nghiệp', description: 'Nhà nhập khẩu đậu tương, chế biến cà phê khóa giá.', fit: 'Doanh nghiệp có hàng thật.', risk: 'Rủi ro basis và tỷ giá; cần dòng tiền ký quỹ.' },
  { name: 'Arbitrage', description: 'Khai thác chênh lệch giữa sàn/kỳ hạn.', fit: 'Tổ chức (chi phí thấp, hạ tầng nhanh).', risk: 'Cá nhân gần như không có lợi thế.' },
  { name: 'Bán quyền chọn', description: 'Thu phí premium đều đặn.', fit: 'Người hiểu sâu Greeks, vốn lớn.', risk: 'Rủi ro đuôi: lãi nhỏ nhiều lần, một biến cố có thể mất rất lớn.' },
  { name: 'Nghề nghiệp', description: 'Môi giới tại thành viên MXV, phân tích, quản trị rủi ro, trading desk doanh nghiệp.', fit: 'Người học bài bản.', risk: 'Thu nhập ổn định hơn tự giao dịch.' },
  { name: 'Sản phẩm / giáo dục', description: 'Công cụ phân tích, dữ liệu, khóa học.', fit: 'Người có kỹ năng xây dựng/giảng dạy.', risk: 'Phải tôn trọng bản quyền dữ liệu (MXV, Yahoo).' },
];

export const RISK_WARNINGS: { text: string; sources?: Source[] }[] = [
  {
    text: 'Phần lớn nhà giao dịch cá nhân dùng đòn bẩy bị lỗ. Ví dụ: ESMA nêu 74–89% tài khoản CFD cá nhân thua lỗ khi hạn chế CFD năm 2018 (CFD không phải futures MXV; URL chưa kiểm tra lại). Không có thống kê lãi/lỗ công khai cho khách MXV.',
    sources: [{ label: 'ESMA (2018)', url: 'https://www.esma.europa.eu/press-news/esma-news/esma-agrees-prohibit-binary-options-and-restrict-cfds-protect-retail-investors' }],
  },
  {
    text: '~99,5% tài khoản MXV là cá nhân (2025); khối lượng tập trung vào bạc/đồng/bạch kim Micro–Nano — dấu hiệu đầu cơ cao.',
    sources: [
      { label: 'Tạp chí Công Thương (11/02/2026)', url: 'https://tapchicongthuong.vn/nam-2025--thanh-khoan-lap-dinh--thi-truong-giao-dich-hang-hoa-buoc-vao-giai-doan-truong-thanh-436170.htm' },
      { label: 'Đại biểu Nhân dân (16/05/2026)', url: 'https://daibieunhandan.vn/khoi-luong-giao-dich-hang-hoa-tang-hon-140-trong-quy-i-2026-10417083.html' },
    ],
  },
  { text: 'Biến động lớn rơi vào 20:30–02:00 giờ VN (Mỹ mở cửa, báo cáo USDA/EIA).' },
  { text: 'Giao dịch giấy (paper trade) 3–6 tháng với quy tắc rủi ro cấp 4 trước khi dùng tiền thật; ghi nhật ký từng lệnh.' },
  { text: 'Chỉ giao dịch qua thành viên được MXV cấp phép (hoặc công ty chứng khoán cho HNX). Cảnh giác "sàn" hứa lợi nhuận cố định hoặc nhận tiền vào tài khoản cá nhân.', sources: [MXV_OVERVIEW] },
  { text: 'Ứng dụng này là công cụ nghiên cứu/giáo dục, không phải khuyến nghị đầu tư; không đặt lệnh với broker và không tái phân phối giá MXV.' },
];
