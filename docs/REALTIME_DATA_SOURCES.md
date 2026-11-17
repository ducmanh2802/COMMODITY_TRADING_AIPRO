# Nguồn dữ liệu giá real-time / gần real-time (miễn phí hoặc free-tier)

> Khảo sát ngày 2026-11-17. Mọi số liệu kèm URL nguồn và ngày (nếu nguồn có ghi). Mục ghi **"chưa xác minh"** là chưa đối chiếu được với tài liệu chính thức — phải kiểm tra lại trước khi tích hợp.
> **Quyết định của người dùng:** dữ liệu **trễ ≤ 15 phút, miễn phí** là mục tiêu chính; không bắt buộc real-time.

## 0. Kết luận nhanh

- Dữ liệu futures **real-time** của sàn (CME/ICE) **gần như không bao giờ miễn phí**: CME tính phí thiết bị hiển thị real-time cho từng người dùng (bảng phí 01/2026: real-time display device 101,50 USD; delayed display device 0,40 USD; gói non-pro top-of-book tất cả sàn 4,65 USD/thiết bị) — https://www.cmegroup.com/market-data/files/january-2026-market-data-fee-list.pdf
- Giá trên MXV là giá **liên thông** với sàn quốc tế (CBOT, ICE US/EU, COMEX, NYMEX, LME, SGX, OSE, BMD) — https://en.mxv.com.vn/overview.html. Vì vậy, với nghiên cứu, **giá của sàn gốc (trễ 10–15 phút) gần như thay thế được bảng giá MXV**; chỉ cần quy đổi USD→VND và áp đặc tả hợp đồng MXV.
- MXV **không công bố API dữ liệu công khai**; trang giới thiệu chỉ có biểu đồ MXV-Index — https://en.mxv.com.vn/overview.html. Hợp đồng mở tài khoản có “phí sử dụng Cơ sở dữ liệu” (gồm chi phí MXV trả cho đối tác nước ngoài) → dữ liệu MXV là dữ liệu có bản quyền, **không nên scrape/tái phân phối** — https://docs.google.com/document/d/1Ra2n915RVLksqxm1cy2N4y5-unjOAH2R/export?format=pdf

## 1. Ánh xạ mã MXV ↔ sàn gốc

Bảng ký quỹ MXV (QĐ 644/QĐ/TGĐ-MXV ngày 22/08/2025 và 638 ngày 21/08/2025) xác nhận mã và sàn liên thông — https://en.mxv.com.vn/trading/margin.html

| Mã MXV | Hàng hóa | Sàn gốc | Mã gốc | Yahoo (continuous) |
|---|---|---|---|---|
| ZSE / ZME / ZLE | Đậu tương / Khô đậu / Dầu đậu | CBOT | ZS / ZM / ZL | ZS=F / ZM=F / ZL=F |
| ZCE / ZWA / ZRE | Ngô / Lúa mì / Gạo thô | CBOT | ZC / ZW / ZR | ZC=F / ZW=F / ZR=F (ZR chưa xác minh) |
| KCE / SBE / CCE / CTE | Arabica / Đường 11 / Ca cao / Bông | ICE US | KC / SB / CC / CT | KC=F / SB=F / CC=F / CT=F |
| LRC | Robusta | ICE EU | RC | **không có** trên Yahoo (chưa xác minh) |
| CPE / SIE | Đồng / Bạc | COMEX | HG / SI | HG=F / SI=F |
| PLE | Bạch kim | NYMEX | PL | PL=F |
| (Brent – mã MXV chưa xác minh) | Dầu Brent | ICE EU | BRN | BZ=F là Brent của NYMEX, không phải ICE (chưa xác minh) |
| — | Quặng sắt | SGX (MXV mã FEF); CME TIO | TIO | chưa xác minh |

Ghi chú: MXV còn có hợp đồng Micro/Mini/Nano (MZS, MZL, SIL, MHG, SI5CO…) — cùng nguồn trên. Mã hợp đồng đầy đủ = mã gốc + ký hiệu tháng + 2 số năm, ví dụ ZCEZ26 — https://www.finhay.com.vn/cach-doc-ma-giao-dich-hang-hoa-phai-sinh

## 2. Nguồn quốc tế – trễ ≤ 15 phút, miễn phí (mục tiêu chính)

