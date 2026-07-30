---
title: "Chuẩn bị IAM"
date: 2026-07-30
weight: 1
chapter: false
pre: " <b> 5.2.1. </b> "
---

# Chuẩn bị IAM

Trong phần này, bạn sẽ cấu hình quyền truy cập AWS cho người triển khai và kiểm
tra execution role của Lambda. Hai loại quyền này phải được tách riêng:

| Danh tính | Mục đích | Thời điểm sử dụng |
|---|---|---|
| Người triển khai | Dùng AWS Console, AWS CLI, SAM và CloudFormation | Khi tạo hoặc cập nhật hệ thống |
| Lambda execution role | Cho backend gọi Polly, Transcribe, S3, DynamoDB và CloudWatch | Khi ứng dụng xử lý request |

Không đưa access key của người triển khai vào Lambda. Lambda nhận temporary
credentials tự động thông qua execution role.

## 1. Không sử dụng root user

Root user chỉ nên dùng cho các tác vụ quản trị tài khoản đặc biệt. Với workshop,
hãy đăng nhập bằng một danh tính riêng được cấp qua **IAM Identity Center**.

Trước khi tiếp tục:

1. Đăng nhập AWS Console.
2. Chọn account menu ở góc trên bên phải.
3. Kiểm tra bạn không đăng nhập với tên **Root user**.
4. Bật MFA cho tài khoản quản trị và người dùng thực hành.

{{% notice danger %}}
Không tạo access key cho root user. Nếu đã tạo, hãy vô hiệu hóa và xóa sau khi
chuyển sang một danh tính IAM an toàn.
{{% /notice %}}

## 2. Tạo người dùng bằng IAM Identity Center

IAM là dịch vụ global, nhưng tài nguyên của workshop sẽ được triển khai tại
`eu-north-1`.

1. Mở **AWS IAM Identity Center**.
2. Chọn **Enable** nếu dịch vụ chưa được kích hoạt.
3. Vào **Users** → **Add user**.
4. Nhập username, email, họ và tên.
5. Tạo group tên `polly-voice-developers`.
6. Thêm người dùng vừa tạo vào group.
7. Xác nhận lời mời được gửi tới email và đặt mật khẩu.

Nếu tài khoản trường học hoặc AWS Academy không cho phép bật IAM Identity Center,
bạn có thể dùng IAM user do giảng viên cấp. Không tự tạo quyền quản trị vượt quá
phạm vi được cho phép.

## 3. Tạo permission set cho người triển khai

Trong **IAM Identity Center**:

1. Chọn **Permission sets** → **Create permission set**.
2. Chọn **Custom permission set**.
3. Đặt tên `PollyVoiceDeveloper`.
4. Gắn AWS managed policy `PowerUserAccess`.
5. Đặt session duration phù hợp, ví dụ `4 hours`.
6. Thêm inline policy ở phần tiếp theo.
7. Chọn **AWS accounts**, chọn account thực hành.
8. Chọn **Assign users or groups**.
9. Chọn group `polly-voice-developers`.
10. Chọn permission set `PollyVoiceDeveloper` và hoàn tất assignment.

`PowerUserAccess` cho phép quản lý phần lớn tài nguyên ứng dụng nhưng không cấp
toàn quyền quản trị IAM. Vì CloudFormation cần tạo execution role cho Lambda,
permission set cần thêm một số quyền IAM bị giới hạn theo tiền tố dự án.

## 4. Thêm inline policy cho role của dự án

