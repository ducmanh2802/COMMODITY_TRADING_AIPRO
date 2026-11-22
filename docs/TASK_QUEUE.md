# Hàng chờ task (Wave 11+) — 2026-11-21

Nguồn: backlog T96–T100 trong `AUDIT_AND_PLAN.md` và `UX_AUDIT_2026-11-21.md` (mục 8, 9).
Trạng thái: `[ ]` chờ · `[~]` đang làm · `[x]` xong.

## Quy tắc chạy

- **Điều phối (Opus, phiên chính):** chỉ chia việc, review diff, chạy build/test. Không tự viết code cơ học.
- **Haiku** (`model: haiku`): sửa nhỏ, xoá mã chết, i18n, đổi tên, CSS. Rẻ nhất.
- **Sonnet** (`model: sonnet`): logic vừa, nối state, component mới, Firestore rules.
- **Opus**: chỉ task có nhãn `opus` (đổi IA, gộp màn hình).
- Mỗi agent nhận: mã task, file cần sửa, tiêu chí xong. Không gửi cả file audit.
- Agent chạy song song dùng `isolation: worktree`; task đụng cùng file thì chạy nối tiếp.
- Xong mỗi đợt: `npm run build` + `npm test`, skill `code-reviewer` trên diff, rồi mới commit.
- Kiểm tra giao diện bằng Chrome DevTools MCP (chụp 1366 và 390px), không hỏi người dùng nhìn màn hình.
- **Tự bổ sung:** khi còn ≤ 3 task `[ ]`, lấy thêm từ mục "Dự trữ" (hoặc từ kết quả `/impeccable critique`) vào đợt tiếp theo.

## Đợt 1 — Quick wins (song song)

| # | Task | Model | Skill | File chính |
|---|---|---|---|---|
| [x] Q1 | Bỏ dòng `note` lặp dưới tab; tăng vùng chạm tab `py-2 min-h-9` | haiku | — | `DualViewTabs.tsx` |
| [x] Q2 | Xoá "Tổng quan (cũ)" khỏi menu | haiku | — | `navMap.ts`, `Sidebar.tsx` |
| [x] Q3 | Xoá mã chết `PhaseModulePlaceholder`, `views/simple/*`, chuỗi `n2.mk.pulsePending` | haiku | — | grep import trước khi xoá |
| [x] Q4 | Đổi tên tab (Hôm nay / Vĩ mô thế giới / Nổi bật / Lịch & vĩ mô) | haiku | writing-guidelines | `i18n/dict/*` |
| [x] Q5 | Gộp 5 thẻ rỗng Giá trong nước thành 1 trạng thái rỗng + nút "Nhập giá" | haiku | — | `DomesticPricesPanel.tsx` |
| [x] Q6 | Một banner/footnote "không phải khuyến nghị" chung | haiku | — | `App.tsx`/`TopBar.tsx` |
| [x] T98 | Lỗi "Object is disposed" của lightweight-charts khi đổi khung | haiku | systematic-debugging | `CandleChart.tsx` |

## Đợt 2 — Sửa logic (Sonnet)

| # | Task | Model | Skill |
|---|---|---|---|
| [x] S1 | Một selector mã duy nhất: Biểu đồ theo `useTerminal().selectedSymbol` (lỗi KC→ZC) | sonnet | test-driven-development |
| [x] S2 | `MineHub` truyền `initialTabId` để deep-link hoạt động | sonnet | — |
| [x] S3 | Component `<SourceChip>` thay các dòng nguồn dài | sonnet | vercel-composition-patterns |
| [x] S4 | "Xem thêm" cho BriefView; tin tức giới hạn 10 + nút xem thêm | sonnet | — |
| [x] S5 | TopBar mobile icon-only, hết tràn 13px; bảng thành thẻ trên mobile | sonnet | ui-ux-pro-max |
| [x] T97 | Trường `plan` trong `firestore.rules` + test emulator, bật `PERSIST_PLAN_TO_FIRESTORE` | sonnet | test-driven-development |
| [x] T96 | Chuỗi giá D1 theo từng hợp đồng tháng | sonnet | — |

## Đợt 3 — Đổi IA (Opus lập kế hoạch, Sonnet làm)

| # | Task | Model | Skill |
|---|---|---|---|
| [x] A | Thị trường 10 tab → 3 hub; trang mã 8 → 5 tab; giữ `resolveModule` cho deep-link | opus→sonnet | writing-plans, executing-plans |
| [x] B | Tách `FundamentalNewsView` thành NewsFeed / MacroPanel / CalendarPanel | sonnet | — |
| [x] C | Trang "Tóm tắt" gộp Overview + Brief + Cycle | opus→sonnet | — |
| [x] G | Một thiết kế chip trạng thái dữ liệu (bảng màu xanh-mơ) | haiku | — |

## Đợt 4 — Đánh bóng giao diện

| # | Task | Model | Skill |
|---|---|---|---|
| [ ] P1 | `/impeccable init` (tạo PRODUCT.md) + `/impeccable document` (DESIGN.md) | opus | impeccable |
| [ ] P2 | `/impeccable critique` từng hub → thêm phát hiện vào hàng chờ | sonnet | impeccable |
| [ ] P3 | `/impeccable polish` + `audit` các màn hình chính | sonnet | impeccable, web-design-guidelines |
| [ ] P4 | `npx impeccable detect src/` sạch lỗi P0/P1 | haiku | — |

## Dự trữ (tự kéo vào khi hàng chờ còn ≤ 3)

- [ ] T96b. Biểu đồ + InstrumentOverview dùng `fetchContractCandles()` khi có `contractMonth`; ẩn ROLL_MISMATCH khi có chuỗi theo hợp đồng (sonnet)
- [ ] M1. Mobile 390px: thẻ nút `rounded-xl` ở Hôm nay dư 8px bên phải (bị cắt, không gây cuộn ngang) (haiku)
- [x] M2. Nút lồng trong nút: `CommodityWorldCard` (button) chứa `CyclePhaseBadge` (button) ở tab Giá (haiku)

- [ ] E. Endpoint `/api/home` + cache client, tải trễ panel dưới màn hình (vercel-react-best-practices)
- [ ] F. Lazy-load Firestore và i18n theo ngôn ngữ; kiểm tra kích thước `index-*.js`
- [ ] T100. Bản đồ thời tiết có đường bờ biển (TopoJSON nhẹ)
- [ ] T99. Nguồn tự động giá trong nước (cần xác nhận nguồn được phép dùng)
- [ ] Đo LCP các hub bằng `debug-optimize-lcp` → thêm task tối ưu
- [ ] Rà accessibility bằng `a11y-debugging` → thêm task sửa