| Nguồn | Độ trễ | Phủ công cụ của ta | Giới hạn free | Theo kỳ hạn (contract-month)? | Auth / bản quyền |
|---|---|---|---|---|---|
| **Yahoo Finance (không chính thức, qua `yfinance`)** | CBOT, CME: **10 phút**; COMEX, NYMEX, ICE US: **30 phút** (theo trang trợ giúp Yahoo) — https://help.yahoo.com/kb/SLN2310.html | CBOT ZS ZM ZL ZC ZW (ZR?); ICE US KC SB CC CT; COMEX HG GC SI; NYMEX PL CL NG. **Thiếu ICE EU (RC, BRN)** và TIO (chưa xác minh) | Không công bố; hay bị chặn/đổi API — https://cdn.jsdelivr.net/gh/ranaroussi/yfinance@main/README.md | Continuous `=F` chắc chắn; mã theo tháng dạng `ZSF27.CBT` — **chưa xác minh** | Không key. README yfinance: API Yahoo “intended for personal use only” — cùng URL. Không dùng cho sản phẩm thương mại/tái phân phối |
| **Massive (ex-Polygon) Futures Basic** | Basic: độ tươi **chưa xác minh** (nhiều khả năng EOD); Starter 29 USD/tháng: **trễ 10 phút** — https://massive.com/futures | 4 sàn CME Group (CBOT, CME, COMEX, NYMEX): ZS ZM ZL ZC ZW ZR HG GC SI PL CL NG TIO(?) ; **không có ICE** | Basic 0 USD: **5 calls/phút**, 2 năm lịch sử, “all futures tickers” — https://massive.com/futures | Có (REST contracts snapshot theo từng hợp đồng) — https://massive.com/docs/rest/futures/snapshots/contracts-snapshot.md | API key; điều khoản tái phân phối chưa xác minh |
| **TradingView (web, free plan)** | CME Group: **10 phút** — https://tradingview.com/cme | CME/CBOT/COMEX/NYMEX; ICE trên free plan **chưa xác minh** | Không có API dữ liệu chính thức → chỉ dùng hiển thị/nhúng widget | Có trên giao diện | Scrape vi phạm ToS (chưa xác minh chi tiết) — **không dùng làm nguồn ingest** |
| **Interactive Brokers (cần tài khoản)** | Delayed miễn phí **15–20 phút** — https://www.interactivebrokers.com/docs/tws-api/doc/md/delayed-data | CME Group + ICE (với tài khoản) | Giới hạn pacing TWS; futures historical có thể vẫn lỗi quyền — https://kaweah.freedombox.rocks/kiwix/stackoverflow.com_en_all_2023-11/questions/62514491/futures-data-no-permissions-through-reqhistoricaldata-but-reqmktdata-works | Có (theo `conId`/tháng) | Cần TWS/Gateway chạy; dữ liệu cho cá nhân |
| **Barchart OnDemand free** | `getQuote`/`getHistory` free; độ trễ futures free **chưa xác minh** (Barchart bán riêng “Futures Delayed Data API”) — https://www.barchart.com/ondemand/futures-delayed-data-api | CBOT/ICE… (chưa xác minh trên free key) | Chưa xác minh | Có (mã Barchart theo tháng) | Phải xin key — https://www.barchart.com/ondemand/api/getHistory/free |
| **Twelve Data Basic** | Real-time cho cổ phiếu Mỹ, FX, crypto — https://twelvedata.com/pricing | Commodities: trang chỉ nêu vàng/bạc spot — https://twelvedata.com/commodities ; **futures nông sản: không** (chưa xác minh) | **8 calls/phút, 800/ngày**; 8 WS credit dùng thử | Không | “Internal non-display usage” |
| **Alpha Vantage** | Daily/weekly/monthly (không intraday) | WTI, Brent, NG, Copper, Aluminum, Wheat, Corn, Cotton, Sugar, Coffee, Gold/Silver — https://www.alphavantage.co/documentation/ | **25 requests/ngày** — https://alphavantage.co/support/ | Không (chuỗi giá giao ngay/tham chiếu) | Key miễn phí |
| **Financial Modeling Prep Basic** | Free: **EOD**; real-time chỉ gói trả phí — https://site.financialmodelingprep.com/datasets/commodity | Danh sách commodities (ZS, KC, GC…; chi tiết chưa xác minh) — https://site.financialmodelingprep.com/developer/docs/stable/commodities-list | **250 calls/ngày** — https://site.financialmodelingprep.com/faqs | Không (continuous) | Key |
| **Stooq** | EOD | Futures: tải `.f` từng không hoạt động — https://wealth-lab.com/Discussion/EOD-data-for-futures-from-Stooq-9923 | Từ 03/2026 yêu cầu API key, có quota/ngày — https://github.com/pydata/pandas-datareader/issues/1012 | Không | Không khuyến nghị |

