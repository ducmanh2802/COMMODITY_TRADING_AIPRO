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

### Wave 6 — Đẹp hơn, giá nhanh hơn, AI đánh giá (2026-11-20)
| ID | Task | Agent | Phạm vi file |
|---|---|---|---|
| T42 | Giá nhanh & chính xác hơn: Yahoo batch `v8/finance/spark` (1 request cho mọi mã thay vì 1 mã/giây), TTL ~15 s, client tự làm mới 15–30 s (dừng khi tab ẩn), hiện "cập nhật X giây trước", đối chiếu chéo spark ↔ chart; hoàn tất T33 (lưu lịch sử 10 năm vào SQLite, tăng dần) | Dữ liệu | yahooAdapter, registry, services/yahooHistory, engineCandles, TerminalContext (phần polling) |
| T43 | Giao diện hiện đại: design tokens (màu, bo góc, khoảng cách, font Inter), Sidebar/TopBar gọn, thẻ giá có sparkline, trạng thái rõ, responsive 390px; áp vào Tổng quan, Thị trường, Hồ sơ hàng hoá | Giao diện | index.css/tailwind, layout/*, common/*, OverviewDashboard, MarketWatchView, CommodityWorld/Profile (chỉ style) |
| T44 | AI đánh giá các mã: bảng điểm nghiên cứu cho mọi mã (xu hướng, động lượng, biến động, COT, mùa vụ, chất lượng dữ liệu) bằng công thức xác định + tóm tắt Gemini (nếu có khoá); xếp hạng, giải thích bằng lời; KHÔNG khuyến nghị mua/bán; nối trang "Phân tích chi tiết" (brief) vào menu | AI | server/services/scorecard/*, routes mới, views/scorecard/*, brief/* , 1 mục Sidebar |

### Wave 7 — Phát triển dần (2026-11-20). Giao TUẦN TỰ, mỗi lần 1 agent
| Thứ tự | ID | Task | Tiêu chí xong |
|---|---|---|---|
| 1 | T45 | `docs/ARCHITECTURE.md`: sơ đồ tầng (UI → API → services/engines → providers → storage), luồng dữ liệu giá, nhãn chất lượng, module map 4 mục menu, quy ước thêm nguồn/trang/task | Tài liệu khớp code, có sơ đồ |
| 2 | T46 | Tăng tốc "Hôm nay nên chú ý gì" & scorecard: tính trước/caching nền, endpoint gộp, skeleton | Panel có dữ liệu < 2 s khi cache ấm |
| 3 | T47 | Giá từng tháng đáo hạn (kiểm chứng mã Yahoo theo tháng hoặc CSV) → Cấu trúc kỳ hạn & chi phí chuyển kỳ có dữ liệu thật | Ít nhất ZC, CL, GC có đường cong kỳ hạn |
| 4 | T48 | Cảnh báo giá (hoàn tất T41) trong "Của tôi" | Tạo/sửa/xoá, kích hoạt đúng, rules + test |
| 5 | T49 | Tỷ giá bổ sung (ECB/FRED) + hợp đồng mở theo tuần từ COT | Hiển thị có nguồn |
| 6 | T50 | Giá nội địa Việt Nam từ nguồn công khai hợp lệ (cà phê, cao su, tiêu…) + basis nội địa vs quốc tế | Có nguồn, điều khoản cho phép |
| 7 | T51 | Smoke test trình duyệt trong CI (hoàn tất T39) | CI chạy xanh |
| 8 | T52 | Học viện: rà các mục "cần kiểm tra", tour nhập môn 5 bước | Danh sách đã kiểm/còn thiếu |
| 9 | T53 | Deploy thử Cloud Run + lưu trữ bền (SQLite → Cloud SQL/Firestore hoặc GCS) | URL chạy được |
| 10 | T54 | Chuẩn bị kiếm tiền: tài khoản, gói dịch vụ, giới hạn tính năng (chưa thanh toán) | Thiết kế + khung code |

**Chèn ưu tiên sau T46 (yêu cầu 2026-11-20):**
| Thứ tự | ID | Task | Tiêu chí xong |
|---|---|---|---|
| 2b | T55 | Trực quan hoá: thay khối chữ bằng biểu đồ/hình (sparkline, heatmap nhóm hàng, gauge biến động, đồng hồ chu kỳ, thanh vị trí giá 52 tuần, biểu đồ COT), chữ chỉ 1 dòng tóm tắt + "xem thêm" | Tổng quan, Phân tích mã, Tài chính thế giới chủ yếu là hình |
| 2c | T56 | "Vì sao biến động": phân rã chuyển động (đi cùng nhóm/USD/lợi suất hay riêng lẻ; trùng ngày báo cáo EIA/WASDE/COT) + "Tương lai gần": vùng dao động thống kê 1 tuần/1 tháng từ biến động lịch sử (nón xác suất), xu hướng mùa vụ, sự kiện sắp tới — kịch bản, không dự báo chắc chắn | Mỗi mã có biểu đồ nguyên nhân + nón dao động + lịch sự kiện |

**Hướng thiết kế chính (2026-11-20): "Ông nông dân 50 tuổi cũng hiểu và dùng được".** Thứ tự mới sau T46:
| Thứ tự | ID | Task | Tiêu chí xong |
|---|---|---|---|
| 2b | T57 (gộp T55) | **Chế độ Dễ dùng** (mặc định): chữ to, ít số, màu đèn giao thông, biểu tượng + hình ảnh hàng hoá, đơn vị quen thuộc (đ/kg, đ/tấn, triệu đồng/hợp đồng), mỗi màn hình 1 câu hỏi ("Giá cà phê hôm nay thế nào?"), nút to; "Chế độ Chuyên sâu" giữ giao diện hiện tại; trực quan hoá T55 (heatmap, gauge, vòng chu kỳ, thanh 52 tuần) | Người mới đọc được trạng thái 1 mã trong 10 giây; kiểm thử 390px |
| 2c | T56 | Vì sao biến động + tương lai gần (kịch bản, nón dao động) + **mùa vụ: tỷ lệ năm đúng & độ lệch** | Mỗi mã có hình nguyên nhân + nón + lịch sự kiện |
| 2d | T58 | **Giao dịch thử** (tiền ảo): đặt mua/bán theo giá trễ, ký quỹ, lãi/lỗ quy ra VND, cắt lỗ tự động, lịch sử lệnh, bảng thành tích — không kết nối sàn thật | Mở/đóng vị thế, tính đúng lãi lỗ, lưu Firestore owner-only |
| 2e | T59 | **Phòng hộ cho nông dân/doanh nghiệp**: trình hướng dẫn "giữ giá bán trước" (cà phê, cao su, tiêu, ngô) — nhập sản lượng (tấn) & giá mong muốn (đ/kg) → số hợp đồng, ký quỹ, kịch bản giá lên/xuống, so sánh có/không phòng hộ | Ví dụ số đúng, giải thích bằng lời đơn giản |
| 2f | T60 | Tồn kho/tiêu thụ (WASDE stocks-to-use) & giá so với chi phí sản xuất (nguồn công khai) | Hiển thị có nguồn |
| 2g | T61 | Hướng dẫn mở tài khoản thật qua thành viên MXV (danh sách lấy từ mxv.com.vn, cảnh báo sàn ma), trợ giúp bằng giọng nói đọc to (Web Speech API) cho tóm tắt | Có nguồn, đọc được tiếng Việt |
| 2d+ | T62 | **Từ ngữ dân đầu tư hay dùng** (kèm giải thích dễ hiểu + ví dụ): đu đỉnh, bắt đáy, gồng lỗ, gồng lãi, cắt lỗ, chốt lời, cháy tài khoản, call margin/bị gọi ký quỹ, full margin, đòn bẩy, FOMO, hold, lướt sóng, sideway, breakout, thủng hỗ trợ, kháng cự, phe bò/phe gấu, long/short, đảo chiều, tích luỹ, phân phối, roll/chuyển kỳ, contango, backwardation, basis… — thêm vào Thuật ngữ của Học viện (tab "Từ lóng"), hiện tooltip khi gặp trong app & trong Giao dịch thử | ≥ 60 từ, mỗi từ có ví dụ đời thường |

Ghi chú phạm vi: app **chỉ mô phỏng giao dịch** cho mục đích học tập; không kết nối sàn/môi giới thật.
| sau T58 | T63 | **Cuộc đua giao dịch thử** theo mùa (tháng): đăng ký bằng Google, cùng vốn ảo, xếp hạng theo % lãi **và** điểm kỷ luật (cắt lỗ, rủi ro ≤2%/lệnh, sụt vốn tối đa), tên hiển thị ẩn danh tuỳ chọn, chống gian lận (chỉ khớp giá server, không sửa lệnh quá khứ), huy hiệu | Bảng xếp hạng chạy, rules Firestore + test |

### Wave 8 — Bổ sung (2026-11-21)
| ID | Task | Vì sao |
|---|---|---|
| T66 | Cài app lên điện thoại (PWA): biểu tượng màn hình chính, chạy khi mạng yếu, xem lại dữ liệu đã tải | Người dùng nông thôn hay dùng điện thoại |
| T67 | Gửi thông báo Radar/Cảnh báo giá qua Telegram (bot miễn phí) và email | Không cần mở app vẫn biết |
| T68 | Kiểm thử chiến lược có cấu hình tuỳ chỉnh + mẫu sẵn (xu hướng, lướt sóng, mùa vụ), mở thẳng từ bài học | Bài Cấp 7 cần |
| T69 | So sánh 2 mã / chênh lệch giá (ngô–lúa mì, dầu đậu–dầu cọ, Brent–WTI) bằng biểu đồ | Học về spread |
| T70 | Bài kiểm tra cuối mỗi cấp + chứng nhận hoàn thành (PDF) | Phục vụ hướng kinh doanh giáo dục |
| T71 | Nhật ký kỷ luật trong Giao dịch thử: ghi lý do vào lệnh, cảm xúc, có theo kế hoạch không → nhận xét tự động hằng tuần | Sửa thói quen xấu trước khi dùng tiền thật |
| T72 | Cài đặt cỡ chữ (to/rất to), giao diện sáng/tối, độ tương phản cao | Người lớn tuổi dễ đọc |
| T73 | Xuất/nhập dữ liệu cá nhân (lệnh thử, ghi chú) ra CSV/Excel; sao lưu | Giữ dữ liệu của mình |
| T74 | Theo dõi lỗi & hiệu năng khi chạy thật (log có cấu trúc, trang trạng thái hệ thống) | Chuẩn bị deploy |
| T75 | Hình minh hoạ & sơ đồ trong bài học (cách đọc nến, ký quỹ, phòng hộ) | Dễ hiểu hơn chữ |

### Wave 9 — Bổ sung (2026-11-21, sau khi soát 10 cấp học)
| ID | Task | Vì sao / Tiêu chí xong |
|---|---|---|
| T76 | Biểu đồ tham chiếu (benchmark FRED/IMF hằng tháng, Brent DCOILBRENTEU hằng ngày) cho 6 mã chưa có lịch sử futures: RC, CT, CME:TIO, SGX:FEF, ICE:BRN, MXV:JRU — ghi rõ "giá tham chiếu, không phải giá hợp đồng" | Phần Phân tích không còn ô trống; nhãn nguồn rõ |
| T77 | Trang chi tiết mã theo mockup Claude Design (Instrument.dc.html): giá lớn, biểu đồ, thẻ tóm tắt "vì sao tăng/giảm", chi tiết chuyên sâu thu gọn | Hoàn tất T65 cho trang quan trọng nhất |
| T78 | Ôn tập ngắt quãng: câu đố sai được hỏi lại sau 1/3/7 ngày; thẻ "Ôn hôm nay" ở trang Hôm nay | Nhớ lâu, 276 câu đố được tận dụng |
| T79 | Mô phỏng "chơi lại quá khứ" (bar replay): ẩn phần giá tương lai, người học vào lệnh từng nến với dữ liệu D1 thật 10 năm, chấm điểm kỷ luật | Luyện Cấp 5/8 không cần chờ thị trường |
| T80 | Máy tính lệnh tổng hợp (Cấp 10): nhập vốn VND, % rủi ro, giá vào/cắt lỗ/mục tiêu → số hợp đồng, lãi/lỗ VND, tỷ lệ R, ký quỹ ước tính; mở được từ Giao dịch thử | Gom các phép tính rời rạc thành một công cụ |
| T81 | Lịch kinh tế tiếng Việt: WASDE, EIA, COT, Fed, PMI Trung Quốc — giờ Việt Nam tự đổi theo mùa hè/đông Mỹ, mức ảnh hưởng tới từng mã | Bài Cấp 2/3 cần; tránh vào lệnh trước báo cáo |
| T82 | Kiểm thử nội dung học tự động: test xác nhận mọi thông số trong bài (tick, khối lượng hợp đồng) khớp instruments.ts, mỗi bài ≥3 câu đố, đáp án hợp lệ, không trùng id | Chống sai số liệu khi sửa bài |
| T83 | Hoàn thiện đồng bộ giao diện sáng/tối: rà các màn còn màu cứng, kiểm tra tương phản WCAG AA cả 2 nền, ảnh chụp e2e cho cả 2 chế độ | Phần còn lại của T72/T65 |
| T84 | Hướng dẫn lần đầu cho phần Học: chọn mục tiêu (hiểu thị trường / phòng hộ / lướt sóng) → đề xuất lộ trình cấp phù hợp | Người mới không bị ngợp 10 cấp |
| T85 | Firestore emulator test cho rules (paperTrades, tiến độ học, bảng xếp hạng T63) chạy trong CI | Điều kiện trước khi làm T63 |

### Wave 10 — So sánh với app giao dịch phổ biến (2026-11-21)
Đối chiếu TradingView, Investing.com, Barchart, CME QuikStrike, app môi giới MXV. App đã có: biểu đồ nến + chỉ báo, COT, cấu trúc kỳ hạn, spread, mùa vụ, heatmap, tin tức, lịch báo cáo, giao dịch thử, backtest, nhật ký, máy tính lệnh, học viện, thị trường quốc tế, danh sách theo dõi (đang làm). Còn thiếu:
| ID | Task | Có ở app nào / vì sao |
|---|---|---|
| T86 | Vẽ trên biểu đồ: đường xu hướng, vùng hỗ trợ/kháng cự, Fibonacci, ghi chú — lưu theo mã | TradingView; cần cho Price Action (Cấp 5) |
| T87 | Giá nội địa Việt Nam (cà phê nhân Đắk Lắk, tiêu, cao su, ngô/khô đậu cảng) cạnh giá quốc tế + chênh lệch (basis), nguồn công khai có ghi rõ | App môi giới/giacaphe; người trồng & doanh nghiệp VN cần nhất |
| T88 | Đồng bộ giá hiện tại và biểu đồ về cùng một hợp đồng tháng (sửa lệch do chuyển kỳ), hiển thị tháng hợp đồng đang xem | Barchart; tránh hiểu sai giá |
| T89 | So sánh % hiệu suất nhiều mã trên một biểu đồ + bố cục nhiều biểu đồ (2×2) | TradingView/Investing |
| T90 | Bản đồ thời tiết vùng trồng (Brazil, Tây Nguyên, vành đai ngô Mỹ, Tây Phi): mưa/nhiệt bất thường 14 ngày (Open-Meteo miễn phí) | Barchart/agri apps; thời tiết là động lực giá nông sản số 1 |
| T91 | Tin tức gắn mã: lọc theo mã, tóm tắt tiếng Việt, nhãn mức ảnh hưởng, hiện trên trang chi tiết mã | Investing.com |
| T92 | Lịch đáo hạn FND/LTD từng hợp đồng + nhắc chuyển kỳ cho vị thế Giao dịch thử | CME/app môi giới |
| T93 | Thống kê hiệu suất Giao dịch thử: đường vốn, sụt giảm tối đa, tỉ lệ thắng, kỳ vọng (R trung bình), theo mã/theo setup | Myfxbook/Tradervue |
| T94 | Tự nhận diện mẫu nến (búa, nhấn chìm, pin bar) và vùng hỗ trợ/kháng cự tự động trên biểu đồ, có giải thích | TradingView scripts; nối với bài Cấp 5 |
| T95 | Khối lượng & OI theo từng tháng hợp đồng (bảng chuỗi kỳ hạn) + volume profile | CME QuikStrike/Barchart |
