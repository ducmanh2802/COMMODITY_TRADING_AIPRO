// Trend-following backtest rules (TSMOM, Donchian) + plain-language explainer. Education only.
export const vi = {
  'trf2.label.TSMOM_12M': 'Động lượng chuỗi thời gian 12 tháng (TSMOM)',
  'trf2.label.DONCHIAN_BREAKOUT': 'Bứt phá kênh Donchian (kiểu Turtle)',
  'trf2.label.TREND_FOLLOWING': 'Theo xu hướng EMA 20/50 + ADX',
  'trf2.summary': 'Xem giải thích',
  'trf2.intro': 'Ba cách theo xu hướng có thể so sánh cùng nhau trong Phòng thí nghiệm (walk-forward) bên dưới. Chỉ để học và nghiên cứu, không phải khuyến nghị mua/bán.',
  'trf2.ema.title': 'EMA 20/50 + ADX',
  'trf2.ema.body': 'Vào lệnh khi giá nằm cùng phía với EMA20, EMA20 nằm trên (hoặc dưới) EMA50 và ADX đủ cao để xu hướng được coi là rõ. Đơn giản nhưng hay bị nhiễu khi thị trường đi ngang.',
  'trf2.tsmom.title': 'TSMOM 12 tháng',
  'trf2.tsmom.body': 'Nhìn lợi suất của chính hàng hóa đó trong khoảng 252 phiên ngày (~12 tháng). Lợi suất dương thì thiên về mua, âm thì thiên về bán khống. Bản gốc tái cân bằng hằng tháng; ở đây xấp xỉ bằng nến ngày, vào ở nến sau tín hiệu và thoát bằng cắt lỗ ATR hoặc mục tiêu R. Nguồn: Moskowitz, Ooi, Pedersen (2012), "Time Series Momentum", Journal of Financial Economics.',
  'trf2.donchian.title': 'Donchian N vào / M thoát',
  'trf2.donchian.body': 'Mua khi giá đóng cửa vượt đỉnh cao nhất N phiên trước (mặc định 20), bán khống khi thủng đáy thấp nhất N phiên trước. Mức cắt lỗ đặt ở kênh thoát M phiên (mặc định 10). Ý tưởng của Richard Donchian, được nhóm Turtle Traders phổ biến; N và M chỉnh được ở phần tham số.',
  'trf2.caveat.title': 'Cảnh báo quá khớp',
  'trf2.caveat.body': 'Thử nhiều giá trị N hoặc lookback rồi chọn cái đẹp nhất trên quá khứ gần như chắc chắn cho kết quả đẹp giả. Hãy xem kết quả ngoài mẫu (walk-forward), chi phí và trượt giá, và coi mọi con số backtest chỉ là mô phỏng minh họa.',
};

export const en: Record<keyof typeof vi, string> = {
  'trf2.label.TSMOM_12M': 'Time-series momentum, 12 months (TSMOM)',
  'trf2.label.DONCHIAN_BREAKOUT': 'Donchian channel breakout (Turtle style)',
  'trf2.label.TREND_FOLLOWING': 'Trend following EMA 20/50 + ADX',
  'trf2.summary': 'Show explanation',
  'trf2.intro': 'Three trend-following rules you can compare side by side in the walk-forward Lab below. For learning and research only, not buy/sell advice.',
  'trf2.ema.title': 'EMA 20/50 + ADX',
  'trf2.ema.body': 'Enter when price is on the same side of EMA20, EMA20 is above (or below) EMA50 and ADX is high enough to call the trend clear. Simple, but noisy when the market moves sideways.',
  'trf2.tsmom.title': 'TSMOM 12 months',
  'trf2.tsmom.body': "Look at the commodity's own return over about 252 daily bars (~12 months). Positive return leans long, negative leans short. The original rebalances monthly; here it is approximated on daily bars, entered on the bar after the signal and exited by an ATR stop or R target. Source: Moskowitz, Ooi, Pedersen (2012), \"Time Series Momentum\", Journal of Financial Economics.",
  'trf2.donchian.title': 'Donchian N entry / M exit',
  'trf2.donchian.body': 'Go long when the close breaks above the highest high of the previous N bars (default 20), short when it breaks below the lowest low. The stop sits at the M-bar exit channel (default 10). Idea by Richard Donchian, popularised by the Turtle Traders; N and M are editable in the parameters.',
  'trf2.caveat.title': 'Overfitting warning',
  'trf2.caveat.body': 'Trying many N or lookback values and keeping the prettiest one on past data almost guarantees a flattering but false result. Look at out-of-sample (walk-forward) results, costs and slippage, and treat every backtest number as an illustrative simulation.',
};