Các nguồn trả phí để tham chiếu (không phải mục tiêu):
- **Databento**: tặng **125 USD credit** khi đăng ký (chỉ dữ liệu lịch sử, hết hạn 6 tháng) — https://databento.com/docs/faqs/usage-pricing-and-data-credits ; CME Globex MDP3 phủ CME/CBOT/NYMEX/COMEX, lịch sử từ 0,50 USD/GB; gói thuê bao CME 199 USD/tháng, ICE Europe Commodities 2.500 USD/tháng (cập nhật 29/05/2026) — https://databento.com/blog/updates-to-subscription-pricing . **Rất phù hợp để mua 1 lần dữ liệu lịch sử theo từng kỳ hạn** (ZS, KC… đủ tick/OHLCV).
- **Massive Futures Advanced** 199 USD/tháng real-time — https://massive.com/futures
- **CME DataMine**: trả phí (chưa xác minh giá).
- Phí real-time CME non-pro qua broker/TradingView: 1,55 USD top-of-book/sàn, 4,65 USD gói (bảng 06/2026) — https://www.cmegroup.com/market-data/files/june-2026-market-data-fee-list.pdf

## 3. Nguồn Việt Nam

### 3.1 MXV (hàng hóa phái sinh)
- Không có API công khai (xem mục 0). Ứng dụng **MXV News** (Trung tâm Tin tức Hàng hóa VN thuộc MXV) có bảng giá, biểu đồ — https://apps.apple.com/vn/app/id1538744175 . Endpoint nội bộ của app/web: **chưa xác minh**, không nên dùng.
- Dữ liệu MXV công khai hữu ích: bảng ký quỹ (HTML) — https://en.mxv.com.vn/trading/margin.html ; MXV-Index (biểu đồ) — https://en.mxv.com.vn/overview.html ; giờ giao dịch theo nhóm hàng (qua thành viên) — https://www.finhay.com.vn/quy-dinh-giao-dich-hang-hoa-phai-sinh . → Nên **cào định kỳ thủ công/ít tần suất** các bảng tham số (ký quỹ, giờ GD), không cào giá.
- Phần mềm giao dịch của thành viên (TVKD) cấp giá real-time cho chủ tài khoản; điều khoản tái phân phối: **chưa xác minh** (mặc định coi là cấm).

### 3.2 HNX phái sinh (VN30F, VN100F, HĐTL trái phiếu) qua API công ty chứng khoán

| Broker API | Có thật? | Auth | Real-time | Giao thức | Phái sinh | Phí / giới hạn |
|---|---|---|---|---|---|---|
| **SSI FastConnect Data** | Có — https://guide.ssi.com.vn/ssi-products/fastconnect-data | ConsumerID + ConsumerSecret (đăng ký) — https://guide.ssi.com.vn/ssi-products/fastconnect-data/connection-guide | EOD + realtime | REST + streaming (`wss://` cho Node.js) | Có (SSI mô tả FC Data gồm Cash và Derivatives) — https://guide.ssi.com.vn/ssi-products | Phí, rate limit, quyền tái phân phối: chưa xác minh |
| **DNSE LightSpeed API** | Có — https://www.dnse.com.vn/hoc/dnse-lightspeed-api-la-gi | Tài khoản DNSE; client ID + investor ID, xác thực qua Entrade — https://hdsd.dnse.com.vn/san-pham-dich-vu/lightspeed-api-truoc-krx/iii.-market-data/2.-dac-ta-thong-tin-cac-message/2.1.-moi-truong | Streaming realtime + OHLC ngày | MQTT over WSS (cổng 443) | Có (topics) — https://hdsd.dnse.com.vn/san-pham-dich-vu/lightspeed-api-truoc-krx/iii.-market-data/2.-dac-ta-thong-tin-cac-message/2.2.-topics | Miễn phí hay không: chưa xác minh; tài liệu bản “trước KRX”, một số trang KRX báo 404 |
| **TCBS OpenAPI** | Có (PDF spec) — https://developers.tcbs.com.vn/specs/tcbs-openapi-v1.0.0-vi.pdf | API key → JWT | Có | REST + WebSocket (bảng giá, bảng giá phái sinh) | Có (mục 7) | Điều kiện, rate limit: chưa xác minh |
| VNDirect (dstock) | Chưa xác minh — https://glama.ai/mcp/servers/Long0308/vn-stock-api-mcp/tools/list_vn_stocks | — | — | — | — | — |
| VPS, KBSV | Không tìm thấy API công khai cho khách hàng (chưa xác minh) | — | — | — | — | — |

