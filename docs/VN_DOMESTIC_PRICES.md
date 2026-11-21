# Giá nông sản trong nước (T87)

## Kết quả khảo sát nguồn (2026-11-21)

Chỉ tìm thấy các bảng giá trên báo/trang tin (ví dụ baomoi.com, stockbiz.vn, baolamdong.vn, vietbao.vn) cho cà phê Tây Nguyên và hồ tiêu. Không có API/feed có cấu trúc, không có thỏa thuận cho phép lấy dữ liệu tự động, và định dạng thay đổi theo bài. Giá cao su, ngô và khô đậu tương nhập khẩu tại cảng không tìm được nguồn công khai ổn định. Không tìm thấy bảng giá chính thức có cấu trúc từ VICOFA, Bộ Công Thương hay Sở Nông nghiệp.

Quyết định: KHÔNG cào dữ liệu tự động (tránh vi phạm điều khoản và dữ liệu sai). Dùng đường nhập tay/CSV, mỗi dòng bắt buộc có nguồn, URL và ngày.

## Nhập dữ liệu

- Giao diện: Thị trường > "Giá trong nước" > "Nhập giá trong nước" (biểu mẫu hoặc dán CSV).
- API: `POST /api/domestic-prices` với `{ "entries": [...] }` hoặc `{ "csv": "..." }`. Có dòng lỗi thì không lưu gì.
- CSV: `commodity,region,price,unit,date,source,sourceUrl,quality`
  - commodity: `coffee | pepper | rubber | corn | soymeal`; unit: `VND/kg | USD/t`; date: `YYYY-MM-DD`; quality: `OFFICIAL | UNOFFICIAL | MANUAL` (mặc định MANUAL).
- Khóa duy nhất: (commodity, region, date, source); nhập lại sẽ cập nhật.

## Đọc dữ liệu

`GET /api/domestic-prices` trả giá mới nhất mỗi mặt hàng, lịch sử 90 ngày (cùng khu vực với điểm mới nhất), giá quốc tế quy đổi và basis.

## Quy đổi và basis

Mô-đun thuần: `src/shared/domestic/basis.ts` (có test).

- Cà phê robusta `ICE:RC` (USD/t): VND/kg = USD/t / 1000 × USDVND.
- Ngô `CBOT:ZC` (US cent/bushel): / 100 / 25,4012 kg × USDVND.
- Khô đậu tương `CBOT:ZM` (USD/short ton): / 907,18474 × USDVND.
- Hồ tiêu và cao su không có hợp đồng quốc tế tham chiếu trong app: chỉ hiển thị giá trong nước, không có basis.
- Tỷ giá: `USDVND_VCB` từ `/api/macro/fx` (nguồn UNOFFICIAL), một tỷ giá cho cả chuỗi lịch sử vì chưa có lịch sử tỷ giá.
- Giá quốc tế: nến D1 CONTINUOUS đã nhập (CSV hoặc Yahoo opt-in), lấy phiên gần nhất không muộn hơn ngày giá trong nước.
- basis = nội địa − quốc tế quy đổi (đ/kg); % = basis / quốc tế quy đổi.

## Tự động hóa

Chưa có job scheduler cho giá trong nước (không có nguồn hợp pháp ổn định). Nếu sau này có nguồn, thêm fetcher với cờ env mặc định tắt, kèm fixture và test parse, rồi gọi `SqliteDomesticRepository.upsert`.
