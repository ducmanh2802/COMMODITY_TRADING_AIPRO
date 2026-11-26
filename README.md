# COMMODITY TRADING AI PRO

> **EN:** A research tool for Vietnamese commodity derivatives (MXV) and the linked international exchanges (CME, CBOT, NYMEX, COMEX, ICE, SGX).
> It shows data with explicit quality labels, plus charts, analysis, risk and backtest tools.
> It is for research and learning only, NOT trading signals or investment advice.

Ứng dụng nghiên cứu phái sinh hàng hóa Việt Nam trên **MXV** (Sở Giao dịch Hàng hóa Việt Nam) và các sàn quốc tế liên kết: CME, CBOT, NYMEX, COMEX, ICE, SGX. Đây là công cụ **nghiên cứu / học tập**, không phải tín hiệu giao dịch hay lời khuyên đầu tư. Giao dịch phái sinh có rủi ro mất vốn.

## Tính năng (đang có trong mã nguồn)

Các mục trong thanh bên và `src/App.tsx`:

| Mục | Mô tả |
|---|---|
| Thị trường > Hôm nay / Nhịp đập | Giao diện trực quan (thẻ, thanh, chip); giải thích dài nằm sau "Xem giải thích" hoặc popover (i). Quy tắc UI: `docs/UI_GUIDE.md` |
| Học (`learn`) | Lộ trình học cho người mới: bài học dựng bằng `learn/lesson/*` (KeyPoints, LessonBody, quiz, GlossaryTip), hình minh họa `learn/diagrams/groupA-D.tsx`, video chỉ từ nhà xuất bản uy tín (kiểm tra bằng oEmbed trước khi thêm; YouTube chỉ tải sau khi bấm); Lộ trình 3 tháng (`src/shared/program/threeMonth.ts`, 12 tuần) |
| Thị trường (`markets`) | Bảng giá / market watch |
| Khám phá hợp đồng (`explorer`) | Chuỗi hợp đồng, hồ sơ hợp đồng, quy tắc lịch (`/api/instruments/...`) |
| Biểu đồ (`charts`) | Nến, dữ liệu đã nhập, overlay |
| Phân tích kỹ thuật, Tín hiệu, Cấu trúc kỳ hạn, COT | View và route tương ứng (`/api/technical`, `/api/signals`, `/api/cot`) |
| AI Analyst | Gọi Gemini phía server; cần `GEMINI_API_KEY` |
| Scanner, Quản lý rủi ro, Backtest, Danh mục, Nhật ký giao dịch | Công cụ phân tích (`/api/scanner`, `/api/risk`, `/api/backtest`, `/api/portfolio`, `/api/journal`) |
| Cơ bản / Tin tức (`fundamental`, `news`) | Bản ghi cơ bản (`/api/fundamental/records`) |
| Sức khỏe dữ liệu (`data-health`) | Trạng thái nguồn dữ liệu (`/api/health`, `/api/providers/health`) |
| Nhập dữ liệu (`data-import`) | Nhập CSV lịch sử vào SQLite, xem `docs/DATA_IMPORT.md` |
| Giao dịch giả lập (paper trading, `views/papertrade/`) | Kỷ luật: khóa nghỉ 24h sau 3 lệnh lỗ liên tiếp hoặc lỗ ngày <= -3% vốn (`coolOff.ts`; vẫn được đóng lệnh); thẻ lỗi + thống kê lỗi theo tháng (`mistakeStats.ts`); banner rủi ro sự kiện 24h tới (`src/shared/events/eventRisk.ts`, lịch FOMC/CPI trong `usMacroCalendar.ts`, EIA/USDA/WASDE); review tuần (`weeklyReview.ts`, tóm tắt AI tùy chọn qua `POST /api/paper/weekly-review`, lỗi AI thì giữ nội dung công thức) |
| Định tuyến URL | Mỗi hub có đường dẫn riêng (slug trong `src/shared/utils/routes.ts`: `MODULE_SLUGS`, `pathForModule`, `moduleForPath`); nút Back/Forward của trình duyệt hoạt động và `document.title` đổi theo hub |
| Hôm nay > "Học tiếp" | Thẻ gợi ý bài học kế tiếp (`today/ContinueLearningCard.tsx`, logic `continueMath.ts`) |
| Giao dịch giả lập > Thẻ khối lượng theo rủi ro | `papertrade/riskSizing.ts` + `RiskSizingCard.tsx` |
| Backtest: quy tắc xu hướng | Thêm `TSMOM_12M` (động lượng 12 tháng) và `DONCHIAN_BREAKOUT` (`server/engines/trendRules.ts`, đăng ký trong `strategyEngine.ts`; số nến cần thiết qua `strategyLookbackBars`) |
| Cấu trúc kỳ hạn > Carry / roll yield | `termstructure/CarryCard.tsx` + `src/shared/utils/rollYield.ts` |
| Phân tích > Chênh lệch (Spreads) > Crush | `analysis/CrushCard.tsx` + `src/shared/analytics/crush.ts` (board crush, z-score, mùa vụ) |
| Phân tích > Mùa vụ > Cửa sổ mùa vụ | `analysis/SeasonalWindowCard.tsx` + `src/shared/analytics/seasonalWindow.ts` (quét cửa sổ, kiểm định nhị thức) |
| COT > Vị thế | `cot/CotPositioningCard.tsx` + `src/shared/cot/positioning.ts` (phân vị 156 tuần) |
| Học > Mô phỏng margin call | `learn/sim/marginCall.ts` + `MarginCallSim.tsx`, máy tính id `margin-sim` trong `Calculators.tsx` |
| Cài đặt (`settings`) | Cài đặt ứng dụng |

