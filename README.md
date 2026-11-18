# COMMODITY TRADING AI PRO

> **EN:** A research tool for Vietnamese commodity derivatives (MXV) and the linked international exchanges (CME, CBOT, NYMEX, COMEX, ICE, SGX).
> It shows data with explicit quality labels, plus charts, analysis, risk and backtest tools.
> It is for research and learning only, NOT trading signals or investment advice.

Ứng dụng nghiên cứu phái sinh hàng hóa Việt Nam trên **MXV** (Sở Giao dịch Hàng hóa Việt Nam) và các sàn quốc tế liên kết: CME, CBOT, NYMEX, COMEX, ICE, SGX. Đây là công cụ **nghiên cứu / học tập**, không phải tín hiệu giao dịch hay lời khuyên đầu tư. Giao dịch phái sinh có rủi ro mất vốn.

## Tính năng (đang có trong mã nguồn)

Các mục trong thanh bên và `src/App.tsx`:

| Mục | Mô tả |
|---|---|
| Tổng quan (`overview`) | Bảng điều khiển tổng quan |
| Học (`learn`) | Lộ trình học cho người mới |
| Thị trường (`markets`) | Bảng giá / market watch |
| Khám phá hợp đồng (`explorer`) | Chuỗi hợp đồng, hồ sơ hợp đồng, quy tắc lịch (`/api/instruments/...`) |
| Biểu đồ (`charts`) | Nến, dữ liệu đã nhập, overlay |
| Phân tích kỹ thuật, Tín hiệu, Cấu trúc kỳ hạn, COT | View và route tương ứng (`/api/technical`, `/api/signals`, `/api/cot`) |
| AI Analyst | Gọi Gemini phía server; cần `GEMINI_API_KEY` |
| Scanner, Quản lý rủi ro, Backtest, Danh mục, Nhật ký giao dịch | Công cụ phân tích (`/api/scanner`, `/api/risk`, `/api/backtest`, `/api/portfolio`, `/api/journal`) |
| Cơ bản / Tin tức (`fundamental`, `news`) | Bản ghi cơ bản (`/api/fundamental/records`) |
| Sức khỏe dữ liệu (`data-health`) | Trạng thái nguồn dữ liệu (`/api/health`, `/api/providers/health`) |
| Nhập dữ liệu (`data-import`) | Nhập CSV lịch sử vào SQLite, xem `docs/DATA_IMPORT.md` |
| Cài đặt (`settings`) | Cài đặt ứng dụng |

Đăng nhập Google bằng Firebase Auth; danh mục/nhật ký có thể lưu trên Firestore (`firestore.rules`).

## Chạy nhanh

Yêu cầu: **Node.js >= 22** (theo `engines` trong `package.json`; CI dùng Node 24). Repo không có `.nvmrc`.

```bash
npm install
cp .env.example .env     # tùy chọn (Windows: copy .env.example .env)
npm run dev              # http://localhost:3000 (Express + Vite)
npm test                 # chạy test (tsx --test)
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
| `GEMINI_API_KEY` | Cần cho AI Analyst; không có thì tính năng này báo lỗi cấu hình |
| `ADMIN_API_TOKEN` | Token cho endpoint ghi (nhập/xóa dữ liệu, đồng bộ COT/provider), gửi `Authorization: Bearer <token>`. Nếu không đặt, các endpoint này chỉ nhận request trực tiếp từ localhost. Dùng chuỗi ngẫu nhiên >= 16 ký tự |
| `MARKET_DB_PATH` | File SQLite (mặc định `data/market.db`) |
| `COT_SOURCE` | `auto` (mặc định) / `socrata` / `files` |
| `COT_CACHE_DIR` | Thư mục cache file CFTC |
| `SCHEDULER_ENABLED` | `true` (mặc định) / `false` — tự đồng bộ COT (thứ Sáu tối UTC + bù khi khởi động nếu >8 ngày), FX/WASDE/EIA/FRED; xem `GET /api/scheduler/status` |
| `CFTC_APP_TOKEN` | App token Socrata của CFTC |
| `TRUST_PROXY` | Ví dụ `1` khi chạy sau reverse proxy (rate limit đúng IP) |
| `YAHOO_ENABLED` | **Mặc định tắt.** `true` để lấy giá trễ từ Yahoo Finance: nguồn **KHÔNG chính thức (UNOFFICIAL)**, chỉ dùng cá nhân, không phân phối lại |
| `DISABLE_HMR` | `true` để tắt hot reload khi dev |
| `TWELVEDATA_API_KEY`, `FMP_API_KEY`, `COMMODITIES_API_KEY`, `ALPHAVANTAGE_API_KEY`, `EIA_API_KEY`, `USDA_API_KEY`, `MXV_API_KEY`, `MXV_API_URL`, `CME_DATAMINE_API_KEY`, `ICE_API_KEY`, `MARKET_DATA_PROVIDER_URL`, `MARKET_DATA_PROVIDER_KEY` | Khóa nguồn dữ liệu có trong `.env.example`; mức hỗ trợ thực tế xem `docs/REALTIME_DATA_SOURCES.md` |

Cấu hình Firebase nằm ở `firebase-applet-config.json` (không dùng biến môi trường).

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
