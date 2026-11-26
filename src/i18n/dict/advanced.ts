export const vi = {
  'adv.insight.title': 'Thông tin phân tích từ số liệu',
  'adv.insight.cautionLabel': 'Lưu ý cần xem:',
  'adv.guide.badge': 'Công cụ này dùng làm gì?',

  'adv.guide.term-structure.title': 'Cấu trúc kỳ hạn — Đọc đường cong giá các tháng giao hàng',
  'adv.guide.term-structure.purpose':
    'So sánh giá giữa hợp đồng đáo hạn gần và các tháng xa hơn để biết thị trường đang thừa hay thiếu hàng ngắn hạn (Contango hay Backwardation) và ước lượng chi phí/lợi suất khi giữ vị thế qua kỳ chuyển tháng (roll).',
  'adv.guide.term-structure.when':
    'Dùng trước khi giữ lệnh nhiều tuần/tháng hoặc khi hợp đồng sắp đến hạn giao dịch cuối (LTD).',

  'adv.guide.explorer.title': 'Thông số hợp đồng — Tra cứu kích thước, bước giá & hạn giao dịch',
  'adv.guide.explorer.purpose':
    'Xem một hợp đồng đại diện cho bao nhiêu tấn/giạ hàng hoá, mỗi 1 bước giá (tick) tương đương bao nhiêu USD, mã liên thông MXV và lịch ngày đáo hạn chuẩn.',
  'adv.guide.explorer.when':
    'Luôn kiểm tra trước khi tính khối lượng vào lệnh để không đánh quá cỡ vốn thực tế.',

  'adv.guide.analysis.title': 'Phân tích dữ liệu lịch sử — Đo biến động, tương quan, mùa vụ & sụt giảm',
  'adv.guide.analysis.purpose':
    'Biến chuỗi giá nến đã nạp thành các thước đo rủi ro cụ thể: biên độ dao động/ngày, hai mã có đi cùng chiều để tránh gộp rủi ro không, tháng nào hay tăng/giảm theo mùa, và mức sụt giảm sâu nhất lịch sử.',
  'adv.guide.analysis.when':
    'Dùng khi xây dựng danh mục nhiều mã hoặc cân chỉnh khoảng dừng lỗ phù hợp độ giật của hàng hoá.',

  'adv.guide.scanner.title': 'Bộ quét toàn thị trường — Sàng lọc nhanh các mã đạt tiêu chí kỹ thuật',
  'adv.guide.scanner.purpose':
    'Chạy các bộ quy tắc định lượng trên toàn bộ danh sách hàng hoá để lọc ra những mã đang có điểm cấu trúc và tỷ lệ Lợi nhuận/Rủi ro (R:R) vượt ngưỡng bạn chọn.',
  'adv.guide.scanner.when':
    'Dùng đầu phiên để thu hẹp danh sách hàng chục mã xuống còn vài mã đáng mở biểu đồ xem kỹ.',

  'adv.guide.signals.title': 'Tín hiệu theo quy tắc — Đối chiếu các mô hình trên từng mã cụ thể',
  'adv.guide.signals.purpose':
    'Đánh giá cùng lúc nhiều chiến lược cố định (xu hướng, bứt phá, hồi quy…) trên mã bạn đang chọn, chỉ ra điểm vào tham chiếu, mức cắt lỗ, vùng chốt lời và điều kiện làm mất hiệu lực mô hình.',
  'adv.guide.signals.when':
    'Dùng để kiểm chứng xem nhiều phương pháp có đang đồng thuận một hướng hay đang trái chiều nhau.',

  'adv.guide.technical.title': 'Phân tích kỹ thuật — Giải mã chỉ báo xu hướng, động lượng & vùng giá',
  'adv.guide.technical.purpose':
    'Tính toán đầy đủ các đường trung bình (EMA/SMA), RSI, MACD, ADX, ATR%, Pivot và Hỗ trợ/Kháng cự rồi tổng hợp thành nhận định dễ đọc về xu hướng, sức mạnh và độ biến động hiện tại.',
  'adv.guide.technical.when':
    'Dùng khi cần đọc cấu trúc giá khách quan và xác định các mốc giá quan trọng (hỗ trợ/kháng cự/mất xu hướng).',

  'adv.guide.backtest.title': 'Kiểm thử chiến lược — Thử nghiệm quy tắc trên dữ liệu quá khứ',
  'adv.guide.backtest.purpose':
    'Mô phỏng xem nếu áp dụng một chiến lược cố định trong quá khứ (đã tính phí và trượt giá) thì lãi/lỗ ròng, tỷ lệ thắng, kỳ vọng và mức sụt giảm vốn tối đa (Max Drawdown) ra sao.',
  'adv.guide.backtest.when':
    'Dùng để loại bỏ các ý tưởng thua lỗ trên lịch sử trước khi tập trên tài khoản giả lập hoặc tiền thật.',
} as const;

