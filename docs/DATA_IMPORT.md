# Nhập dữ liệu lịch sử OHLCV (CSV)

CSV là nguồn dữ liệu chuẩn của app. Dữ liệu lưu trong SQLite (`node:sqlite` có sẵn trong Node 24), file mặc định `data/market.db` — đổi bằng biến môi trường `MARKET_DB_PATH`. Nguyên tắc: **không bịa số, không tự sửa dữ liệu**. Dòng sai → báo lỗi kèm số dòng, cả file bị từ chối; dữ liệu đáng ngờ → cảnh báo, giữ nguyên.

## 1. Định dạng CSV được chấp nhận

- Dấu phân cách: `,` hoặc `;` (tự nhận diện, hoặc khai báo `delimiter`). Hỗ trợ ô có ngoặc kép `"..."`, `""` bên trong, xuống dòng trong ô, BOM UTF-8, CRLF/LF.
- Dòng tiêu đề (không phân biệt hoa thường, có thể có tối đa vài dòng chú thích phía trên — sẽ được cảnh báo `PREAMBLE_SKIPPED`):

| Trường | Tên cột chấp nhận |
|---|---|
| Ngày (bắt buộc) | `Date`, `Trade Date`, `Datetime`, `Timestamp`; hoặc `Time` nếu không có cột ngày (kiểu Barchart) |
| Giờ | `Time` (khi đã có cột ngày) |
| Open/High/Low (bắt buộc) | `Open`, `High`, `Low` |
| Close (bắt buộc) | `Close`, `Last`, `Settle`, `Settlement` |
| Volume | `Volume`, `Vol` |
| Open interest | `Open Interest`, `OI`, `Open Int` |

  Hai cột cùng ánh xạ một trường (vd. `Close` và `Settle`) → lỗi, phải bỏ bớt một cột. Cột khác bị bỏ qua (cảnh báo `IGNORED_COLUMNS`). Dòng cuối chỉ có một ô chữ (vd. "Downloaded from Barchart…") bị bỏ qua kèm cảnh báo `FOOTER_SKIPPED`.
- Số: mặc định dấu thập phân `.`, **không** có dấu phân cách hàng nghìn. Giá trị có `,` (vd. `1,234.50`) → lỗi trừ khi khai báo `decimalSeparator`. File dùng `;` mà số có `.`/`,` → bắt buộc khai báo `decimalSeparator` (`"."` hoặc `","`), vì `1.234` có thể là 1,234 hoặc 1234.
- Giá ≤ 0 hoặc volume/OI âm → lỗi (schema dùng chung yêu cầu giá dương; vì vậy chuỗi có giá âm như WTI 04/2020 hiện **không** nhập được).

## 2. Ngày và múi giờ

- Định dạng ngày: `ISO` / `YYYY-MM-DD` (cũng nhận `YYYYMMDD`), `MM/DD/YYYY`, `DD/MM/YYYY` (dấu `/`, `-`, `.`).
- Nếu không khai báo `dateFormat`, hệ thống chỉ tự nhận diện khi **không mơ hồ**. Nếu mọi giá trị ngày/tháng đều ≤ 12 (vd. `01/02/2025`) → từ chối, yêu cầu khai báo `dateFormat`.
- `timezone` (IANA, vd. `America/Chicago`, `America/New_York`, `Europe/London`, `Asia/Ho_Chi_Minh`) là **bắt buộc**.
- **Quy ước lưu trữ:**
  - Nến ngày/tuần (`D1`, `W1`): lưu **ngày phiên giao dịch như ghi trong file**, tại `00:00:00Z`. Giờ trong ô ngày bị bỏ qua (cảnh báo `TIME_ON_DAILY_BAR`). `timezone` chỉ được ghi lại làm giả định.
  - Nến trong ngày (`M1…H4`): giờ địa phương theo `timezone` → đổi sang UTC. Nếu giá trị có offset (`Z`, `-05:00`) thì dùng offset đó. Giờ không tồn tại / bị trùng do DST → lỗi (không đoán). Timestamp được coi là **giờ mở nến**; nếu nguồn ghi giờ đóng nến thì hệ thống không tự đổi.
- Dòng không theo thứ tự thời gian → lỗi; truyền `sort: true` để sắp xếp (có cảnh báo `ROWS_SORTED`). Trùng timestamp → lỗi.