### 3.3 Thư viện mã nguồn mở `vnstock`
- `vnstock` thế hệ 6 là phiên bản hiện hành; **thế hệ 5 trở về trước ngừng hoạt động từ 10/11/2026**; tự nhận là “client-side software, not a data provider”, người dùng phải tuân thủ điều khoản của từng nguồn; giấy phép tại vnstocks.com — https://github.com/thinh-vu/vnstock
- Nguồn: KBS mặc định; VCI/DNSE/TCBS thay thế; TCBS được ghi là “unofficial public endpoints” — https://github.com/vnstock-official/vnstock (theo kết quả tìm kiếm; chưa đọc trực tiếp).
- Rủi ro: endpoint không chính thức, có thể đổi/chặn bất kỳ lúc nào; quyền thương mại: chưa xác minh. Chỉ dùng cho **VN30F/VN100F lịch sử phục vụ nghiên cứu**, không dùng cho hàng hóa MXV (không phủ — chưa xác minh).

## 4. Dữ liệu cơ bản (fundamentals) chính thức, miễn phí

| Nguồn | Nội dung | Tần suất / trễ | Truy cập |
|---|---|---|---|
| **CFTC COT** | Vị thế theo nhóm trader cho ZS ZM ZL ZC ZW KC SB CC CT HG GC SI PL CL NG… | Thứ Sáu 15:30 ET, dữ liệu chốt thứ Ba — https://www.cftc.gov/MarketReports/CommitmentsofTraders/AbouttheCOTReports/index.htm | Socrata API tại publicreporting.cftc.gov — https://www.cftc.gov/MarketReports/CommitmentsofTraders/ExplanatoryNotes/index.htm ; không cần key (chưa xác minh) |
| **EIA API v2** | Giá spot WTI (RWTC), Brent (RBRTE), tồn kho | Spot daily nhưng cập nhật hằng tuần — https://www.oilpriceapi.com/eia-api (nguồn thứ ba) | Key miễn phí; tối đa 5.000 dòng/JSON; rate limit chính thức chưa xác minh |
| **FRED** | Bản sao chuỗi EIA (DCOILWTICO, DCOILBRENTEU) | Daily | 120 req/phút (theo nguồn thứ ba) — https://www.oilpriceapi.com/eia-api |
| **USDA WASDE** | Cung–cầu ngô, đậu tương, lúa mì, gạo, bông, đường | Hằng tháng; PDF/XML/Excel/TXT; CSV lịch sử theo tháng — https://www.usda.gov/node/42884 | Tải file; dữ liệu đã hiệu chỉnh tại FAS PS&D |
| **USDA NASS Quick Stats** | Sản lượng, tiến độ mùa vụ Mỹ | Theo lịch NASS | Key miễn phí, CSV, ≤ 50.000 bản ghi/query — https://github.com/ropensci/rnassqs |
| **NOAA NCEI CDO v2** | Thời tiết lịch sử (Mỹ & toàn cầu GHCN) | Daily | Token miễn phí, 5 req/giây, 10.000 req/ngày — https://www.ncei.noaa.gov/cdo-web/webservices/v2 |
| **World Bank Pink Sheet** | Giá tháng (Arabica, Robusta, đậu tương, đường, cao su, kim loại…) | Hằng tháng; link XLSX đổi hash mỗi tháng — https://www.worldbank.org/commodities | Tải XLSX; bản mới thấy được: 05/2026 PDF — https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Pink-Sheet-May-2026.pdf |

### Tỷ giá USD/VND
- **NHNN – tỷ giá trung tâm**: công bố hằng ngày; ví dụ **25.623 VND/USD ngày 05/11/2026** (theo báo chí, chưa đối chiếu sbv.gov.vn) — https://e.vnexpress.net/news/business/markets/vietnam-central-bank-s-exchange-rate-reaches-another-peak-5121481.html . API chính thức: chưa xác minh → cào trang sbv.gov.vn 1 lần/ngày.
- **Vietcombank**: endpoint XML `portal.vietcombank.com.vn/UserControls/TVPortal.TyGia/pXML.aspx` (theo nguồn thứ ba, chưa xác minh) — https://allratestoday.com/blog/vietcombank-exchange-rate-api/ . Đây là tỷ giá tham khảo của ngân hàng, không phải tỷ giá chính thức.
- MXV quy đổi ký quỹ theo tỷ giá USD/VND (ký quỹ ban đầu = ký quỹ cơ sở × 120% × tỷ giá) — https://www.finhay.com.vn/quy-dinh-giao-dich-hang-hoa-phai-sinh

