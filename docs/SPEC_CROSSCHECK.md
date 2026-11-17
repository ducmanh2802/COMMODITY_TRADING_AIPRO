# T24 — Đối chiếu độc lập thông số hợp đồng

Ngày kiểm: 2026-11-17. Đối tượng: `server/data/instruments.ts` (19 instrument + `CONTRACT_CALENDAR_RULES`).

## Nguồn đã dùng

| Nguồn | Trạng thái |
|---|---|
| QuantConnect Lean `Data/symbol-properties/symbol-properties-database.csv` (Apache-2.0, raw.githubusercontent.com, commit `388713e0`, 2026-11-15) | Đọc được |
| Lean `Common/Securities/Future/FuturesExpiryFunctions.cs` (cùng nhánh master) | Đọc được |
| Trang chính thức cmegroup.com (contractSpecs + rulebook PDF) | **KHÔNG đọc được**: WebFetch `ECONNRESET`; curl rulebook PDF trả 403 hoặc bị reset kết nối. Bản lưu web.archive.org trả 429 (giới hạn tần suất) và WebFetch bị chặn. Không có bản chính thức trực tiếp cho CME/CBOT/COMEX/NYMEX. |
| Tìm kiếm giới hạn domain cmegroup.com (chỉ có đoạn trích) | Chỉ dùng làm bằng chứng phụ |

Quy đổi Lean: `minimum_price_variation` của Lean tính bằng USD. Nếu `price_magnifier` = 100 thì giá niêm yết tính bằng cent (ZC/ZS/ZW/ZL/CT/SB), nên tick theo cent = tick Lean × 100. Riêng KC (Coffee C), Lean lưu bước giá 0.0005 USD mà không có magnifier, tức 0.05 cent: giá trị vẫn khớp, chỉ khác cách biểu diễn.
Brent trong Lean có mã `ice,B` (mã của ICE là `B`, `BRN` là mã màn hình), nên vẫn đối chiếu được.

## 1. Kích thước / tick / giá trị tick (cả nguồn Lean và nguồn của mình đều tính bằng USD)

| Instrument | Của mình (size / tick / tick value) | Lean (multiplier / tick quy đổi / magnifier) | Chính thức trực tiếp | Kết luận |
|---|---|---|---|---|
| CBOT:ZS | 5000 bu / 0.25 ¢ / 12.5 | 5000 / 0.0025 $ = 0.25 ¢ / 100 | không lấy được | MATCH |
| CBOT:ZM | 100 st / 0.1 $ / 10 | 100 / 0.1 $ / – | không lấy được | MATCH |
| CBOT:ZL | 60000 lb / 0.01 ¢ / 6 | 60000 / 0.0001 $ = 0.01 ¢ / 100 | không lấy được | MATCH |
| CBOT:ZC | 5000 bu / 0.25 ¢ / 12.5 | 5000 / 0.25 ¢ / 100 | không lấy được | MATCH |
| CBOT:ZW | 5000 bu / 0.25 ¢ / 12.5 | 5000 / 0.25 ¢ / 100 | không lấy được | MATCH |
| CBOT:ZR | 2000 cwt / 0.005 $ / 10 | không có | không lấy được (đoạn trích rulebook ch.17: 2000 cwt, ½ ¢/cwt = $10) | NOT_IN_LEAN |
| ICE:KC | 37500 lb / 0.05 ¢ / 18.75 | 37500 / 0.0005 $ = 0.05 ¢ / – | ICE (đọc trực tiếp ở T03) | MATCH |
| ICE:RC | 10 t / 1 $ / 10 | không có (ICE Europe softs không có trong Lean) | ICE (đọc trực tiếp ở T03) | NOT_IN_LEAN |
| ICE:SB | 112000 lb / 0.01 ¢ / 11.2 | 112000 / 0.0001 $ = 0.01 ¢ / 100 | ICE trực tiếp (T03) | MATCH |
| ICE:CC | 10 t / 1 $ / 10 | 10 / 1.0 / – | ICE trực tiếp (T03) | MATCH |
| ICE:CT | 50000 lb / 0.01 ¢ / 5 | 50000 / 0.0001 $ = 0.01 ¢ / 100 | ICE trực tiếp (T03) | MATCH |
| COMEX:HG | 25000 lb / 0.0005 $ / 12.5 | 25000 / 0.0005 / – | không lấy được | MATCH |
| COMEX:GC | 100 oz / 0.1 / 10 | 100 / 0.1 / – | không lấy được | MATCH |
| COMEX:SI | 5000 oz / 0.005 / 25 | 5000 / 0.005 / – | không lấy được | MATCH |
| NYMEX:PL | 50 oz / 0.1 / 5 | 50 / 0.1 / – | không lấy được | MATCH |
| CME:TIO | 500 dmt / 0.01 / 5 | không có | không lấy được | NOT_IN_LEAN |
| NYMEX:CL | 1000 bbl / 0.01 / 10 | 1000 / 0.01 / – | không lấy được | MATCH |
| ICE:BRN | 1000 bbl / 0.01 / 10 | `ice,B` 1000 / 0.01 / – | ICE trực tiếp (T03) | MATCH |
| NYMEX:NG | 10000 MMBtu / 0.001 / 10 | 10000 / 0.001 / – | không lấy được | MATCH |

