# Lộ trình học phái sinh hàng hóa (cho người mới bắt đầu)

> Soạn ngày 2026-11-17. Tài liệu giáo dục, **không phải khuyến nghị đầu tư**. Dữ kiện về pháp lý/thị trường đều có URL nguồn (phần lớn lấy lại từ `docs/VN_DERIVATIVES_MARKET.md` và `docs/REALTIME_DATA_SOURCES.md`); mục ghi **"chưa xác minh"** là chưa đối chiếu được với văn bản chính thức. Đặc tả hợp đồng (khối lượng, bước giá, giá trị bước giá) lấy từ Instrument Master của ứng dụng (`server/data/instruments.ts`, API `/api/instruments`) — chỉ những mã có trạng thái `VERIFIED` mới được dùng trong bài tập.
>
> Trong ứng dụng: module **"Học"** (thanh điều hướng bên trái) hiển thị cùng nội dung này kèm bài tập tương tác và ô đánh dấu tiến độ (lưu trên trình duyệt).

---

## Cấp 1 — Nền tảng

### 1.1 Forward, futures, options
- **Forward (hợp đồng kỳ hạn):** thỏa thuận riêng giữa hai bên mua/bán hàng hóa tại một giá, giao vào ngày tương lai. Không qua sàn → điều khoản tùy ý, nhưng có **rủi ro đối tác** (bên kia không thực hiện).
- **Futures (hợp đồng tương lai):** forward đã được **chuẩn hóa** (khối lượng, chất lượng, tháng giao) và giao dịch trên sàn; trung tâm bù trừ đứng giữa hai bên, lãi/lỗ được **thanh toán hằng ngày** (mark-to-market).
- **Options (quyền chọn):** người mua trả **phí quyền chọn (premium)** để có *quyền* (không phải nghĩa vụ) mua (call) hoặc bán (put) hợp đồng tương lai tại giá thực hiện. Người bán quyền chọn nhận phí nhưng chịu nghĩa vụ — rủi ro có thể rất lớn.

### 1.2 Đặc tả hợp đồng (contract specs)
Mỗi hợp đồng có: mã, sàn, **khối lượng** (ví dụ Ngô CBOT ZC = 5.000 bushel), **đơn vị yết giá** (cent/bushel), **bước giá tối thiểu** (0,25 cent/bushel), **giá trị một bước giá** (12,5 USD), tháng niêm yết, giờ giao dịch, phương thức thanh toán (giao vật chất/tiền mặt). Nguồn đặc tả ZC: https://www.cmegroup.com/rulebook/CBOT/I/10.pdf (trong Instrument Master), đối chiếu trang MXV "Ngô CBOT" mã ZCE — https://mxv.com.vn/hang-hoa/nong-san/ngo.html
→ Xem trong ứng dụng: **Contract Explorer**.

### 1.3 Tick và tick value
- Tick = bước giá nhỏ nhất. Tick value = khối lượng × tick (quy ra USD).
- Ví dụ ZC: 5.000 bu × 0,25 cent = 1.250 cent = **12,5 USD/tick**.
- Lãi/lỗ = (biến động giá ÷ tick) × tick value × số hợp đồng. Ngô tăng **10 cent** = 40 tick × 12,5 = **500 USD/hợp đồng** (chưa trừ phí).

### 1.4 Long / short
- **Long (mua):** lãi khi giá tăng. **Short (bán):** lãi khi giá giảm. Với futures, bán trước không cần có hàng — nhưng lỗ của vị thế short về lý thuyết không giới hạn.

