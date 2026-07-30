# Kế hoạch hoàn thành phần 5 – Workshop Polly Voice

Tài liệu này là checklist dành cho người viết báo cáo. Mỗi mục workshop phải có:

- Mục tiêu của bước.
- Giải thích ngắn về dịch vụ.
- Các thao tác theo thứ tự.
- Code snippet hoặc lệnh CLI.
- Ảnh chụp trước và sau khi cấu hình.
- Cách kiểm tra.
- Kết quả mong đợi.
- Lỗi thường gặp và cách xử lý.

## 1. Cấu trúc thư mục cần tạo

```text
content/5-Workshop/
├── _index.vi.md
├── _index.md
├── 5.1-Workshop-overview/
│   ├── _index.vi.md
│   └── _index.md
├── 5.2-Prerequisite/
│   ├── _index.vi.md
│   └── _index.md
├── 5.3-Architecture/
│   ├── _index.vi.md
│   └── _index.md
├── 5.4-Local-setup/
│   ├── _index.vi.md
│   └── _index.md
├── 5.5-Cognito/
│   ├── _index.vi.md
│   └── _index.md
├── 5.6-Backend-deployment/
│   ├── _index.vi.md
│   └── _index.md
├── 5.7-Frontend-deployment/
│   ├── _index.vi.md
│   └── _index.md
├── 5.8-TTS-testing/
│   ├── _index.vi.md
│   └── _index.md
├── 5.9-STT-testing/
│   ├── _index.vi.md
│   └── _index.md
├── 5.10-Monitoring/
│   ├── _index.vi.md
│   └── _index.md
├── 5.11-Security-validation/
│   ├── _index.vi.md
│   └── _index.md
└── 5.12-Cleanup/
    ├── _index.vi.md
    └── _index.md
```

Quy ước:

- `_index.vi.md`: nội dung tiếng Việt.
- `_index.md`: nội dung tiếng Anh tương ứng.
- `weight`: tăng lần lượt từ 1 đến 12.
- Ảnh lưu trong `static/images/5-Workshop/<tên-bước>/`.
- File đính kèm lưu trong `static/attachments/`.

## 2. Bước 5.1 – Workshop Overview

### Nội dung cần viết

- Polly Voice giải quyết vấn đề gì.
- Người dùng mục tiêu.
- Chức năng TTS, STT, History và Authentication.
- Kết quả người học sẽ đạt được.
- Thời gian dự kiến hoàn thành workshop.
- Chi phí dự kiến.
- Region sử dụng: `eu-north-1`.

### Hình ảnh cần chuẩn bị

- Trang production Polly Voice.
- Trang Text-to-Speech.
- Trang Speech-to-Text.
- Trang History sau khi có dữ liệu.

### Tiêu chí hoàn thành

- Người đọc hiểu output cuối cùng trước khi bắt đầu.
- Có link repository và website demo.
- Có danh sách dịch vụ AWS được sử dụng.

## 3. Bước 5.2 – Prerequisite

### Nội dung cần viết

- Tài khoản AWS đã xác minh.
- Quyền IAM cần thiết.
- Node.js 22 LTS.
- npm, Git, AWS CLI v2 và AWS SAM CLI.
- GitHub repository.
- Trình duyệt hỗ trợ Developer Tools.
- Region mặc định `eu-north-1`.

### Lệnh cần đưa vào báo cáo

```powershell
node --version
npm --version
git --version
aws --version
sam --version
aws configure
aws sts get-caller-identity
aws configure get region
```

### IAM cần mô tả

Identity triển khai cần quyền tạo hoặc cập nhật:

- CloudFormation
- IAM Role
- Lambda
- API Gateway
- S3
- DynamoDB
- Cognito
- Amplify
- CloudWatch
- X-Ray

Không đưa access key hoặc secret key vào ảnh chụp.

### Hình ảnh cần chuẩn bị

- Kết quả kiểm tra phiên bản công cụ.
- Kết quả `aws sts get-caller-identity` đã che Account ID nếu cần.
- AWS Console đang chọn Europe (Stockholm).

## 4. Bước 5.3 – Architecture

### Nội dung cần viết

- Sơ đồ kiến trúc tổng thể.
- Sequence diagram TTS.
- Sequence diagram STT.
- Luồng xác thực Cognito.
- Luồng lưu lịch sử DynamoDB.
- Luồng direct-to-S3 upload.
- Lý do lựa chọn từng dịch vụ.

### Điểm bắt buộc phải giải thích

- Vì sao chọn HTTP API thay vì REST API.
- Vì sao Lambda không nhận trực tiếp file STT lớn.
- Vì sao bucket phải private.
- Vì sao dùng presigned URL.
- Vì sao dùng DynamoDB on-demand.
- Vì sao `eu-north-1` chỉ dùng Transcribe batch.
- Vì sao Polly tại Stockholm cần Standard Engine cho các preset hiện tại.