Bảo mật: header CSP có `frame-ancestors 'self'`, rate limit toàn `/api` và giới hạn riêng cho endpoint AI (429 `RATE_LIMIT_EXCEEDED`). Test trung thực dữ liệu kiểm tra fail-closed; `quizIntegrity` và `i18nParity` chạy trong `npm test`.

Đăng nhập Google bằng Firebase Auth; danh mục/nhật ký có thể lưu trên Firestore (`firestore.rules`). Khách (chưa đăng nhập) không bao giờ tải Firestore SDK: mã chỉ nạp qua `getFirestoreModules()` (lazy, `src/firebase.ts`). Lỗi form có hỗ trợ truy cập (aria-invalid/aria-describedby từng trường) qua `src/components/common/fieldErrors.ts`. Lịch nghỉ lễ có Tết 2027 (MXV đóng cửa dự kiến, số liệu dự phóng, không phải thông báo chính thức).

## Chạy nhanh

Yêu cầu: **Node.js >= 22** (theo `engines` trong `package.json`; CI dùng Node 24). Repo không có `.nvmrc`.

```bash
npm install
cp .env.example .env     # tùy chọn (Windows: copy .env.example .env)
npm run dev              # http://localhost:3000 (Express + Vite)
npm test                 # chạy test (tsx --test)
npm run test:rules       # test firestore.rules bằng emulator (cần Java)
npm run test:e2e         # Playwright: tests/e2e (smoke, learning, program, keyboard, features13b, discipline, routing, today, margin-sim, analysis-tools, cot-positioning, mobile 390px, a11y axe-core tối+sáng; spec chỉ được seed DB tạm `MARKET_DB_PATH` trong thư mục tmp hoặc dùng `page.route` mock, không bao giờ dùng `data/market.db`); tự build + chạy server cổng 3199 (đổi bằng biến môi trường `E2E_PORT`, vd `E2E_PORT=3299`, để chạy song song), lần đầu vài phút
npm run typecheck        # kiểm tra kiểu TypeScript
npm run build            # build frontend ra dist/
npm start                # chạy production (build trước), cổng PORT hoặc 3000
```

## Biến môi trường