Thay `352225045098` nếu bạn triển khai trong một AWS account khác. Trong permission
set `PollyVoiceDeveloper`, mở **Permissions** → **Inline policy**, rồi nhập:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ManagePollyVoiceRoles",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:PutRolePolicy",
        "iam:GetRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:ListRolePolicies",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:ListAttachedRolePolicies"
      ],
      "Resource": "arn:aws:iam::352225045098:role/polly-voice-*"
    },
    {
      "Sid": "PassPollyVoiceRolesToLambda",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::352225045098:role/polly-voice-*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "lambda.amazonaws.com"
        }
      }
    }
  ]
}
```

Policy trên chỉ cho phép quản lý và truyền các role bắt đầu bằng
`polly-voice-`. Điều kiện `iam:PassedToService` ngăn role này được truyền cho
một dịch vụ khác ngoài Lambda.

{{% notice info %}}
Tên execution role do SAM sinh ra phải bắt đầu bằng `polly-voice-`. Với stack
`polly-voice-api`, role hiện tại có dạng
`polly-voice-api-PollyVoiceFunctionRole-...`, nên phù hợp với policy trên.
{{% /notice %}}

## 5. Cấu hình AWS CLI bằng SSO

Mở PowerShell và chạy:

```powershell
aws configure sso --profile polly-voice
```

Nhập lần lượt Start URL, SSO Region, AWS account và permission set được hiển thị.
Sau đó đăng nhập:

```powershell
aws sso login --profile polly-voice
```

Kiểm tra danh tính:

```powershell
aws sts get-caller-identity --profile polly-voice
```

Kết quả phải trả về đúng account:

```text
352225045098
```

Thiết lập profile và region cho cửa sổ PowerShell hiện tại:

```powershell
$env:AWS_PROFILE = "polly-voice"
$env:AWS_REGION = "eu-north-1"
$env:AWS_DEFAULT_REGION = "eu-north-1"
```

Kiểm tra:

```powershell
aws configure get region --profile polly-voice
aws sts get-caller-identity
```

Không cần tạo access key dài hạn khi sử dụng IAM Identity Center. Phiên SSO sẽ
hết hạn theo session duration và có thể đăng nhập lại bằng `aws sso login`.

## 6. Hiểu quyền runtime của Lambda

File `backend/template.yaml` khai báo quyền runtime cho backend:

```yaml
Policies:
  - DynamoDBCrudPolicy:
      TableName: !Ref HistoryTable
  - S3CrudPolicy:
      BucketName: !Ref MediaBucket
  - Statement:
      - Effect: Allow
        Action:
          - polly:SynthesizeSpeech
          - polly:DescribeVoices
          - transcribe:StartTranscriptionJob
          - transcribe:GetTranscriptionJob
          - transcribe:DeleteTranscriptionJob
        Resource: "*"
```

Khi triển khai, AWS SAM và CloudFormation tạo execution role cho Lambda. Role
này có các nhóm quyền:

| Quyền | Mục đích |
|---|---|
| DynamoDB CRUD trên bảng dự án | Lưu lịch sử TTS/STT và trạng thái job |
| S3 CRUD trên bucket dự án | Lưu MP3, media upload và transcript |
| `polly:SynthesizeSpeech` | Tạo audio từ văn bản |
| `polly:DescribeVoices` | Lấy thông tin voice của Polly |
| Các action Transcribe trong template | Tạo, đọc trạng thái và xóa transcription job |
| `AWSLambdaBasicExecutionRole` | Ghi log vào CloudWatch Logs |
| `AWSXrayWriteOnlyAccess` | Gửi trace tới AWS X-Ray |

Không gắn `AdministratorAccess` vào execution role. Backend chỉ cần truy cập
các tài nguyên và action được mô tả trong template.

## 7. Xác nhận cho phép CloudFormation tạo IAM role

SAM sử dụng CloudFormation để triển khai. Vì template tạo IAM role, lệnh deploy
phải xác nhận capability IAM:

```powershell
cd backend
sam validate
sam build
sam deploy --guided --capabilities CAPABILITY_IAM
```

Trong lần deploy đầu tiên:

- Stack name: `polly-voice-api`
- AWS Region: `eu-north-1`
- Confirm changes before deploy: `Y`
- Allow SAM CLI IAM role creation: `Y`
- Save arguments to configuration file: `Y`

Hãy đọc change set trước khi xác nhận. `CAPABILITY_IAM` cho CloudFormation biết
bạn chấp nhận việc template tạo hoặc cập nhật IAM resource; nó không tự cấp
quyền Administrator cho Lambda.

## 8. Kiểm tra execution role sau khi deploy

Lấy ARN của role đang được Lambda sử dụng:

```powershell
aws lambda get-function-configuration `
  --function-name polly-voice-api-PollyVoiceFunction-kCHu2DIntLuz `
  --region eu-north-1 `
  --query "Role" `
  --output text