### Hình ảnh cần chuẩn bị

- Sơ đồ draw.io hoặc Excalidraw xuất PNG.
- Sơ đồ TTS.
- Sơ đồ STT.

## 5. Bước 5.4 – Local Setup

### Các bước thực hành

1. Clone repository.
2. Tạo file environment cho backend.
3. Cài dependency backend.
4. Chạy backend.
5. Kiểm tra `/health`.
6. Tạo environment frontend.
7. Cài dependency frontend.
8. Chạy frontend.
9. Build và test hai project.

### Code snippet

```powershell
git clone https://github.com/super-chickens-aws/polly-voice.git
cd polly-voice

cd backend
Copy-Item .env.example .env
npm install
npm run dev
```

Terminal khác:

```powershell
Invoke-RestMethod http://localhost:8080/health
```

Frontend:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

### Hình ảnh cần chuẩn bị

- Cấu trúc repository trong VS Code.
- Backend chạy cổng 8080.
- Response `/health`.
- Frontend chạy tại `localhost:5173`.

### Kết quả mong đợi

```json
{
  "status": "ok",
  "service": "polly-voice-backend",
  "region": "eu-north-1"
}
```

## 6. Bước 5.5 – Amazon Cognito

### Các bước thực hành

1. Mở Amazon Cognito tại `eu-north-1`.
2. Tạo User Pool.
3. Chọn email làm thuộc tính đăng nhập.
4. Bật email verification.
5. Cấu hình password policy.
6. Tạo public App Client không có client secret.
7. Bật SRP và refresh token flow.
8. Lấy User Pool ID và App Client ID.
9. Cấu hình biến môi trường frontend/backend.
10. Đăng ký user thử nghiệm.
11. Xác nhận mã email.
12. Đăng nhập và kiểm tra JWT.

### Thông tin không được công khai

- Password người dùng.
- Access token và ID token đầy đủ.
- AWS access key.

User Pool ID và App Client ID của SPA không phải secret, nhưng nên dùng biến môi
trường để quản lý cấu hình.

### Hình ảnh cần chuẩn bị

- User Pool overview.
- App Client không có secret.
- Sign-up settings.
- User ở trạng thái `CONFIRMED`.
- Giao diện đăng ký, xác nhận email và đăng nhập.

### Test

- Sai password → đăng nhập thất bại.
- Chưa xác nhận email → chuyển sang form confirmation.
- JWT hợp lệ → truy cập History.
- Không có JWT → protected API trả HTTP 401.

## 7. Bước 5.6 – Backend Deployment

### Nội dung cần giải thích

- Cấu trúc `backend/template.yaml`.
- Lambda runtime Node.js 22 arm64.
- API Gateway HTTP API.
- DynamoDB `PAY_PER_REQUEST`.
- S3 encryption và Block Public Access.
- IAM execution role.
- Environment variables.
- CloudFormation outputs.

### Các bước thực hành

```powershell
cd backend
npm install
npm run build
npm test
sam validate --lint
sam build --no-cached
sam deploy --guided
```

Các parameter cần nhập:

```text
Stack name: polly-voice-api
Region: eu-north-1
MediaBucketName: <bucket-name-duy-nhat>
HistoryTableName: polly-voice-history
CognitoUserPoolId: <user-pool-id>
CognitoClientId: <app-client-id>
AllowedOrigins: <amplify-domain-hoac-localhost>
TranscribeLanguageCode: en-US
```

### Hình ảnh cần chuẩn bị

- `sam validate` thành công.
- `sam build` thành công.
- CloudFormation change set.
- Stack ở trạng thái `CREATE_COMPLETE` hoặc `UPDATE_COMPLETE`.
- Tab Outputs.
- Lambda configuration.
- API Gateway routes.
- DynamoDB table.
- Private S3 bucket.

### Test

```powershell
Invoke-RestMethod https://<api-id>.execute-api.eu-north-1.amazonaws.com/health
```

## 8. Bước 5.7 – Frontend Deployment

### Các bước thực hành

1. Push source lên GitHub.
2. Mở AWS Amplify.
3. Chọn **Host web app**.
4. Kết nối GitHub repository.
5. Chọn branch.
6. Cấu hình root directory `frontend`.
7. Cấu hình build command `npm ci` và `npm run build`.
8. Cấu hình output directory `dist`.
9. Thêm environment variables.
10. Deploy.
11. Kiểm tra domain HTTPS.

### Environment variables

```text
VITE_AWS_ENABLED=true
VITE_API_BASE_URL=https://<api-id>.execute-api.eu-north-1.amazonaws.com/api/v1
VITE_COGNITO_USER_POOL_ID=<user-pool-id>
VITE_COGNITO_CLIENT_ID=<app-client-id>
```