export const en: Record<keyof typeof vi, string> = {
  'adv.insight.title': 'Actionable Takeaways from the Data',
  'adv.insight.cautionLabel': 'Things to watch:',
  'adv.guide.badge': 'What is this tool for?',

  'adv.guide.term-structure.title': 'Term Structure — Read the forward price curve across delivery months',
  'adv.guide.term-structure.purpose':
    'Compares front-month and deferred contracts to show whether near-term supply is tight (Backwardation) or ample (Contango), and estimates the annualized roll cost or yield of holding across expiries.',
  'adv.guide.term-structure.when':
    'Check before holding multi-week positions or when an active contract approaches its Last Trading Day.',

  'adv.guide.explorer.title': 'Contract Explorer — Check contract size, tick value & expiry rules',
  'adv.guide.explorer.purpose':
    'Shows how much physical commodity 1 contract represents, how much money 1 minimum price tick changes PnL, the linked MXV symbol, and expiry dates.',
  'adv.guide.explorer.when':
    'Always check before sizing an order so leverage stays within your risk budget.',

  'adv.guide.analysis.title': 'Data Analysis — Measure volatility, correlation, seasonality & drawdowns',
  'adv.guide.analysis.purpose':
    'Turns imported historical candles into plain risk metrics: typical daily swing, which commodities move together (concentrated risk), historical seasonal months, and worst peak-to-trough drops.',
  'adv.guide.analysis.when':
    'Use when diversifying across commodities or setting stop distances to match real volatility.',

  'adv.guide.scanner.title': 'Market Scanner — Screen all commodities against rule-based setups',
  'adv.guide.scanner.purpose':
    'Runs deterministic strategy rules across all commodities with sufficient history and ranks setups meeting your minimum quality score and Reward-to-Risk (R:R) threshold.',
  'adv.guide.scanner.when':
    'Use at the start of a session to narrow dozens of contracts down to a few candidates for deeper review.',

  'adv.guide.signals.title': 'Rule-Based Signals — Compare strategies on one commodity',
  'adv.guide.signals.purpose':
    'Evaluates multiple deterministic strategies side-by-side for the selected commodity, showing reference entry zones, stop-loss, targets, and invalidation levels.',
  'adv.guide.signals.when':
    'Use to see whether multiple technical frameworks agree or conflict on the current setup.',

  'adv.guide.technical.title': 'Technical Analysis — Decode trend, momentum & key price levels',
  'adv.guide.technical.purpose':
    'Computes moving averages (EMA/SMA), RSI, MACD, ADX, ATR%, Pivots, and Support/Resistance, then summarizes what they mean together in plain language.',
  'adv.guide.technical.when':
    'Use to quickly read market regime, momentum health, and structural invalidation levels.',

  'adv.guide.backtest.title': 'Strategy Backtest — Test rules on historical candles with costs',
  'adv.guide.backtest.purpose':
    'Simulates how a fixed rule set would have performed historically after commissions and slippage, highlighting net profit, expectancy, profit factor, and maximum drawdown.',
  'adv.guide.backtest.when':
    'Use to filter out weak strategies on past data before practicing in paper trading.',
};
