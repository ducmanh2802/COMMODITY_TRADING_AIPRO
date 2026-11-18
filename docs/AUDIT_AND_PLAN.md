# Audit & Kế hoạch hoàn thiện — COMMODITY TRADING AI PRO

> Ngày audit: 2026-11-17 · Mục tiêu sản phẩm: **app nghiên cứu phái sinh hàng hóa** (MXV + CBOT/CME/COMEX/NYMEX/ICE).

## 1. Hiện trạng (đã kiểm chứng bằng chạy thật)

| Hạng mục | Kết quả |
|---|---|
| Quy mô | ~45 file, React 19 + Vite 8 + Express 4 + Firebase (Auth/Firestore), khởi tạo từ Google AI Studio |
| `npm install` | **FAIL** — xung đột peer: `esbuild@^0.25` vs `vite@8` cần `esbuild ^0.27/^0.28`. Chỉ cài được với `--legacy-peer-deps` |
| `tsc --noEmit` | PASS |
| Test | 14/14 PASS khi chạy bằng `tsx --test`; **FAIL** với `node --test` (import thiếu đuôi `.ts`). Không có script `npm test` |
| `vite build` | PASS, nhưng bundle 840 kB (chưa code-split) |
| Module chức năng | 4/16 hoạt động (Overview, Markets, Data Health, Settings); 12 module là placeholder |
| Dữ liệu thị trường | **Không có nguồn nào**: cả 6 provider đều là `FailClosedProviderAdapter` → mọi giá = `null` |
| Thông số hợp đồng | Cả 19 sản phẩm: contract size / tick / margin / expiry = `null`, `UNVERIFIED`; mã MXV chưa xác minh |

## 2. Phát hiện chính

### Lỗi (bug)
1. **SPA fallback hỏng ở production** — `server.ts` dùng route `'/{*splat}'` (cú pháp Express 5) trong khi cài Express 4 → deep link (vd. `/markets`) trả 404. Đã tái hiện.
2. **`npm install` thất bại** do `esbuild@^0.25` (xem trên).
3. **Script `start` không chạy trên Windows** (`NODE_ENV=production node …` là cú pháp POSIX).
4. **`handleFirestoreError` luôn `throw`** — được gọi bên trong callback async của `onAuthStateChanged` → unhandled rejection; `saveSettings` ném lỗi dạng JSON chứa email người dùng (log PII ra console).
5. **`testFirestoreConnection` trả `ONLINE` cho mọi lỗi** khác "offline" → trạng thái Data Health có thể sai.
6. Audit log id `settings_${Date.now()}` có thể trùng khi lưu nhanh liên tiếp.

### Bảo mật / chất lượng
7. Error handler trả `err.message` thô cho client.
8. Test Firestore rules chỉ là regex trên file text — "Dirty Dozen" trong `security_spec.md` **chưa hề được kiểm thử** bằng emulator.
9. `ProviderRegistry.getProviderForExchange` định tuyến theo chỉ số mảng (`providers[0..4]`) — dễ vỡ.
10. Không có rate limit cho `/api/*`.
11. ESLint chỉ cấu hình cho firestore rules; không lint TS/React. `package.json` tên `react-example`, công cụ build (vite, eslint…) nằm trong `dependencies`.
12. Phụ thuộc chưa dùng: `@google/genai`, `lightweight-charts`, `motion`.
13. Typo `isMvxListed` (MVX ≠ MXV) lặp 28 chỗ.

### Khoảng trống so với mục tiêu "nghiên cứu phái sinh"
14. Không có **dữ liệu lịch sử** → không làm được bất kỳ phân tích nào. Đây là nút thắt số 1.
15. Không có **danh sách kỳ hạn / lịch đáo hạn** → không làm được term structure, roll, spread lịch.
16. Roadmap hiện thiên về *giao dịch* (signals, STRONG_BUY, scanner, AI khuyến nghị). Với app nghiên cứu, nên ưu tiên: dữ liệu → đường cong kỳ hạn → spread/basis → mùa vụ → COT → biến động/tương quan → backtest.

## 3. Quyết định cần chủ dự án chốt
- **D1. Nguồn dữ liệu giá** (chặn Wave 2): (a) chỉ CSV người dùng tự nhập; (b) thêm nguồn EOD miễn phí (vd. Stooq/Yahoo — lưu ý điều khoản sử dụng, chỉ hợp đồng liên tục); (c) nhà cung cấp trả phí có giấy phép (Databento, Barchart, CME DataMine…).
- **D2. Lưu trữ dữ liệu chuỗi thời gian**: file JSON/SQLite cục bộ (đơn giản, đề xuất cho nghiên cứu) hay Firestore / Postgres.
- **D3. Giữ hay hạ ưu tiên** các module giao dịch (Signals, Scanner, AI khuyến nghị mua/bán).