### 1.5 Ký quỹ và đòn bẩy
- Bạn không trả toàn bộ giá trị hợp đồng mà chỉ nộp **ký quỹ ban đầu**; khi tài khoản xuống dưới mức **ký quỹ duy trì** sẽ bị gọi ký quỹ (margin call), xuống sâu hơn sẽ bị **thanh lý bắt buộc**.
- Đòn bẩy = giá trị danh nghĩa hợp đồng ÷ ký quỹ. Đòn bẩy 15x nghĩa là giá đi ngược ~6,7% là mất toàn bộ ký quỹ.
- Ở MXV (theo thành viên Finhay): ký quỹ ban đầu cho khách cá nhân = ký quỹ cơ sở của sàn × **120%** × tỷ giá USD/VND; dưới ngưỡng duy trì → call; khoảng **80%** → thanh lý bắt buộc (tùy thời kỳ) — https://www.finhay.com.vn/quy-dinh-giao-dich-hang-hoa-phai-sinh
- Bảng ký quỹ MXV (QĐ 644 & 638/QĐ/TGĐ-MXV, 08/2025), ví dụ ZCE ~31,1 triệu đ/lot, Micro MZC ~3,1 triệu đ/lot — https://en.mxv.com.vn/trading/margin.html . Mức ký quỹ **thay đổi thường xuyên**; ứng dụng không lưu ký quỹ trong đặc tả — bài tập yêu cầu bạn tự nhập (ghi rõ "do người dùng nhập").

### 1.6 MXV khác HNX thế nào
| | Hàng hóa phái sinh (MXV) | Chứng khoán phái sinh (HNX) |
|---|---|---|
| Quản lý | Bộ Công Thương — https://en.mxv.com.vn/overview.html | UBCKNN/Bộ Tài chính (NĐ 158/2020) — https://caselaw.vn/van-ban-phap-luat/368992-nghi-dinh-so-158-2020-nd-cp-ngay-31-12-2020-cua-chinh-phu-ve-chung-khoan-phai-sinh-va-thi-truong-chung-khoan-phai-sinh |
| Khung mới | NĐ 302/2026/NĐ-CP, hiệu lực 15/09/2026 — https://luatvietnam.vn/tin-van-ban-moi/tu-15-9-2026-lan-dau-tien-so-giao-dich-hang-hoa-phai-co-von-dieu-le-toi-thieu-1500-ty-dong-186-111173-article.html | NĐ 306/2025 sửa NĐ 158/2020 — https://doanhnhan.baophapluat.vn/tu-nam-2026-bo-hang-loat-dieu-kien-kinh-doanh-chung-khoan-phai-sinh-theo-nghi-dinh-306.html |
| Sản phẩm | Liên thông sàn quốc tế: CBOT, ICE, COMEX, NYMEX, LME, SGX… — https://en.mxv.com.vn/overview.html | HĐTL VN30, VN100, trái phiếu Chính phủ |
| Giờ giao dịch | Chủ yếu chiều tối – rạng sáng giờ VN (theo sàn gốc) — https://www.finhay.com.vn/quy-dinh-giao-dich-hang-hoa-phai-sinh | 08:45–14:45 — https://dsc.com.vn/kien-thuc/gio-giao-dich-phai-sinh |