Quote currency của tất cả các dòng Lean đều là USD, khớp `tradingCurrency: 'USD'`.
**Tổng phần thông số: 16 MATCH, 0 CONFLICT, 3 NOT_IN_LEAN (ZR, RC, TIO).**

## 2. Tháng niêm yết và quy tắc ngày giao dịch cuối (LTD), đối chiếu với FuturesExpiryFunctions.cs

| Root | Tháng niêm yết: của mình / Lean | LTD: của mình / Lean | Kết luận |
|---|---|---|---|
| ZS | F H K N Q U X / `FHKNQUX` | ngày làm việc trước ngày 15 / như nhau | MATCH |
| ZM | F H K N Q U V Z / `FHKNQUVZ` | như trên | MATCH |
| ZL | F H K N Q U V Z / `FHKNQUVZ` | như trên | MATCH |
| ZC | H K N U Z / `HKNUZ` | như trên | MATCH |
| ZW | H K N U Z / `HKNUZ` | như trên | MATCH |
| ZR | F H K N U X / không có | – | NOT_IN_LEAN. Đoạn trích rulebook ch.17 ghi 6 tháng (Sep, Nov, Jan, Mar, May, Jul); tháng Aug trên fact card có vẻ là quyền chọn serial, không phải hợp đồng tương lai. Giữ nguyên. |
| KC | H K N U Z / `HKNUZ` | 1 ngày làm việc trước last notice (LND = 7 ngày làm việc trước ngày làm việc cuối) / `NthLastBusinessDay(9)`, tương đương | MATCH |
| RC | F H K N U X / không có | – | NOT_IN_LEAN |
| SB | H K N V / `HKNV` | ngày làm việc cuối của tháng trước tháng giao / như nhau | MATCH |
| CC | H K N U Z / `HKNUZ` | 1 ngày làm việc trước LND (LND = 10 ngày làm việc trước ngày làm việc cuối) / `NthLastBusinessDay(12)`, tương đương | MATCH |
| CT | H K N V Z / `HKNVZ` | 17 ngày làm việc tính từ cuối tháng / `NthLastBusinessDay(17)` | MATCH |
| HG | mọi tháng gần + H K N U Z xa (24 hay 37 tháng liên tiếp?) / Lean chỉ ghi "Monthly contracts" | ngày làm việc thứ 3 tính từ cuối tháng / như nhau | LTD MATCH; số tháng liên tiếp: **Lean không xác định được, vẫn là câu hỏi mở**. Đoạn trích rulebook 111: "number of months … determined by the Exchange". Giữ UNVERIFIED. |
| GC | chi tiết theo chu kỳ / Lean "Monthly contracts" | ngày làm việc thứ 3 tính từ cuối tháng / như nhau | MATCH (Lean không mô tả chi tiết chu kỳ) |
| SI | chi tiết theo chu kỳ / "Monthly contracts" | như trên | MATCH |
| PL | 3 tháng gần + F J N V trong 15 tháng / "Monthly contracts" | như trên | MATCH (Lean không chi tiết) |
| TIO | – / không có | – | NOT_IN_LEAN; phạm vi niêm yết vẫn chưa xác minh |
| CL | "năm hiện tại + 5 năm" (kèm ghi chú về Jun/Dec) / **"current year and the next 10 calendar years and 2 additional contract months"** | ngày làm việc thứ 3 trước ngày 25 của tháng trước tháng hợp đồng, có điều chỉnh / như nhau (code trừ thêm 1 ngày khi ngày 25 không phải ngày làm việc, đúng với rule 200102.F) | **CONFLICT** (phạm vi niêm yết). Đoạn trích fact card WTI: "current year and 5 calendar years… listed nine years forward" (Jun/Dec phía xa); fact card không ghi ngày. |
| BRN | F–Z, tối đa 156 tháng / Lean "Up to 96 consecutive months" | ngày làm việc cuối của tháng thứ 2 trước tháng hợp đồng, lùi 1 ngày trước Giáng sinh/Năm mới / Lean xử lý gần đúng (tháng 12 → ngày làm việc thứ 2 từ cuối) | LTD MATCH; số tháng: CONFLICT nhẹ. Số 156 của mình đọc **trực tiếp** từ trang ICE, còn comment của Lean có vẻ đã cũ, nên giữ 156. |
| NG | "chưa xác minh phạm vi" / **"current year and the next 12 calendar years"** | 3 ngày làm việc trước ngày 1 của tháng giao / như nhau | LTD MATCH; phạm vi niêm yết chỉ có một nguồn (Lean), giữ UNVERIFIED |

