# Triển khai lên Google Cloud Run

Dành cho người mới. Ứng dụng là một server Node (Express) phục vụ cả API và frontend đã build. `server.ts` đọc cổng từ biến `PORT` (Cloud Run tự đặt), và `npm start` chạy `tsx server.ts --production`.

## 0. Chuẩn bị

1. Tài khoản Google Cloud có bật thanh toán (billing). Cloud Run có hạn mức miễn phí, nhưng hãy theo dõi chi phí.
2. Cài [gcloud CLI](https://cloud.google.com/sdk/docs/install), rồi:

```bash
gcloud auth login
gcloud config set project TEN_PROJECT_CUA_BAN
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

## 1. Dockerfile

Repo có `Dockerfile` và `.dockerignore` ở thư mục gốc: build frontend (`npm run build`), cài dependency production, chạy `npm start`, lắng nghe `PORT` (8080).

Thử cục bộ (cần Docker):

```bash
docker build -t commodity-aipro .
docker run --rm -p 8080:8080 commodity-aipro
# mở http://localhost:8080 và http://localhost:8080/api/health
```

## 2. Secrets (Secret Manager)

Không đưa khóa vào mã hoặc image. Ví dụ với `GEMINI_API_KEY` và `ADMIN_API_TOKEN`:

```bash
printf '%s' 'GIA_TRI_GEMINI' | gcloud secrets create GEMINI_API_KEY --data-file=-
openssl rand -hex 24 | tr -d '\n' | gcloud secrets create ADMIN_API_TOKEN --data-file=-

PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')
for S in GEMINI_API_KEY ADMIN_API_TOKEN; do
  gcloud secrets add-iam-policy-binding $S \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done
```

Lưu ý: nếu không đặt `ADMIN_API_TOKEN`, các endpoint ghi chỉ nhận request trực tiếp từ localhost, nghĩa là trên Cloud Run bạn sẽ không nhập dữ liệu qua API được. Hãy đặt token nếu cần dùng chúng.

## 3. Deploy

```bash
gcloud run deploy commodity-aipro \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --max-instances 1 \
  --set-env-vars TRUST_PROXY=1 \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest,ADMIN_API_TOKEN=ADMIN_API_TOKEN:latest
```

`--source .` dùng Cloud Build để build từ `Dockerfile`. Khi xong, gcloud in URL dạng `https://commodity-aipro-xxxx.a.run.app`. Kiểm tra: `curl URL/api/health`.

- `--allow-unauthenticated` làm trang công khai; bỏ cờ này nếu chỉ dùng cá nhân (truy cập qua `gcloud run services proxy commodity-aipro --region asia-southeast1`).
- Không bật `YAHOO_ENABLED` trên bản công khai: điều khoản Yahoo chỉ cho dùng cá nhân.

## 4. SQLite trên Cloud Run là tạm thời (ephemeral)

Ứng dụng lưu dữ liệu lịch sử và dữ liệu nhập vào SQLite (`data/market.db`, hoặc `MARKET_DB_PATH`). Hệ thống file của Cloud Run **bị xóa khi instance khởi động lại, scale về 0 hoặc deploy bản mới**. Hệ quả: dữ liệu nhập tay và dữ liệu đã đồng bộ (COT, provider) sẽ mất.

Lựa chọn:

1. **Chấp nhận** (đơn giản nhất): coi DB là cache; nhập lại / đồng bộ lại sau mỗi lần khởi động. Giữ `--max-instances 1` để mọi request thấy cùng một DB.
2. **Gắn volume Cloud Storage (GCS FUSE)** vào Cloud Run và đặt `MARKET_DB_PATH=/mnt/data/market.db`. Bền vững hơn, nhưng SQLite trên GCS FUSE chậm và không an toàn khi nhiều instance cùng ghi; giữ 1 instance. Cấu hình này CHƯA được kiểm thử với ứng dụng, hãy thử trước khi tin dùng.
3. **Chạy trên VM (Compute Engine)** hoặc máy cá nhân nếu cần ổ đĩa bền vững thật sự.
4. Chuyển sang cơ sở dữ liệu quản lý (ví dụ Cloud SQL): cần sửa mã, hiện chưa hỗ trợ.

## 4a. Lưu trữ bền vững

Hai cách giữ dữ liệu thị trường (`data/market.db`: nến, COT, cơ bản, giá trong nước, liên kết thông báo) qua các lần khởi động lại:

**Cách A - gắn volume vào Cloud Run** (Cloud Storage FUSE hoặc Filestore), đặt `MARKET_DB_PATH=/mnt/data/market.db`. Không cần mã thêm, nhưng SQLite trên GCS FUSE chậm và không an toàn nếu nhiều instance cùng ghi: giữ `--max-instances 1`. Filestore (NFS) ổn định hơn nhưng có chi phí cố định.

**Cách B - sao lưu/khôi phục (đã có trong mã, tùy chọn)**: đặt `GCS_BACKUP_BUCKET=<tên bucket>`. Khi đó:
- Lúc khởi động, nếu file DB không tồn tại hoặc rỗng, server tải đối tượng `latest`, giải nén, kiểm tra `PRAGMA integrity_check` rồi mới mở DB. Nếu khôi phục lỗi, server vẫn chạy với DB trống (không crash).
- Job `db-backup` chạy mỗi 6 giờ (`GCS_BACKUP_INTERVAL_HOURS`), và một lần khi nhận SIGTERM (tối đa 20 giây). Mỗi bản là snapshot nhất quán (`VACUUM INTO`), nén gzip, tên `market-YYYYMMDD-HHmm.db.gz`, cộng đối tượng `latest`. Giữ `GCS_BACKUP_KEEP` bản mới nhất (mặc định 14).
- Sao lưu ngay: `POST /api/admin/backup` (cần admin token). `GET /api/status` có `backup.lastBackupAt` và `backup.lastBackupError`.
- Quyền IAM: gán cho service account của Cloud Run vai trò **Storage Object Admin** (`roles/storage.objectAdmin`) trên bucket đó. Không cần file key; trên máy ngoài GCP dùng `GOOGLE_APPLICATION_CREDENTIALS`.
- Giới hạn: dữ liệu ghi sau bản sao lưu cuối (tối đa ~6 giờ nếu instance bị kill đột ngột) sẽ mất. Giữ 1 instance.

## 4b. Thông báo Telegram (tùy chọn)

Đặt `TELEGRAM_BOT_TOKEN` (tạo bot qua @BotFather; trên Cloud Run dùng Secret Manager như mục 2). Không đặt = tính năng tắt hoàn toàn. Khi bật, server chạy worker long-poll `getUpdates` (không cần webhook) và hai job mỗi 5 phút (vùng giá, sự kiện Radar). Người dùng liên kết trong panel Danh sách theo dõi: lấy mã, gửi `/start <mã>` cho bot. Liên kết lưu trong SQLite (xem mục 4: DB tạm thời trên Cloud Run nên liên kết mất khi instance bị xóa). Giữ 1 instance để chỉ một worker poll. Tin nhắn dùng giá trễ/giá đóng cửa, chỉ để theo dõi.

Cảnh báo quản trị về dữ liệu cũ (tùy chọn): đặt thêm `TELEGRAM_ADMIN_CHAT_ID` (id số của chat riêng với bot; nhắn `/start` cho bot trước). Khi một nguồn dữ liệu (nến D1, COT, FRED, EIA, tác vụ định kỳ...) quá 2 lần chu kỳ cập nhật dự kiến, server gửi MỘT tin nhắn cho chat này (kiểm tra mỗi 10 phút) và không gửi lại cho đến khi nguồn đó phục hồi. Không đặt = tắt. Xem trạng thái tại `GET /api/status/freshness` hoặc mục `freshness` của `GET /api/status`. Cuối tuần được bỏ qua cho nguồn theo ngày giao dịch; ngày nghỉ lễ chưa được tính riêng (ngưỡng 2 lần chu kỳ đã bù phần lớn).

## 4c. Thông báo trình duyệt (Web Push) và email (tùy chọn)

Web Push: tạo khóa bằng `npx web-push generate-vapid-keys`, đặt `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (dạng `mailto:...`; trên Cloud Run dùng Secret Manager). Không đặt = tắt (`GET /api/notify/push/key` trả 503). Đăng ký lưu trong SQLite (cùng DB mục 4); đăng ký hết hạn (404/410) tự bị xóa. Cần HTTPS (hoặc localhost).

Email: đặt `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` và `APP_BASE_URL` (địa chỉ công khai dùng trong liên kết xác nhận/hủy, không lấy từ header Host). Double opt-in: người dùng nhập email, nhận thư chứa liên kết xác nhận; mỗi thư có liên kết hủy; tối đa 20 thư/ngày/địa chỉ. Email không bao giờ được ghi log đầy đủ. Vùng giá được lưu lúc đăng ký (muốn cập nhật: hủy rồi đăng ký lại).

Hai job `channel-zones` và `channel-radar` chạy mỗi 5 phút, chỉ khi có cấu hình tương ứng. Nội dung dùng giá trễ/giá đóng cửa, chỉ để theo dõi, không phải khuyến nghị.

## 5. Firebase

Đăng nhập (Firebase Auth) và Firestore dùng cấu hình ở `firebase-applet-config.json`, được đóng gói vào image (không dùng biến môi trường). Đây là cấu hình của một project Firebase cụ thể; nếu bạn dùng project riêng, hãy thay file này bằng cấu hình project của bạn.

Sau khi có URL Cloud Run:

1. Firebase Console, Authentication, Settings, **Authorized domains**: thêm domain `xxxx.a.run.app` (nếu không, đăng nhập Google sẽ bị chặn).
2. Nếu dùng project riêng, triển khai luật Firestore: `npx firebase deploy --only firestore` (dùng `firestore.rules` và `firebase.json` trong repo; database có tên nên KHÔNG dùng `firestore:rules`).

## 6. Cập nhật và dọn dẹp

```bash
gcloud run deploy commodity-aipro --source . --region asia-southeast1   # cập nhật
gcloud run services delete commodity-aipro --region asia-southeast1      # xóa dịch vụ
```

## 7. Biến môi trường

Đối chiếu với `.env.example`. Mọi biến dưới đây đọc từ env (không có giá trị bí mật thật trong tài liệu này). "Opt-in?" = có/không; các biến trống nghĩa là tính năng tắt.

| Biến | Mục đích | Mặc định | Opt-in? |
|---|---|---|---|
| `GEMINI_API_KEY` | Khóa Google Gemini cho tóm tắt AI phía server (khi `AI_PROVIDER=gemini`) | chưa đặt | Cần khi dùng AI_PROVIDER=gemini |
| `APP_URL` | URL nơi applet được host (liên kết tự tham chiếu, OAuth callback, endpoint) | chưa đặt | — |
| `PORT` | Cổng server lắng nghe (Cloud Run tự đặt) | 8080 | — |
| `TRUST_PROXY` | Tin proxy (Cloud Run đặt `1` để đọc đúng IP) | chưa đặt | Nên đặt `1` trên Cloud Run |
| `TWELVEDATA_API_KEY` | Twelve Data: giá real-time/intraday OHLCV + FX USD/VND | trống | Có (khóa trả phí) |
| `FMP_API_KEY` | Financial Modeling Prep: futures/spot + EOD OHLCV | trống | Có (khóa trả phí) |
| `COMMODITIES_API_KEY` | Commodities-API: spot & futures real-time | trống | Có (khóa trả phí) |
| `ALPHAVANTAGE_API_KEY` | Alpha Vantage: spot/ref hàng ngày + FX USD/VND | trống | Có (khóa trả phí) |
| `EIA_API_KEY` | U.S. EIA v2: tồn kho dầu/khí, spot/futures, sản xuất ethanol | trống | Có (khóa miễn phí) |
| `FAS_API_KEY` | USDA FAS Export Sales (ngô/đậu tương/lúa mì, free key api.data.gov) | trống | Có (khóa miễn phí) |
| `USDA_API_KEY` | USDA NASS QuickStats (sản lượng & tồn kho nông sản) | trống | Có (khóa miễn phí) |
| `FRED_API_KEY` | FRED: DXY, Fed Funds, US 10Y, CPI | trống | Có (khóa miễn phí) |
| `MXV_API_KEY` | Feed thành viên MXV (qua CQG/member webservice) | trống | Có (cần quyền thành viên) |
| `MXV_API_URL` | Endpoint feed MXV | trống | Có |
| `CME_DATAMINE_API_KEY` | CME DataMine (dữ liệu chính thức CME) | trống | Có (khóa trả phí) |
| `ICE_API_KEY` | ICE feed (BRN, Robusta…) | trống | Có (khóa trả phí) |
| `MARKET_DATA_PROVIDER_URL` | Endpoint nhà cung cấp giá tùy chỉnh | trống | Có |
| `MARKET_DATA_PROVIDER_KEY` | Khóa cho nhà cung cấp giá tùy chỉnh | trống | Có |
| `YAHOO_ENABLED` | Bật Yahoo Finance (UNOFFICIAL, cá nhân, không CK/phân phối công khai) | `"false"` | Có (đặt `"true"`) |
| `ADMIN_API_TOKEN` | Token Bearer cho endpoint ghi (import/xóa, COT/provider sync, backup). Trống = chỉ nhận localhost | trống | Nên đặt (≥16 ký tự) |
| `MARKET_DB_PATH` | Đường dẫn file SQLite (dữ liệu lịch sử) | `data/market.db` | — |
| `COT_SOURCE` | Nguồn COT: `auto` \| `socrata` \| `files` | `auto` | — |
| `COT_CACHE_DIR` | Thư mục cache zip CFTC (kiểm SHA-256 khi tái dùng) | `data/cache/cftc` | — |
| `SCHEDULER_ENABLED` | Bật đồng bộ định kỳ phía server (COT, FX, WASDE, EIA/FRED) | `"true"` | Có (đặt `"false"` để tắt) |
| `AI_PROVIDER` | Engine tóm tắt: `rules` \| `gemini` \| `ollama` | `rules` | Có |
| `OLLAMA_URL` | URL model Ollama cục bộ (khi AI_PROVIDER=ollama) | `http://localhost:11434` | — |
| `OLLAMA_MODEL` | Tên model Ollama | `llama3.2` | — |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram (tạo qua @BotFather) cho cảnh báo | trống | Có (trống = tắt) |
| `TELEGRAM_ADMIN_CHAT_ID` | Id chat nhận cảnh báo dữ liệu cũ (mục 4b) | trống | Có (trống = tắt) |
| `GCS_BACKUP_BUCKET` | Tên bucket GCS sao lưu DB (mục 4a) | trống | Có (trống = tắt) |
| `GCS_BACKUP_KEEP` | Số bản sao lưu giữ lại | `14` | — |
| `GCS_BACKUP_INTERVAL_HOURS` | Chu kỳ sao lưu (giờ) | `6` | — |
| `VAPID_PUBLIC_KEY` | Khóa công khai Web Push (mục 4c) | trống | Có (trống = tắt) |
| `VAPID_PRIVATE_KEY` | Khóa riêng Web Push | trống | Có |
| `VAPID_SUBJECT` | Subject VAPID (dạng `mailto:...`) | trống | Có |
| `SMTP_HOST` | Host SMTP cho email cảnh báo (mục 4c) | trống | Có (cần SMTP_HOST+FROM+APP_BASE_URL) |
| `SMTP_PORT` | Cổng SMTP | `587` | — |
| `SMTP_USER` | Tài khoản SMTP | trống | Có |
| `SMTP_PASS` | Mật khẩu SMTP (dùng Secret Manager) | trống | Có |
| `SMTP_FROM` | Địa chỉ người gửi email | trống | Có |
| `APP_BASE_URL` | Origin công khai cho liên kết xác nhận/hủy email (không lấy từ header Host) | trống | Có |
