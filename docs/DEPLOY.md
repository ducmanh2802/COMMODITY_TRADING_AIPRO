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

## 4b. Thông báo Telegram (tùy chọn)

Đặt `TELEGRAM_BOT_TOKEN` (tạo bot qua @BotFather; trên Cloud Run dùng Secret Manager như mục 2). Không đặt = tính năng tắt hoàn toàn. Khi bật, server chạy worker long-poll `getUpdates` (không cần webhook) và hai job mỗi 5 phút (vùng giá, sự kiện Radar). Người dùng liên kết trong panel Danh sách theo dõi: lấy mã, gửi `/start <mã>` cho bot. Liên kết lưu trong SQLite (xem mục 4: DB tạm thời trên Cloud Run nên liên kết mất khi instance bị xóa). Giữ 1 instance để chỉ một worker poll. Tin nhắn dùng giá trễ/giá đóng cửa, chỉ để theo dõi.

## 5. Firebase

Đăng nhập (Firebase Auth) và Firestore dùng cấu hình ở `firebase-applet-config.json`, được đóng gói vào image (không dùng biến môi trường). Đây là cấu hình của một project Firebase cụ thể; nếu bạn dùng project riêng, hãy thay file này bằng cấu hình project của bạn.

Sau khi có URL Cloud Run:

1. Firebase Console, Authentication, Settings, **Authorized domains**: thêm domain `xxxx.a.run.app` (nếu không, đăng nhập Google sẽ bị chặn).
2. Nếu dùng project riêng, triển khai luật Firestore: `npx firebase-tools deploy --only firestore:rules` (dùng `firestore.rules` và `firebase.json` trong repo).

## 6. Cập nhật và dọn dẹp

```bash
gcloud run deploy commodity-aipro --source . --region asia-southeast1   # cập nhật
gcloud run services delete commodity-aipro --region asia-southeast1      # xóa dịch vụ
```