### Hình ảnh cần chuẩn bị

- Amplify repository/branch.
- Build settings.
- Environment variables đã che giá trị nếu cần.
- Deployment `SUCCEED`.
- Website production.

### Lỗi thường gặp cần ghi lại

- Sai `baseDirectory`.
- Thiếu `index.html` trong artifact.
- Lock file chứa native dependency Windows.
- Thiếu Linux optional dependency.
- Sai API URL hoặc CORS origin.

## 9. Bước 5.8 – Text-to-Speech Test

### Các test cần thực hiện

1. Guest preview dưới 500 ký tự.
2. Guest preview vượt giới hạn.
3. User tạo audio dưới 3.000 ký tự.
4. Chọn voice và preset.
5. Nghe audio.
6. Download MP3.
7. Kiểm tra object trong S3.
8. Kiểm tra record trong DynamoDB.
9. Xem History.
10. Soft-delete record.

### Bằng chứng cần chụp

- Request trong Browser Network.
- Response status.
- Audio player hoạt động.
- File MP3 đã tải.
- S3 object key.
- DynamoDB item.
- CloudWatch log cùng Request ID.

### Kết quả mong đợi

- API trả HTTP 200/201/202 phù hợp.
- Audio nghe được.
- File không public.
- User khác không truy cập được lịch sử.

## 10. Bước 5.9 – Speech-to-Text Test

### Các test cần thực hiện

1. Chọn MP3 hoặc WAV nhỏ để test.
2. Frontend gọi `/stt/uploads`.
3. Backend trả presigned PUT URL.
4. Browser upload trực tiếp vào S3.
5. Frontend gọi `/stt/jobs`.
6. DynamoDB lưu `PROCESSING`.
7. Frontend polling `/stt/:id`.
8. Transcribe chuyển sang `COMPLETED`.
9. Backend đọc JSON kết quả trong S3.
10. Frontend hiển thị transcript.
11. Copy và download transcript.
12. Kiểm tra trường hợp định dạng không hỗ trợ.

### DevTools cần chụp

- Request tạo upload session.
- Request PUT trực tiếp đến S3.
- Request tạo Transcribe job.
- Các request polling.
- Response `COMPLETED`.

Không để presigned URL đầy đủ xuất hiện trong ảnh báo cáo vì URL có chữ ký tạm
thời.

### AWS Console cần chụp

- Source object trong S3.
- Transcribe job.
- Result JSON trong S3.
- DynamoDB status.
- Lambda log.

### Kết quả mong đợi

- File không đi qua Lambda.
- Upload progress đạt 100%.
- Transcript được hiển thị.
- Job thất bại có FailureReason.

## 11. Bước 5.10 – CloudWatch Logging và Monitoring

### Logging

1. Mở Lambda.
2. Chọn tab **Monitor**.
3. Mở CloudWatch Logs.
4. Tìm log group `/aws/lambda/<function-name>`.
5. Tìm request bằng Request ID.
6. Chụp START, END, REPORT và application log.
7. Cấu hình retention 14 hoặc 30 ngày.

### Dashboard cần tạo

Widget tối thiểu:

- Lambda Invocations.
- Lambda Errors.
- Lambda Duration.
- Lambda Throttles.
- API Gateway request count.
- API Gateway 4xx.
- API Gateway 5xx.
- DynamoDB throttled requests.

### Alarm cần tạo

- Lambda Errors ≥ 1 trong 5 phút.
- Lambda Duration vượt ngưỡng phù hợp.
- Lambda Throttles ≥ 1.
- API Gateway 5xx ≥ 1.

Tạo SNS topic và email subscription để nhận cảnh báo.

### Hình ảnh cần chuẩn bị

- Log group.
- Log stream có request.
- Dashboard đầy đủ widget.
- Alarm trạng thái `OK`.
- Email xác nhận SNS.
- Một test alarm hoặc lỗi thử nghiệm có kiểm soát.

## 12. Bước 5.11 – Security Validation

### Checklist

- [ ] S3 Block Public Access bật đủ bốn tùy chọn.
- [ ] S3 encryption bật.
- [ ] S3 CORS chỉ có domain cần thiết.
- [ ] API CORS chỉ có domain cần thiết.
- [ ] Cognito App Client không có secret.
- [ ] JWT được backend xác minh.
- [ ] Không có access key trong GitHub.
- [ ] Lambda role không dùng AdministratorAccess.
- [ ] DynamoDB encryption bật.
- [ ] Presigned URL có TTL ngắn.
- [ ] Không log password, token hoặc signed URL.
- [ ] User không xem được dữ liệu của user khác.

### IAM Policy cần trình bày

Giải thích từng nhóm quyền:

- DynamoDB CRUD chỉ trên table của project.
- S3 CRUD chỉ trên bucket của project.
- Polly chỉ có `SynthesizeSpeech` và `DescribeVoices`.
- Transcribe chỉ có thao tác tạo, đọc và xóa job.
- CloudWatch Logs và X-Ray phục vụ vận hành.

### Test bảo mật

- Gọi protected API không token → HTTP 401.
- JWT sai App Client → HTTP 401.
- Truy cập object S3 trực tiếp không chữ ký → Access Denied.
- Upload từ origin khác → CORS bị từ chối.
- Thử đọc ID lịch sử của user khác → không trả dữ liệu.

## 13. Bước 5.12 – Clean-up

### Thứ tự clean-up an toàn

1. Export screenshot và kết quả cần dùng cho báo cáo.
2. Xóa object trong media bucket.
3. Kiểm tra DynamoDB data cần giữ.
4. Chạy `sam delete`.
5. Xóa Amplify app.
6. Xóa Cognito User Pool.
7. Xóa CloudWatch alarms và dashboard.
8. Xóa SNS topic/subscription.
9. Xóa log group nếu không cần.
10. Kiểm tra S3 deployment bucket của SAM.
11. Kiểm tra CloudFormation không còn stack.
12. Kiểm tra Billing và Cost Explorer.

### Lệnh tham khảo

```powershell
aws s3 rm s3://<media-bucket> --recursive
sam delete --stack-name polly-voice-api --region eu-north-1
aws amplify delete-app --app-id <amplify-app-id> --region eu-north-1
aws cognito-idp delete-user-pool --user-pool-id <pool-id> --region eu-north-1
```

Không chạy lệnh clean-up trên môi trường production cần tiếp tục sử dụng.

### Hình ảnh cần chuẩn bị

- Xác nhận `sam delete`.
- CloudFormation không còn stack.
- S3 bucket đã xóa.
- Amplify app đã xóa.
- Cognito User Pool đã xóa.
- Billing không có tài nguyên bất thường.

## 14. Danh sách file đính kèm cần có

Đưa các file sau vào `static/attachments/`:

- `template.yaml`
- `amplify.yml`
- `.env.example`
- IAM policy JSON đã loại bỏ ARN nhạy cảm nếu cần.
- Script test API.
- Script clean-up có confirmation.
- AWS Pricing Calculator PDF/CSV.
- File kiến trúc draw.io.

Không đính kèm:

- `.env`
- Access key
- Password
- JWT
- Presigned URL
- File chứa dữ liệu cá nhân

## 15. Checklist cuối trước khi nộp

### Nội dung

- [ ] Có đủ bản tiếng Việt và tiếng Anh.
- [ ] Mỗi bước có mục tiêu và kết quả mong đợi.
- [ ] Người khác có thể thực hiện lại từ đầu.
- [ ] Không copy nguyên văn workshop mẫu.
- [ ] Lệnh CLI đã được chạy thử.
- [ ] Code snippet đúng với repository hiện tại.

### Hình ảnh

- [ ] Ảnh rõ, không bị cắt mất nội dung quan trọng.
- [ ] Có chú thích dưới mỗi ảnh.
- [ ] Che Account ID, email hoặc token khi cần.
- [ ] Đường dẫn ảnh đúng chuẩn Hugo.
- [ ] Không dùng ảnh của workshop mẫu.

### Kiến trúc và bảo mật

- [ ] Sơ đồ có đầy đủ luồng dữ liệu.
- [ ] Giải thích lý do chọn từng AWS service.
- [ ] Có IAM Least Privilege.
- [ ] Có private S3 và Cognito.
- [ ] Có CloudWatch Logs, Dashboard và Alarm.

### Kiểm thử và clean-up

- [ ] Có test thành công và test lỗi.
- [ ] Có kết quả TTS và STT.
- [ ] Có log và metric.
- [ ] Có hướng dẫn clean-up theo đúng thứ tự.
- [ ] Có cảnh báo không clean-up production ngoài ý muốn.

## 16. Thứ tự thực hiện thực tế được đề xuất

1. Hoàn thiện sơ đồ kiến trúc bằng draw.io.
2. Chụp toàn bộ resource đang có trước khi thay đổi.
3. Tạo CloudWatch Dashboard, Alarm và SNS.
4. Chạy lại test TTS/STT và ghi lại Request ID.
5. Chụp Network tab cho direct S3 upload.
6. Chụp S3, DynamoDB, Transcribe và CloudWatch.
7. Xuất AWS Pricing Calculator.
8. Viết lần lượt trang tiếng Việt.
9. Dịch từng trang sang tiếng Anh.
10. Kiểm tra Hugo local và toàn bộ link/ảnh.
11. Thực hiện clean-up trên môi trường thử nghiệm riêng.
12. Chụp bằng chứng clean-up và hoàn thiện kết luận.