## 3. Cảnh báo dữ liệu đáng ngờ (không tự sửa)

`PRICE_JUMP` (Close đổi > `jumpThresholdPct`, mặc định 10% — có thể là roll, limit move hoặc sai đơn vị), `SESSION_GAP` (D1: thiếu > `gapThresholdSessions` phiên ngày thường, mặc định 3), `WEEKEND_DATE`, `UNALIGNED_TIMESTAMP`, `PRICE_UNIT_DIFFERS`, `CONTRACT_CODE_PREFIX`, `DUPLICATE_FILE`, `VOLUME_OI_DIFFERS`, `CONFLICTS_SKIPPED`, `SERIES_REPLACED`.

## 4. Chuỗi dữ liệu, chất lượng nguồn, đơn vị giá

- Một chuỗi = (`instrumentId`, `contractCode`, `timeframe`). `instrumentId` là id hoặc mã trong Instrument Master (`CBOT:ZC` hoặc `ZC`). `contractCode` là hợp đồng cụ thể (`ZCH25`, `CLZ26`) hoặc `CONTINUOUS`.
- `CONTINUOUS` **bắt buộc** khai báo `continuousAdjustment`: `UNADJUSTED` | `BACK_ADJUSTED` | `RATIO_ADJUSTED` (hợp đồng cụ thể = `NONE`).
- `sourceQuality`: `OFFICIAL` (sàn), `LICENSED_VENDOR` (nhà cung cấp có giấy phép), `UNOFFICIAL` (nguồn miễn phí/không chính thức), `USER_PROVIDED` (tự nhập/không rõ). `sourceLabel` là mô tả tự do (vd. "Barchart export").
- `priceUnit`: mặc định = `quotationUnit` của Instrument Master. Có thể khai báo khác (vd. `USD/bushel`) — được lưu nguyên, **không quy đổi giá**, có cảnh báo. Không thể ghép dữ liệu khác đơn vị/khác kiểu điều chỉnh vào cùng chuỗi (trừ `mode=replace`).
- Mỗi lần nhập tạo một *dataset* lưu: nguồn, chất lượng, thời điểm nhập, số dòng, timestamp đầu/cuối, múi giờ, định dạng ngày, đơn vị giá, sha256 của file CSV.

## 5. Chế độ nhập lại (`mode`)

| mode | Hành vi |
|---|---|
| `reject_conflicts` (mặc định) | Dòng trùng hoàn toàn → bỏ qua; dòng mới → thêm; nếu có dòng trùng thời điểm nhưng OHLC khác → **từ chối cả file** (HTTP 409) và liệt kê xung đột |
| `append` | Chỉ thêm thời điểm mới, không bao giờ ghi đè (xung đột → cảnh báo) |
| `replace` | Xóa toàn bộ nến + dataset cũ của chuỗi, ghi file mới |

`dryRun: true` → chỉ phân tích, kiểm tra, báo kế hoạch ghi; **không ghi gì**.

**Giá ≤ 0** (vd. WTI CLK20 ngày 2020-04-20, chuỗi back-adjusted): mặc định bị từ chối (422). Gửi `allowNonPositivePrices: true` để chấp nhận; `CONTINUOUS` + `BACK_ADJUSTED` tự bật cờ này. Khi được chấp nhận, kết quả có cảnh báo `NON_POSITIVE_PRICE` (liệt kê các dòng) — log return, biến động và tương quan không xác định qua các nến đó; `PRICE_JUMP` không tính từ giá trước ≤ 0. Quan hệ OHLC sai và volume âm vẫn bị từ chối.

## 6. API