**Mặc định đang áp dụng (2026-11-17, có thể đổi):** D1 = CSV là nguồn chuẩn; nguồn EOD miễn phí chỉ là tùy chọn, gắn nhãn `UNOFFICIAL`. D2 = SQLite qua `node:sqlite` tích hợp sẵn Node 24 (file `data/market.db`, không thêm dependency). D3 = hạ ưu tiên module giao dịch; tập trung công cụ nghiên cứu.

## 4. Danh sách task

Ký hiệu: **P0** = chặn mọi việc khác · **P1** = lõi nghiên cứu · **P2** = mở rộng. "Sở hữu file" = phạm vi để các agent làm song song không giẫm chân nhau.

### Wave 1 — Nền móng (làm song song ngay, không cần quyết định D1–D3)
| ID | Task | Ưu tiên | Sở hữu file | Tiêu chí hoàn thành |
|---|---|---|---|---|
| T01 | Sửa toolchain: nâng esbuild (hoặc bỏ), thêm script `test`/`typecheck`, `start` chạy được trên Windows, sửa SPA fallback, đổi tên package, chuyển devDeps, bỏ deps chưa dùng nếu an toàn, code-split bundle | P0 | `package.json`, lockfile, `server.ts`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js` | `npm install` sạch không cờ; `npm test`, `npm run lint`, `npm run build` pass; `/markets` trả index.html ở prod |
| T02 | Hardening backend: error handler không lộ message, định tuyến provider theo map, rate limit nhẹ (không thêm dep), test bổ sung | P0 | `server/app.ts`, `server/providers/**`, `server/app.test.ts` | Test mới pass |
| T03 | Instrument Master có kiểm chứng: điền contract size, tick size, tick value, đơn vị, giờ giao dịch, phương thức thanh toán, tháng niêm yết từ trang spec chính thức CME/ICE (kèm URL nguồn + ngày kiểm); MXV mapping chỉ đánh VERIFIED khi có nguồn MXV | P1 | `server/services/instrumentRegistry.ts` (+ file dữ liệu mới nếu tách) | Mỗi spec VERIFIED có `dataSource` là URL; không bịa số |
| T04 | Sửa Auth/Firebase: không throw trong listener, không log PII, trạng thái Firestore chính xác, id audit log duy nhất | P0 | `src/contexts/AuthContext.tsx`, `src/firebase.ts` | tsc pass; luồng đăng nhập không còn unhandled rejection |

### Wave 2 — Lớp dữ liệu (sau T01–T02; T07 cần D1)
| ID | Task | Ưu tiên | Phụ thuộc |
|---|---|---|---|
| T05 | CSV OHLCV importer: `POST /api/data/import` (parse + `validateCandleSeries`), repository lưu trữ theo D2, `GET /api/market/candles`, provider `CSV_HISTORICAL` trả dữ liệu thật | P0 | T01, T02, D2 |
| T06 | Mô hình kỳ hạn hợp đồng: mã tháng (F,G,H…), sinh chuỗi hợp đồng + ngày đáo hạn/FND từ quy tắc của T03, hợp đồng liên tục (back-adjust / ratio) | P1 | T03 |
| T07 | Adapter nguồn dữ liệu theo D1 (EOD) + cache + đánh dấu DELAYED/HISTORICAL đúng | P1 | T05, D1 |
| T08 | Màn hình Data Import (upload CSV, preview, báo lỗi theo dòng) | P1 | T05 |

### Wave 3 — Công cụ nghiên cứu (lõi giá trị của app)
| ID | Task | Ưu tiên | Phụ thuộc |
|---|---|---|---|
| T09 | Contract Explorer: spec, lịch đáo hạn, mapping MXV ↔ quốc tế, quy đổi tick value | P1 | T03, T06 |
| T10 | Charts (lightweight-charts): nến đa khung, chồng nhiều hợp đồng, trạng thái DATA_UNAVAILABLE | P1 | T05 |
| T11 | Engine chỉ báo xác định (SMA/EMA/RSI/MACD/ATR/Bollinger…) phía server + unit test với dữ liệu chuẩn | P1 | T05 |
| T12 | Term structure & calendar spread: đường cong kỳ hạn, contango/backwardation, roll yield | P1 | T06, T07 |
| T13 | Spread liên hàng hóa & MXV-vs-quốc tế (basis, crack/crush spread, quy đổi FX USD/VND) | P2 | T06, T07 |
| T14 | Phân tích mùa vụ (seasonality theo tháng/tuần, nhiều năm) | P2 | T05 |
| T15 | COT (CFTC Commitments of Traders — dữ liệu công khai miễn phí): import + biểu đồ vị thế | P2 | T05 |
| T16 | Biến động & tương quan: realized vol, ma trận tương quan, rolling beta | P2 | T05 |
| T17 | Backtest: không look-ahead, phí/trượt giá, roll hợp đồng, báo cáo giả định | P2 | T06, T11 |

### Wave 4 — Hoàn thiện
| ID | Task | Ưu tiên |
|---|---|---|
| T18 | Research Notebook/Journal: ghi chú nghiên cứu gắn với instrument/biểu đồ, lưu Firestore (owner-only) + rules + test emulator | P2 |
| T19 | Test Firestore rules thật bằng emulator (`@firebase/rules-unit-testing`) cho toàn bộ "Dirty Dozen" | P1 |
| T20 | AI Analyst (Gemini, server-side) ở chế độ *tóm tắt nghiên cứu* trên dữ liệu đã xác minh, không khuyến nghị lệnh | P2 (theo D3) |
| T21 | Fundamental/Macro: EIA, USDA WASDE, DXY, USD/VND — có nguồn + thời điểm công bố | P2 |
| T22 | Việt hoá giao diện (vi/en), tài liệu README, hướng dẫn deploy (Cloud Run) | P2 |
| T23 | CI (GitHub Actions): install → lint → test → build | P1 |

### Bổ sung (2026-11-17)
| ID | Task | Ưu tiên | Ghi chú |
|---|---|---|---|
| T24 | Đối chiếu chéo thông số hợp đồng với QuantConnect Lean `symbol-properties-database.csv` (Apache 2.0) + kiểm lại số CME chưa đọc trực tiếp được | P1 | Báo cáo `docs/SPEC_CROSSCHECK.md` |
| T25 | Module COT: tải báo cáo Commitments of Traders từ API công khai CFTC, lưu SQLite, API + chỉ số COT Index / net position | P1 | Nguồn chính thức, miễn phí |
| T26 | Hỗ trợ sàn SGX (FEF quặng sắt MXV liên thông SGX) | P2 | Phát hiện từ T03 |
| T27 | Lịch nghỉ lễ sàn (CME/CBOT/NYMEX/COMEX, ICE US, ICE Europe/London, SGX) có nguồn → ngày đáo hạn `holidayAdjusted: true`; bổ sung text CL LTD, CT/SB FND trong instruments.ts | P0 cho độ chính xác | Phát hiện từ T06 |

## 5. Đường găng
`T01 → T05 → (T06 song song T03) → T12/T10 → T17`. Quyết định **D1/D2** càng sớm càng tốt vì chặn T05/T07.

### Wave 5 — Cải tiến (đề xuất 2026-11-18, giao dần cho agent rảnh)
| ID | Task | Ưu tiên | Ghi chú |
|---|---|---|---|
| T32 | Bỏ nhãn tự động BULLISH/BEARISH trong đồng bộ EIA/USDA (chỉ dựa vào tăng/giảm) → mô tả trung tính | P1 | Đúng định hướng "nghiên cứu, không tín hiệu" |
| T33 | Lưu lịch sử nến từ Yahoo (UNOFFICIAL) vào SQLite để Biểu đồ/Kỹ thuật/Mùa vụ/Biến động có dữ liệu mà không cần CSV | P0 | Hiện phần lớn trang phân tích trống |
| T34 | Quy đổi giá quốc tế → VND/hợp đồng MXV trên thẻ giá (dùng tỷ giá VCB UNOFFICIAL + spec hợp đồng), ghi rõ công thức | P1 | Người mới hiểu "1 hợp đồng = bao nhiêu tiền" |
| T35 | "Hôm nay có gì": lịch sự kiện trong ngày/tuần (EIA thứ Tư, COT thứ Sáu, WASDE, phiên MXV mở/đóng) trên Tổng quan | P1 | Từ lịch có nguồn, không ước đoán |
| T36 | Đồng bộ định kỳ phía server: COT hàng tuần, macro, Yahoo warm-up; trạng thái lần đồng bộ cuối trên Data Health | P1 | |
| T37 | Việt hoá + nhãn thân thiện cho các view mới của chủ dự án (CommodityWorld, Cycle Hunter/Report, CommodityProfile) | P1 | Sau đợt merge c26263f |
| T38 | Nén ảnh hàng hoá (~40 JPG ~1 MB) sang WebP + lazy-load | P2 | Hiệu năng/mobile |
| T39 | Smoke test trình duyệt trong CI (mở các trang chính, không lỗi console, không 404 API) | P1 | Bắt lỗi kiểu "Backend sync partially failed" |
| T40 | Hướng dẫn nhập môn tương tác (tour 5 bước) + trang Thuật ngữ | P2 | Người mới |
| T41 | Cảnh báo giá/biến động (ngưỡng do người dùng đặt, chỉ thông báo, không khuyến nghị) | P2 | |