**Tổng phần lịch (17 root có trong Lean): LTD 16/16 MATCH; tháng niêm yết 14 MATCH, 2 CONFLICT (CL, BRN horizon), HG không xác định; 3 NOT_IN_LEAN (ZR, RC, TIO).**

## 3. Sửa đổi đã thực hiện

- `CONTRACT_CALENDAR_RULES['NYMEX:CL'].verificationStatus`: `VERIFIED` → `UNVERIFIED`, có thêm ghi chú. Lý do: phạm vi niêm yết chỉ dựa trên đoạn trích fact card, trong khi Lean ghi "10 calendar years + 2 additional months". Không sửa nội dung `listedMonths` vì hai nguồn không thống nhất với nhau.
- Không sửa thông số hợp đồng nào: Lean khớp toàn bộ 16 instrument mà Lean có.

## 4. Việc cần làm tiếp

1. **CL**: đọc trang contractSpecs của CME từ một mạng khác. Nếu trang ghi "current year + 10 years + 2 additional months" thì cập nhật `listedMonths` và đặt lại VERIFIED.
2. **NG**: đối chiếu "current year + 12 calendar years" (theo Lean) trên trang chính thức rồi mới điền.
3. **HG**: xác nhận 24 hay 37 tháng liên tiếp trên trang contractSpecs; Lean không giúp được.
4. **ZR / RC / TIO**: không có trong Lean nên vẫn phải dựa vào nguồn chính thức. ZR: tạm giữ 6 tháng theo rulebook. TIO: phạm vi niêm yết chưa biết.
5. **BRN**: giữ 156 tháng (ICE trực tiếp). Lean ghi 96 nhiều khả năng đã cũ.
6. Ghi chú chung: các thông số CME/CBOT/COMEX/NYMEX đang `VERIFIED` hiện dựa trên đoạn trích tìm kiếm cộng với trang MXV, và nay được Lean xác nhận độc lập. Vẫn nên đọc trang CME trực tiếp trước khi dùng cho quản trị rủi ro thật.