- `POST /api/data/import` (body JSON tối đa ~10 MB): `{instrumentId, contractCode, timeframe, csv, timezone, sourceLabel, sourceQuality, dateFormat?, decimalSeparator?, delimiter?, priceUnit?, continuousAdjustment?, mode?, sort?, dryRun?, gapThresholdSessions?, jumpThresholdPct?}`. Mã trả về: 201 đã nhập, 200 dry-run/không thay đổi, 400 body sai, 404 không có instrument, 409 xung đột, 422 dữ liệu lỗi.
- `GET /api/data/datasets?instrumentId=` — danh sách dataset.
- `DELETE /api/data/datasets/:id` — xóa dataset và các nến nó sở hữu.
- `GET /api/market/candles?instrumentId=&contractCode=&timeframe=&from=&to=&limit=` — trả `status: HISTORICAL` + nến + `provenance`, hoặc `UNAVAILABLE` + lý do. Vượt `limit` (mặc định 5000, tối đa 20000) → trả các nến **mới nhất**, `truncated: true`.
- Dữ liệu lịch sử **không** phải giá trực tuyến: `/api/market/quotes` vẫn trả `UNAVAILABLE`. Provider `CSV_HISTORICAL` báo `CONNECTED / HISTORICAL` khi đã có dataset; trạng thái tổng là `HISTORICAL`, không bao giờ `CURRENT`.

## 7. Ví dụ

PowerShell:

```powershell
$body = @{
  instrumentId = 'CBOT:ZC'; contractCode = 'ZCH25'; timeframe = 'D1'
  timezone = 'America/Chicago'; sourceLabel = 'Barchart export'; sourceQuality = 'LICENSED_VENDOR'
  dateFormat = 'MM/DD/YYYY'; dryRun = $true
  csv = Get-Content -Raw .\ZCH25_daily.csv
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/data/import -ContentType 'application/json' -Body $body
# Kiểm tra báo cáo, rồi gửi lại với dryRun = $false
```

curl (bash, cần `jq`):

```bash
jq -n --rawfile csv ZCH25_daily.csv '{instrumentId:"CBOT:ZC",contractCode:"ZCH25",timeframe:"D1",
  timezone:"America/Chicago",sourceLabel:"Barchart export",sourceQuality:"LICENSED_VENDOR",csv:$csv,dryRun:true}' \
| curl -s -X POST http://localhost:3000/api/data/import -H 'Content-Type: application/json' --data-binary @-

curl -s "http://localhost:3000/api/market/candles?instrumentId=ZC&contractCode=ZCH25&timeframe=D1&from=2025-01-01"
```

> `server/__fixtures__/synthetic_test_ZC_daily.csv` là **dữ liệu tổng hợp chỉ dùng cho test**, không phải giá thật — không nhập vào DB thật.

## 8. Giới hạn hiện tại

- Endpoint ghi/xóa (`POST /api/data/import`, `DELETE /api/data/datasets/:id`, `POST /api/cot/sync`, `POST /api/market/candles/import`, `DELETE /api/market/candles`, `POST /api/providers/sync`, `POST /api/fundamental/records`) được bảo vệ bởi `server/middleware/adminAuth.ts`: có `ADMIN_API_TOKEN` → bắt buộc header `Authorization: Bearer <token>` (401 nếu sai); không có token → chỉ nhận request trực tiếp từ localhost (403 nếu qua proxy/từ xa).
- Giá ≤ 0 chỉ được nhận khi bật `allowNonPositivePrices` (xem §5).
- Cảnh báo `SESSION_GAP` chỉ đếm ngày thường (lịch nghỉ lễ sàn trong `src/shared/contracts/holidays` hiện chỉ dùng cho ngày đáo hạn LTD/FND).

## 9. COT (CFTC) — nguồn dữ liệu và kiểm thử rules

- `COT_SOURCE=auto|socrata|files` (mặc định `auto`): `auto` gọi Socrata trước, lỗi upstream (403/429/5xx/mạng) thì chuyển sang file zip lịch sử của CFTC (`fut_disagg_txt_<YEAR>.zip`, `deacot<YEAR>.zip`). Mỗi dòng lưu kèm `sourceUrl` + `fetchedAt`; kết quả sync ghi `source` và `fallbackReason`.
- Bộ đọc zip (`server/cot/zip.ts`) không phụ thuộc thư viện ngoài: chỉ stored/deflate, kiểm CRC-32 và kích thước, giới hạn 200 MB giải nén, từ chối zip64/mã hoá/nhiều đĩa. Cache trong `COT_CACHE_DIR` (mặc định `data/cache/cftc`) được kiểm SHA-256 mỗi lần dùng lại.
- Kiểm thử Firestore rules bằng emulator: `npm run test:rules` (cần Java; `firebase-tools@13.35.1` chạy được với Java 17+, bản 14+ yêu cầu Java 21). Test nằm ở `tests/rules/`, không chạy trong `npm test`.