```

Sau đó mở:

1. **AWS Lambda** → function `polly-voice-api-PollyVoiceFunction-...`.
2. Chọn **Configuration** → **Permissions**.
3. Nhấn vào execution role.
4. Kiểm tra các inline policy và managed policy.
5. Xác nhận role không có `AdministratorAccess`.

Bạn cũng có thể kiểm tra bằng CLI:

```powershell
aws iam list-role-policies `
  --role-name polly-voice-api-PollyVoiceFunctionRole-ivwpSynnerGw

aws iam list-attached-role-policies `
  --role-name polly-voice-api-PollyVoiceFunctionRole-ivwpSynnerGw
```

Tên role có phần hậu tố do CloudFormation tạo tự động và có thể khác sau mỗi lần
triển khai. Hãy lấy tên thực tế từ Lambda thay vì sao chép cứng ví dụ trên.

## 9. Kiểm thử quyền

Thực hiện các kiểm tra sau sau khi backend hoạt động:

| Kiểm tra | Kết quả mong đợi | Quyền được chứng minh |
|---|---|---|
| Gọi `/health` | HTTP 200 | Lambda invoke và CloudWatch Logs |
| Tạo TTS | Có file MP3 | Polly, S3 và DynamoDB |
| Tải media STT | Upload thành công | Presigned S3 PUT |
| Chạy STT | Job hoàn thành | Transcribe, S3 và DynamoDB |
| Mở CloudWatch Logs | Có log request | Lambda logging |
| Mở X-Ray trace | Có segment của Lambda | X-Ray write |

Nếu nhận lỗi `AccessDeniedException`, mở CloudWatch Logs và xác định chính xác:

- Action bị từ chối.
- ARN tài nguyên.
- Tên execution role.
- Region đang sử dụng.

Sau đó chỉ bổ sung action và resource cần thiết vào `backend/template.yaml`, build
và deploy lại. Không xử lý lỗi bằng cách gắn `AdministratorAccess`.

## 10. Hình ảnh cần chụp cho báo cáo

Chụp các bằng chứng sau:

1. User hoặc group trong IAM Identity Center.
2. Permission set `PollyVoiceDeveloper`.
3. Phần managed policy và inline policy.
4. Kết quả `aws sts get-caller-identity` đã che thông tin không cần thiết.
5. Change set CloudFormation có IAM role.
6. Trang **Lambda → Configuration → Permissions**.
7. Danh sách policy của Lambda execution role.
8. CloudWatch Logs cho một request thành công.

Không chụp hoặc công khai access key, secret access key, mật khẩu, token SSO,
JWT, mã xác nhận email hay presigned URL đầy đủ.

## 11. Clean-up IAM

Sau khi hoàn thành workshop:

1. Xóa account assignment của group nếu chỉ tạo để thực hành.
2. Xóa permission set thử nghiệm khi không còn sử dụng.
3. Thu hồi mọi access key dài hạn đã tạo cho IAM user.
4. Xóa IAM user thử nghiệm nếu tổ chức không còn cần tài khoản đó.
5. Để CloudFormation xóa execution role khi xóa stack.

Không xóa execution role trước khi xóa stack vì có thể làm CloudFormation
không thể cập nhật hoặc clean-up tài nguyên đúng cách.

## Kết quả

Bạn đã hoàn thành phần IAM khi:

- Không sử dụng root user cho workshop.
- Người triển khai đăng nhập được bằng IAM Identity Center.
- `aws sts get-caller-identity` trả về đúng account.
- Region mặc định là `eu-north-1`.
- SAM có thể tạo change set và deploy stack.
- Lambda sử dụng execution role riêng.
- Execution role không có `AdministratorAccess`.
- TTS, STT, S3, DynamoDB, CloudWatch và X-Ray hoạt động đúng với các quyền đã cấp.

