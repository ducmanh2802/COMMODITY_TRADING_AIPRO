# Học viện Hàng hoá — lộ trình học phái sinh hàng hoá

> Tài liệu giáo dục, **không phải tư vấn đầu tư**. Nội dung đầy đủ (bài học, ví dụ số, câu hỏi trắc nghiệm, nguồn) nằm trong code tại `src/components/views/learn/curriculum/level1.ts` đến `level7.ts`; thuật ngữ ở `glossary.ts` (~70 mục); phép tính ở `learnMath.ts` (có test). Trong ứng dụng: module **Học** (tiến độ, điểm quiz và checklist lưu trong `localStorage`).
>
> Quy tắc chính xác: không bịa số liệu, phí, quy định. Đặc tả hợp đồng (khối lượng, tick, giá trị tick) lấy từ Instrument Master (`server/data/instruments.ts`, `/api/instruments`), chỉ mã `VERIFIED` mới dùng để tính. Mục nào chưa chắc đều ghi **"cần kiểm tra lại với MXV/công ty môi giới"** (https://mxv.com.vn).

Mỗi bài có: mục tiêu, nội dung ngắn, ví dụ số (tính bằng `learnMath`) hoặc ví dụ chữ, hộp "Ghi nhớ", 3–5 câu trắc nghiệm có giải thích, nguồn (cmegroup.com, theice.com, mxv.com.vn, cftc.gov, usda.gov, eia.gov), liên kết sang module của ứng dụng.

## Cấp 1 — Nền tảng (7 bài)
1. Hàng hoá là gì · 2. Giao ngay, forward, futures · 3. Đặc tả hợp đồng: khối lượng, tick, tháng đáo hạn, mã tháng F G H J K M N Q U V X Z · 4. Ký quỹ ban đầu/duy trì và đòn bẩy · 5. Lãi lỗ tính thế nào · 6. Đáo hạn, roll, FND/LTD · 7. Nhà phòng hộ và nhà đầu cơ.

## Cấp 2 — Thị trường Việt Nam (6 bài)
1. MXV là gì · 2. Thành viên môi giới · 3. Giờ giao dịch liên thông · 4. Quy đổi USD/VND và phí · 5. Quy trình mở tài khoản · 6. Pháp lý (NĐ 158/2020 là về chứng khoán phái sinh; NĐ 302/2026 thay NĐ 158/2006 và 51/2018 theo một nguồn báo chí, **cần kiểm tra lại**).

## Cấp 3 — Từng nhóm hàng (8 bài)
Ngô và lúa mì · Đậu tương, khô đậu, dầu đậu · Cà phê arabica/robusta · Đường, ca cao, bông, cao su · Vàng, bạc, bạch kim · Đồng và quặng sắt · Dầu WTI/Brent · Khí tự nhiên. Mỗi bài: cung–cầu, mùa vụ, báo cáo (WASDE, EIA, COT), liên hệ Việt Nam, bảng đặc tả từ Instrument Master.

## Cấp 4 — Phân tích (6 bài)
Cơ bản · Kỹ thuật (MA, RSI, ATR, khối lượng) · Cấu trúc kỳ hạn contango/backwardation · COT · Mùa vụ · Tương quan. Mỗi bài liên kết sang Biểu đồ, Cấu trúc kỳ hạn, Báo cáo COT, Đánh giá các mã, Phân tích chi tiết.

## Cấp 5 — Quản trị rủi ro và tâm lý (5 bài)
Khối lượng vị thế theo % vốn · Cắt lỗ là công cụ quản trị rủi ro · Nhật ký và R-multiple · Sai lầm của người mới · Lừa đảo và "sàn ma" (chỉ giao dịch qua thành viên MXV).

## Cấp 6 — Quy trình phân tích một mã trong ứng dụng (4 bài)
1. Đọc thẻ giá và nhãn dữ liệu · 2. Đọc từng chỉ số của "Đánh giá các mã" và "Phân tích chi tiết" · 3. Quy trình 7 bước (checklist) · 4. Ví dụ hoàn chỉnh với ngô (số giả định).

## Cấp 7 — Lướt sóng cho người mới (3 bài)
1. Rủi ro đòn bẩy và khung 7 quy tắc (xu hướng, thuận xu hướng/pullback, stop 1,5–2×ATR, rủi ro 1–2% vốn, tránh báo cáo lớn, chốt lời theo R, nhật ký) · 2. Kiểm thử bằng Kiểm thử chiến lược · 3. Lộ trình giả lập trước.

### Kiểm thử khung bằng công cụ backtest
Chiến lược gần nhất: **EMA Pullback Continuation** (EMA 9/20/50, RSI 14, ATR 14, stop ~1,25×ATR14). Tham số do engine cố định, giao diện chưa có preset; chỉ chỉnh được mã, chiến lược, khung thời gian, vốn, số hợp đồng cố định/lệnh, phí/hợp đồng, trượt giá (tick) và chu kỳ roll. Không kiểm thử được trực tiếp quy tắc rủi ro % vốn. Dữ liệu Yahoo ~10 năm là chuỗi front-month liên tục, **không điều chỉnh roll**, nguồn không chính thức: có roll gap. Đọc kết quả: lợi nhuận ròng, max drawdown, tỷ lệ thắng, profit factor, số lệnh, phí/trượt giá. Cờ đỏ: quá ít lệnh, một lệnh quyết định kết quả, overfitting, kết quả chỉ tốt khi phí = 0.

## Công cụ tính (learnMath)
`tickPnl`, `marginLeverage`, `positionSize`, `contractValue`, `rollCost`, `marginCallDistance`, `convertCurrency`, `swingPlan`, `rMultiple`, `classifyCurve`.

## Các mục "cần kiểm tra lại với MXV/công ty môi giới"
Danh mục và quy cách hợp đồng hiện hành; danh sách thành viên; giờ giao dịch từng mã; phí, hệ số ký quỹ, tỷ giá áp dụng; thủ tục mở tài khoản; ngày FND/LTD và ngày "chỉ đóng vị thế"; hiệu lực NĐ 302/2026; bảo vệ tài sản khách hàng; hợp đồng cao su.
