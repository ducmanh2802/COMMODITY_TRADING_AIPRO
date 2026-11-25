// Data-honesty labels for views that showed market-derived numbers without a status/source/as-of. Keys prefixed 'b2.'.
export const vi = {
  'b2.bt.sim': 'Mô phỏng trên dữ liệu lịch sử',
  'b2.bt.range': 'Dữ liệu {from} → {to} · khung {tf} · {n} lệnh',
  'b2.bt.rangeNone': 'Khung {tf} · {n} lệnh',
  'b2.bt.note': 'Không phải giá trực tiếp và không phải dự báo; kết quả quá khứ không đảm bảo tương lai.',
  'b2.cot.line': 'CFTC · số liệu chốt {date} · công bố {rel}',
  'b2.cot.lineNone': 'CFTC · chưa có báo cáo',
  'b2.drv.line': 'Giá đóng cửa ngày · đến {date}{src}',
  'b2.drv.none': 'Chưa có mốc thời gian dữ liệu',
  'b2.rep.line': 'Báo cáo tạo lúc {date}. Điểm và phân vị tính từ giá lịch sử; mỗi mã có nhãn trạng thái riêng.',
  'b2.sc.quote': 'Giá tham chiếu · {src}',
} as const;
export const en = {
  'b2.bt.sim': 'Simulation on historical data',
  'b2.bt.range': 'Data {from} → {to} · {tf} timeframe · {n} trades',
  'b2.bt.rangeNone': '{tf} timeframe · {n} trades',
  'b2.bt.note': 'Not a live price and not a forecast; past results do not guarantee future results.',
  'b2.cot.line': 'CFTC · positions as of {date} · released {rel}',
  'b2.cot.lineNone': 'CFTC · no report yet',
  'b2.drv.line': 'Daily close · up to {date}{src}',
  'b2.drv.none': 'No data as-of date available',
  'b2.rep.line': 'Report generated {date}. Scores and percentiles come from historical prices; each symbol carries its own status badge.',
  'b2.sc.quote': 'Reference price · {src}',
} as const;