Tất cả đều **tùy chọn**. Không bao giờ commit file `.env`. Danh sách có chú thích đầy đủ: `.env.example`.

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng server (mặc định 3000) |
| `HOST` | Địa chỉ bind (mặc định dual-stack IPv4+IPv6) |
| `GEMINI_API_KEY` | Cần cho AI Analyst; không có thì tính năng này báo lỗi cấu hình (trừ khi có `OPENROUTER_API_KEY`) |
| `GEMINI_MODEL` | Tùy chọn: một model hoặc danh sách ngăn cách bằng dấu phẩy. Mặc định chỉ dùng model miễn phí (`server/lib/geminiModels.ts`), tự thử model kế tiếp khi gặp 503/429/404 |
| `OPENROUTER_API_KEY` | Tùy chọn: fallback cuối cùng bằng model OpenRouter `:free` (và là nhà cung cấp duy nhất nếu thiếu `GEMINI_API_KEY`) |
| `OPENROUTER_MODEL` | Tùy chọn: danh sách id model OpenRouter; mặc định lấy danh sách model `:free` hiện có |
| `ADMIN_API_TOKEN` | Token cho endpoint ghi (nhập/xóa dữ liệu, đồng bộ COT/provider), gửi `Authorization: Bearer <token>`. Nếu không đặt, các endpoint này chỉ nhận request trực tiếp từ localhost. Dùng chuỗi ngẫu nhiên >= 16 ký tự |
| `MARKET_DB_PATH` | File SQLite (mặc định `data/market.db`) |
| `COT_SOURCE` | `auto` (mặc định) / `socrata` / `files` |
| `COT_CACHE_DIR` | Thư mục cache file CFTC |
| `SCHEDULER_ENABLED` | `true` (mặc định) / `false` — tự đồng bộ COT (thứ Sáu tối UTC + bù khi khởi động nếu >8 ngày), FX/WASDE/EIA/FRED; xem `GET /api/scheduler/status` |
| `CFTC_APP_TOKEN` | App token Socrata của CFTC |
| `TRUST_PROXY` | Ví dụ `1` khi chạy sau reverse proxy (rate limit đúng IP) |
| `YAHOO_ENABLED` | **Mặc định tắt.** `true` để lấy giá trễ từ Yahoo Finance: nguồn **KHÔNG chính thức (UNOFFICIAL)**, chỉ dùng cá nhân, không phân phối lại |
| `DISABLE_HMR` | `true` để tắt hot reload khi dev |
| `TWELVEDATA_API_KEY`, `FMP_API_KEY`, `COMMODITIES_API_KEY`, `ALPHAVANTAGE_API_KEY`, `EIA_API_KEY`, `FAS_API_KEY`, `USDA_API_KEY`, `MXV_API_KEY`, `MXV_API_URL`, `CME_DATAMINE_API_KEY`, `ICE_API_KEY`, `MARKET_DATA_PROVIDER_URL`, `MARKET_DATA_PROVIDER_KEY` | Khóa nguồn dữ liệu có trong `.env.example`; mức hỗ trợ thực tế xem `docs/REALTIME_DATA_SOURCES.md` |
| `AI_PROVIDER` | Engine nhận định bảng đánh giá: `rules` (mặc định, miễn phí, offline, theo công thức) / `gemini` / `ollama`; lỗi AI thì tự quay về `rules` |
| `OLLAMA_URL` | Địa chỉ Ollama khi `AI_PROVIDER=ollama` (mặc định `http://localhost:11434`) |
| `OLLAMA_MODEL` | Tên model Ollama (mặc định `llama3.2`) |

Cấu hình Firebase nằm ở `firebase-applet-config.json` (không dùng biến môi trường).

## Triển khai luật Firestore

Database Firestore là database có tên (xem `firebase.json`), nên phải dùng:

```bash
npx firebase deploy --only firestore
```

KHÔNG dùng `--only firestore:rules` (không nhắm đúng database có tên). Chi tiết Cloud Run: `docs/DEPLOY.md`.

## Nhãn chất lượng dữ liệu

Mỗi số liệu nên đi kèm nhãn nguồn/độ tươi để không nhầm dữ liệu cũ thành dữ liệu hiện tại:

- **CURRENT**: dữ liệu hiện tại từ nguồn được cấp phép/chính thức.
- **DELAYED**: dữ liệu trễ (ví dụ 10-30 phút).
- **HISTORICAL**: dữ liệu lịch sử (nến đã đóng, dữ liệu bạn nhập).
- **STALE**: dữ liệu quá cũ so với kỳ vọng.
- **UNAVAILABLE**: không có dữ liệu; ứng dụng không bịa số.
- **INVALID**: dữ liệu không qua được kiểm tra hợp lệ (ví dụ nến sai OHLC); bị loại, không hiển thị như giá thật.

Ngoài trạng thái trên, mỗi nguồn còn có nhãn chất lượng nguồn: **OFFICIAL** (sàn/cơ quan chính thức), **LICENSED_VENDOR** (nhà cung cấp có bản quyền), **UNOFFICIAL** (nguồn không chính thức, ví dụ Yahoo; chỉ tham khảo cá nhân).

## Tài liệu

- `docs/AUDIT_AND_PLAN.md`: đánh giá và kế hoạch
- `docs/DATA_IMPORT.md`: nhập dữ liệu CSV
- `docs/REALTIME_DATA_SOURCES.md`: nguồn dữ liệu
- `docs/VN_DERIVATIVES_MARKET.md`: thị trường phái sinh Việt Nam
- `docs/LEARNING_PATH.md`: lộ trình học
- `docs/SPEC_CROSSCHECK.md`: đối chiếu đặc tả
- `docs/DEPLOY.md`: triển khai Google Cloud Run
- `docs/UI_GUIDE.md`: quy tắc giao diện (màu, a11y, i18n, mobile)
