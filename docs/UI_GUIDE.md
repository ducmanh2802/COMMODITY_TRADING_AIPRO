# Hướng dẫn UI (cho contributor và AI agent)

Quy tắc khi sửa/thêm giao diện. Ngắn gọn; chi tiết cấu trúc xem `docs/ARCHITECTURE.md`.

## 1. Một chế độ giao diện
Không có nhánh "Dễ dùng / Chuyên sâu". Mọi trang dùng cùng một giao diện: trực quan (thẻ, thanh, chip), chi tiết chuyên sâu nằm trong phần thu gọn. Có theme tối (mặc định) và sáng; phải kiểm tra cả hai.

## 2. Bảng màu dịu: chỉ dùng token
Token định nghĩa trong `src/index.css` (`:root` tối, `[data-theme=light]` sáng). Không viết mã hex, không dùng class Tailwind green/red.

| Token | Dùng cho |
|---|---|
| `--bg`, `--surface`, `--surface-2`, `--surface-3` | nền trang, thẻ, thẻ lồng, vùng nhấn nhẹ |
| `--border` | viền |
| `--text`, `--text-strong`, `--muted`, `--faint` | chữ (đậm dần: faint < muted < text < text-strong) |
| `--accent` (tím), `--on-accent`, `--accent-soft`, `--accent-text` | nút chính, chữ trên nền accent, nền/chữ nhấn |
| `--positive` (xanh dương) | tăng / tốt |
| `--negative` (cam mơ) | giảm / xấu |
| `--warning` (vàng) | cảnh báo, dữ liệu minh họa |
| `--series-1..6`, `--seq-1..5`, `--chart-*` | biểu đồ |

Không dùng xanh lá/đỏ cho tăng/giảm. Luôn đi kèm mũi tên hoặc chữ, không chỉ dựa vào màu.

## 3. Mẫu "một dòng ngắn hiện, chi tiết thu gọn"
Mặc định chỉ hiện một dòng kết luận. Giải thích dài đặt sau `<details>` ("Xem giải thích") hoặc popover (i).

```tsx
// Thu gọn: helper dùng chung
import { Fold } from '../pulse/tileBits';
<Fold summary={t('calv.explain')}>{longText}</Fold>

// Popover (i): Escape đóng, trả focus về summary
import { InfoTip } from '../today/InfoTip';
<InfoTip text={t('n2.tdv.info')} />
```

Helper dùng chung (không tự viết lại): `views/pulse/tileBits.tsx` + `tileMath.ts` (Delta, RangeBar, Fold), `views/scorecard/shared.tsx` + `scoreMath.ts` (ScoreBar, DimBadge, QualityDots), `views/radar/TopPickCard.tsx`, `common/calendarGroups.ts`, `views/world/durationMath.ts`. Logic tính toán tách ra file `*Math.ts` thuần để test bằng `node:test`.

## 4. Trung thực dữ liệu
- Mọi con số thị trường phải kèm `DataStatusBadge` (`src/components/common/DataStatusBadge.tsx`). Trạng thái UNAVAILABLE hiện "không có dữ liệu", không điền số.
- Dữ liệu minh họa/giả định phải gắn nhãn "Ví dụ minh họa" (màu `--warning`), không trình bày như giá thật.
- Fail closed: thiếu nguồn thì báo không khả dụng. Có test cho việc này; không nới lỏng.
- Không dùng ngôn từ khuyến nghị mua/bán.

## 5. Truy cập (a11y)
- Vùng bấm >= 40px (`min-h-10`), kể cả trên mobile.
- Không đặt `<button>` trong `<summary>` hoặc `<dl>` (lỗi axe/HTML). Dùng bản thân `<summary>` làm nút.
- Tên truy cập: dùng `<span className="sr-only">` chứa chữ đầy đủ thay vì `aria-label` khác với chữ đang hiển thị (WCAG label-in-name).
- Popover/dialog đóng bằng Escape và trả focus.
- `tests/e2e/a11y.spec.ts` chạy axe-core ở theme tối và sáng; phải qua trước khi merge.

## 6. i18n
- Mỗi tính năng một file dict riêng: `src/i18n/dict/<tên>.ts` xuất `{ vi, en }`.
- Đăng ký bằng 1 dòng import + 1 dòng spread trong `src/i18n/vi.ts` và `src/i18n/en.ts` (`...tên.vi`, `...tên.en`).
- Mọi chuỗi UI dùng `t('khóa')`; khóa phải có ở cả vi và en. `src/i18n/i18nParity.test.ts` kiểm tra đủ cặp.
- Bài học: `quizIntegrity.test.ts` kiểm tra tính hợp lệ của quiz.

## 7. Mobile 390px
Không được tràn ngang ở rộng 390px (dùng `min-w-0`, `break-words`, `overflow-x-auto` cục bộ cho bảng). `tests/e2e/mobile.spec.ts` kiểm tra viewport 390x844.