## 5. Khuyến nghị xếp hạng

### (a) Giám sát gần real-time — mục tiêu “trễ ≤ 15 phút, miễn phí”

| Hạng | Nguồn | Trễ thực tế | Công cụ của ta được phủ | Giới hạn free | Theo kỳ hạn |
|---|---|---|---|---|---|
| 1 | **Yahoo Finance (yfinance)** – chỉ cho dùng nội bộ/cá nhân | 10 phút (CBOT: ZS ZM ZL ZC ZW ZR*) ; **30 phút** (ICE US KC SB CC CT; COMEX HG GC SI; NYMEX PL CL NG) — https://help.yahoo.com/kb/SLN2310.html | ~17/21 mã; thiếu RC, BRN, TIO (*ZR chưa xác minh) | Không công bố, phải tự throttle (gợi ý ≤ 1 lần quét/phút cho cả rổ) | Continuous chắc chắn; theo tháng chưa xác minh |
| 2 | **Massive Futures Basic → Starter (29 USD) nếu cần** | Basic chưa xác minh (có thể EOD); Starter 10 phút — https://massive.com/futures | 12–13 mã CME Group (không ICE) | 5 calls/phút | **Có** |
| 3 | **IBKR delayed** (nếu người dùng có tài khoản IBKR) | 15–20 phút — https://www.interactivebrokers.com/docs/tws-api/doc/md/delayed-data | Toàn bộ, kể cả ICE EU (RC, BRN) — chưa xác minh cho ICE | Pacing TWS | **Có** |
| 4 | **TradingView widget** (chỉ hiển thị, không ingest) | 10 phút cho CME Group — https://tradingview.com/cme | CME Group | — | Có |
| 5 | **API broker VN (SSI FC Data / DNSE / TCBS)** cho VN30F, VN100F | Real-time (với tài khoản) | Chỉ phái sinh HNX | Chưa xác minh | Có |

Thực tế cần chấp nhận: theo yêu cầu “≤ 15 phút”, **chỉ CBOT/CME qua Yahoo (10 phút) và Massive Starter (10 phút, trả phí nhẹ) đạt chuẩn**; ICE US/COMEX/NYMEX trên Yahoo là 30 phút; **Robusta (LRC/RC) và Brent ICE không có nguồn miễn phí ≤ 15 phút nào được xác minh**.

### (b) Nghiên cứu lịch sử
1. **Databento 125 USD credit** — mua một lần OHLCV-1d/1m theo từng kỳ hạn cho ZS ZM ZL ZC ZW ZR HG SI PL CL NG (CME MDP3); ICE cần kiểm tra giá riêng.
2. **Yahoo continuous `=F`** — chuỗi dài, miễn phí, chỉ cho nội bộ; cần tự xử lý roll.
3. **CFTC COT + WASDE + NASS + EIA + NOAA** — lớp fundamentals miễn phí, ổn định, giấy phép công (dữ liệu chính phủ Mỹ).
4. **World Bank Pink Sheet** — chuỗi tháng dài nhiều thập kỷ cho Robusta, cao su, phân bón… (bù chỗ thiếu ICE EU).
5. **vnstock / API broker** — lịch sử VN30F; **tỷ giá NHNN** để quy đổi sang VND.

### Lưu ý triển khai
- Lưu cờ `source`, `delay_minutes`, `is_continuous` cho mỗi bản ghi giá; hiển thị rõ “giá trễ X phút” trên UI.
- Không hiển thị lại/tái phân phối dữ liệu Yahoo/MXV ra công chúng; nếu app thương mại hóa → chuyển sang Massive/Databento có giấy phép.
- Giá MXV ≈ giá sàn gốc tại cùng thời điểm; chênh lệch chủ yếu do tỷ giá, phí và đặc tả lot (Micro/Nano). Có thể tính “giá MXV quy đổi” = giá gốc × hệ số hợp đồng × tỷ giá.