### 1.7 Mở tài khoản qua thành viên MXV
1. Chọn một **thành viên kinh doanh của MXV** (33 thành viên tại 01/09/2026 — https://tapchicongthuong.vn/so-giao-dich-hang-hoa-viet-nam--vung-vang-niem-tin--khong-ngung-phat-trien-546232.htm). Kiểm tra tên trên danh sách thành viên công bố tại website MXV (https://mxv.com.vn) — **không** giao dịch qua sàn "ngoại" hay ứng dụng không phải thành viên.
2. Ký hợp đồng mở tài khoản (CCCD, tài khoản ngân hàng). Đọc kỹ biểu phí (phí cố định theo lot; ví dụ Finhay đăng 08/05/2026 — https://www.finhay.com.vn/bieu-phi-giao-dich-hang-hoa-finhay) và phí dữ liệu.
3. Nộp ký quỹ bằng VND. Lưu ý: khách cá nhân **không được nhận hàng vật chất**, phải đóng/roll trước ngày thông báo đầu tiên; 3–5 ngày trước FND hợp đồng chuyển chế độ "Only Close" — https://www.finhay.com.vn/quy-dinh-giao-dich-hang-hoa-phai-sinh
4. Căn cứ pháp lý cho cá nhân tham gia: Điều 25 NĐ 302/2026 — https://tapchicongthuong.vn/so-giao-dich-hang-hoa-viet-nam--vung-vang-niem-tin--khong-ngung-phat-trien-546232.htm . Cơ chế bảo vệ tài sản khách hàng khi thành viên mất khả năng thanh toán còn đang được xây dựng trong dự thảo Luật — https://daibieunhandan.vn/kien-tao-thi-truong-giao-dich-hang-hoa-phai-sinh-an-toan-hien-dai-10431895.html

---

## Cấp 2 — Cơ chế

### 2.1 Ngày đáo hạn, LTD, FND
- **LTD (Last Trading Day):** ngày cuối cùng hợp đồng còn được giao dịch.
- **FND (First Notice Day):** ngày đầu tiên bên bán có thể thông báo giao hàng. Với hợp đồng giao vật chất, người giữ long sau FND có thể bị giao hàng → nhà đầu cơ đóng trước FND (ở MXV bắt buộc).
- Ứng dụng tính lịch theo quy tắc niêm yết (Contract Explorer → contract chain, calendar rule). Ngày cụ thể phải đối chiếu lịch sàn.

### 2.2 Giao vật chất vs thanh toán tiền
- **Physical:** đáo hạn thì giao hàng thật (ZS, ZC, KC…). **Cash:** đáo hạn thì thanh toán chênh lệch theo giá tham chiếu (ví dụ VN30F, quặng sắt TIO).

### 2.3 Roll (cuộn hợp đồng) và chuỗi liên tục
- Roll = đóng hợp đồng tháng gần, mở hợp đồng tháng xa để giữ vị thế. Chi phí/lợi ích roll phụ thuộc chênh lệch giữa hai tháng.
- **Chuỗi liên tục (continuous)** như `ZC=F` trên Yahoo là ghép nhiều hợp đồng; tại điểm roll có "bước nhảy giá" không phải lãi/lỗ thật. Khi backtest phải điều chỉnh (back-adjust) hoặc dùng dữ liệu theo từng kỳ hạn — https://help.yahoo.com/kb/SLN2310.html (độ trễ), https://databento.com/docs/faqs/usage-pricing-and-data-credits (dữ liệu theo kỳ hạn).

### 2.4 Cấu trúc kỳ hạn: contango và backwardation
- **Contango:** giá tháng xa **cao hơn** tháng gần (thường do chi phí lưu kho, lãi vốn). Người giữ long và roll liên tục chịu "roll yield" âm.
- **Backwardation:** giá tháng xa **thấp hơn** tháng gần — thường khi hàng khan hiếm hiện tại.
→ Xem trong ứng dụng: **Term Structure** (đường cong từ dữ liệu bạn nhập, cùng ngày).

### 2.5 Basis
- Basis = giá giao ngay tại địa phương − giá futures. Doanh nghiệp phòng hộ vẫn chịu **rủi ro basis** (ví dụ cà phê Tây Nguyên vs Robusta ICE) và rủi ro tỷ giá — phân tích tại `docs/VN_DERIVATIVES_MARKET.md` mục 8.

### 2.6 Thanh khoản
- Ưu tiên hợp đồng tháng gần, khối lượng & OI lớn. Hợp đồng thanh khoản thấp → chênh lệch giá mua/bán rộng, trượt giá cao. Ví dụ ở HNX: VN100F 10/2026 chỉ ~179 HĐ/phiên, HĐTL trái phiếu không có giao dịch — https://24hmoney.vn/news/thanh-khoan-phai-sinh-sut-giam-trong-thang-10-c1a2857234.html

---

## Cấp 3 — Phân tích

### 3.1 Cơ bản (fundamentals)
- **USDA WASDE** (hằng tháng): cung–cầu ngô, đậu tương, lúa mì, bông, đường — https://www.usda.gov/node/42884 ; **NASS** tiến độ mùa vụ.
- **EIA**: tồn kho dầu thô, khí tự nhiên (hằng tuần) — https://www.oilpriceapi.com/eia-api (nguồn thứ ba mô tả API).
- **Thời tiết**: NOAA NCEI — https://www.ncei.noaa.gov/cdo-web/webservices/v2
- **USD**: hàng hóa yết giá USD, USD mạnh thường gây áp lực giảm giá (quan hệ không cố định).
- **USD/VND**: ký quỹ & lãi/lỗ ở MXV quy ra VND; tỷ giá trung tâm NHNN 25.623 ngày 05/11/2026 (theo báo chí) — https://e.vnexpress.net/news/business/markets/vietnam-central-bank-s-exchange-rate-reaches-another-peak-5121481.html
→ Xem: **Macro Data / Fundamental**.

### 3.2 COT (Commitments of Traders)
- CFTC công bố thứ Sáu 15:30 ET (rạng sáng thứ Bảy giờ VN), dữ liệu chốt **thứ Ba** — https://www.cftc.gov/MarketReports/CommitmentsofTraders/AbouttheCOTReports/index.htm
- Đọc vị thế ròng của nhóm thương mại (hedger) và quỹ (managed money); **COT Index** = vị trí của vị thế ròng hiện tại trong khoảng min–max của N tuần. Vị thế cực đoan là bối cảnh, không phải tín hiệu vào lệnh.
→ Xem: **COT**.

### 3.3 Kỹ thuật — chỉ báo được tính thế nào
- **SMA(n)** = trung bình cộng n giá đóng cửa. **EMA(n)**: EMAₜ = α·Giáₜ + (1−α)·EMAₜ₋₁, α = 2/(n+1).
- **RSI(14)** = 100 − 100/(1+RS), RS = trung bình tăng / trung bình giảm 14 phiên (làm trơn Wilder).
- **MACD** = EMA12 − EMA26; đường tín hiệu = EMA9 của MACD.
- **Bollinger** = SMA20 ± 2 độ lệch chuẩn.
- **ATR(14)**: trung bình True Range = max(H−L, |H−C trước|, |L−C trước|) — dùng để đặt stop theo biến động.
- Chỉ báo chỉ mô tả giá quá khứ, không dự đoán; luôn kiểm định bằng backtest có chi phí.
→ Xem: **Technical**, **Charts**.

### 3.4 Thống kê
- **Biến động (volatility):** độ lệch chuẩn lợi suất log × √252 (năm hóa).
- **Tương quan:** hệ số Pearson giữa lợi suất (không phải giữa giá). Hai vị thế tương quan cao = một rủi ro gấp đôi.
- **Mùa vụ (seasonality):** lợi suất trung bình theo tháng qua nhiều năm — cần đủ số năm, và mùa vụ có thể "biến mất".
→ Xem: **Analysis** (volatility, correlation, seasonality, spreads, drawdown).

---

## Cấp 4 — Quản trị rủi ro

### 4.1 Khối lượng vị thế theo khoảng cách stop
- Rủi ro/hợp đồng = (|giá vào − stop| ÷ tick) × tick value (+ phí, trượt giá).
- Số hợp đồng = floor(vốn × %rủi ro ÷ rủi ro/hợp đồng). Nếu kết quả = 0 → **không vào lệnh** (hoặc dùng hợp đồng Micro).
- Ví dụ: vốn 10.000 USD, rủi ro 1% = 100 USD; ZC stop 8 cent = 32 tick × 12,5 = 400 USD/HĐ → 0 hợp đồng ZC chuẩn.
→ Xem: **Risk**.

### 4.2 Giới hạn lỗ ngày
- Đặt trước, ví dụ 2–3% vốn/ngày: chạm là dừng giao dịch hết ngày. Mục đích: chặn chuỗi quyết định cảm xúc.

### 4.3 Rủi ro tương quan
- Long đậu tương + long khô đậu + long dầu đậu ≈ một vị thế lớn trên "phức hợp đậu tương". Cộng rủi ro theo nhóm, không theo từng mã.
→ Xem: **Portfolio**, **Analysis → Correlation**.

### 4.4 Nhật ký và R-multiple
- **1R** = số tiền rủi ro dự kiến của lệnh. Kết quả lệnh tính bằng R (lãi 2R, lỗ −1R).
- **Kỳ vọng (expectancy)** = tỷ lệ thắng × R thắng TB − tỷ lệ thua × R thua TB. Cần ≥ 30–50 lệnh mới có ý nghĩa thống kê sơ bộ.
→ Xem: **Journal**.

---

## Cấp 5 — Nâng cao

### 5.1 Spread
- **Calendar spread:** long tháng này, short tháng khác cùng hàng hóa (ví dụ ZC tháng 7 / tháng 12 — "old crop/new crop").
- **Inter-commodity:** giữa hàng hóa liên quan — crush spread đậu tương (ZS vs ZM + ZL), Brent–WTI.
- **Inter-exchange:** cùng hàng hóa khác sàn (Arabica ICE US vs Robusta ICE EU — khác chất lượng, khác đơn vị: cent/lb vs USD/tấn → phải quy đổi).
- Spread thường ít biến động hơn outright nhưng **không phải không rủi ro**.
→ Xem: **Term Structure** (calendar spread history), **Analysis → Spreads**.

### 5.2 Bẫy khi backtest
- **Look-ahead bias:** dùng thông tin chưa có tại thời điểm ra quyết định (ví dụ dùng giá đóng cửa để vào lệnh ngay trong chính nến đó; dùng ngày báo cáo COT thứ Ba như thể đã công bố).
- **Chi phí:** phí, trượt giá, chênh lệch roll — bỏ qua là ảo tưởng lợi nhuận.
- **Overfitting:** tối ưu quá nhiều tham số trên một đoạn dữ liệu → chiến lược "học thuộc" quá khứ. Giữ dữ liệu out-of-sample, ít tham số, kiểm tra trên nhiều thị trường.
- **Survivorship / dữ liệu ghép:** chuỗi continuous chưa điều chỉnh roll tạo lãi/lỗ giả.
→ Xem: **Backtest**.

### 5.3 Quyền chọn: Greeks và IV
- **Delta:** giá quyền chọn thay đổi bao nhiêu khi futures tăng 1 đơn vị. **Gamma:** tốc độ thay đổi delta. **Theta:** mất giá theo thời gian. **Vega:** nhạy với biến động hàm ý.
- **IV (implied volatility):** biến động mà giá quyền chọn đang hàm ý — so với biến động lịch sử để biết quyền chọn "đắt/rẻ" tương đối.
- Lưu ý: hiện MXV chủ yếu niêm yết futures; quyền chọn chỉ số tại HNX dự kiến kiểm thử nội bộ năm 2027 — https://thoibaotaichinhvietnam.vn/tang-toc-trien-khai-ccp-dam-bao-van-hanh-dung-lo-trinh-vao-dau-nam-2027-206550.html

### 5.4 Giao dịch hệ thống
- Quy tắc vào/ra/khối lượng được viết rõ, kiểm định, rồi tuân thủ. Ưu điểm: loại bỏ cảm xúc, đo lường được. Nhược điểm: drawdown kéo dài, chiến lược hết hiệu quả.
→ Xem: **Strategies**, **Scanner**, **Backtest**.

---

## Các cách kiếm tiền từ phái sinh

| Cách | Mô tả | Ai phù hợp | Rủi ro chính |
|---|---|---|---|
| Đầu cơ theo xu hướng | Theo xu hướng trung/dài hạn, cắt lỗ sớm, để lãi chạy | Cá nhân có kỷ luật, vốn đủ để chịu chuỗi thua | Thị trường đi ngang, chuỗi thua dài, đòn bẩy |
| Đầu cơ spread | Calendar / inter-commodity spread | Người đã vững cấp 2–3 | Spread có thể nới rộng mạnh; thanh khoản chân xa |
| Đầu cơ mùa vụ | Dựa trên chu kỳ trồng/thu hoạch | Người có dữ liệu nhiều năm | Mùa vụ không lặp lại; thời tiết bất thường |
| Phòng hộ (hedging) cho doanh nghiệp | Nhà nhập khẩu đậu tương, chế biến cà phê khóa giá | Doanh nghiệp có hàng thật | Rủi ro basis và tỷ giá; cần dòng tiền ký quỹ |
| Arbitrage | Khai thác chênh lệch giá giữa sàn/kỳ hạn | **Tổ chức** (chi phí thấp, hạ tầng nhanh) | Cá nhân gần như không có lợi thế |
| Bán quyền chọn | Thu phí premium đều đặn | Người hiểu sâu Greeks, có vốn lớn | **Rủi ro đuôi**: lãi nhỏ nhiều lần, một biến cố có thể mất rất lớn |
| Nghề nghiệp | Môi giới tại thành viên MXV, phân tích, quản trị rủi ro, trading desk doanh nghiệp | Người học bài bản | Thu nhập ổn định hơn tự giao dịch |
| Sản phẩm/giáo dục | Công cụ phân tích, dữ liệu, khóa học | Người có kỹ năng xây dựng/giảng dạy | Phải tôn trọng bản quyền dữ liệu (MXV/Yahoo) — https://cdn.jsdelivr.net/gh/ranaroussi/yfinance@main/README.md |

## Rủi ro — đọc trước khi giao dịch

- **Phần lớn nhà giao dịch cá nhân dùng đòn bẩy bị lỗ.** Ví dụ có số liệu công bố: các công ty CFD tại EU phải công bố tỷ lệ tài khoản cá nhân thua lỗ, ESMA nêu mức 74–89% khi hạn chế CFD năm 2018 (CFD không phải futures MXV; URL chưa kiểm tra lại trong khảo sát này) — https://www.esma.europa.eu/press-news/esma-news/esma-agrees-prohibit-binary-options-and-restrict-cfds-protect-retail-investors . Không có thống kê lãi/lỗ công khai cho khách MXV (chưa xác minh).
- Thị trường MXV: ~**99,5% tài khoản là cá nhân** (2025), khối lượng tập trung vào bạc/đồng/bạch kim Micro–Nano — dấu hiệu đầu cơ cao — https://tapchicongthuong.vn/nam-2025--thanh-khoan-lap-dinh--thi-truong-giao-dich-hang-hoa-buoc-vao-giai-doan-truong-thanh-436170.htm ; https://daibieunhandan.vn/khoi-luong-giao-dich-hang-hoa-tang-hon-140-trong-quy-i-2026-10417083.html
- Biến động lớn rơi vào **20:30–02:00 giờ VN** (Mỹ mở cửa, báo cáo USDA/EIA): ảnh hưởng giấc ngủ và quyết định.
- **Giao dịch giấy (paper trade) 3–6 tháng** với quy tắc rủi ro cấp 4 trước khi dùng tiền thật; ghi nhật ký từng lệnh.
- **Chỉ giao dịch qua thành viên được MXV cấp phép** (hoặc công ty chứng khoán cho HNX). Cảnh giác các "sàn" hứa lợi nhuận cố định, nhận tiền vào tài khoản cá nhân.
- Ứng dụng này là **công cụ nghiên cứu/giáo dục, không phải khuyến nghị đầu tư**, không kết nối lệnh với broker, và không tái phân phối giá MXV.

## Nguồn chính
- MXV: https://en.mxv.com.vn/overview.html · https://en.mxv.com.vn/trading/margin.html
- NĐ 302/2026: https://luatvietnam.vn/tin-van-ban-moi/tu-15-9-2026-lan-dau-tien-so-giao-dich-hang-hoa-phai-co-von-dieu-le-toi-thieu-1500-ty-dong-186-111173-article.html
- Quy định giao dịch (thành viên): https://www.finhay.com.vn/quy-dinh-giao-dich-hang-hoa-phai-sinh
- CFTC COT: https://www.cftc.gov/MarketReports/CommitmentsofTraders/AbouttheCOTReports/index.htm
- USDA WASDE: https://www.usda.gov/node/42884
- Đặc tả hợp đồng: các URL `dataSource` trong `server/data/instruments.ts`
