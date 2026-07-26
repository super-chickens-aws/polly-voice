# AWS Setup

Hướng dẫn AWS CLI, S3, Cognito, MongoDB Atlas, SAM/Lambda, API Gateway và frontend production đã được hợp nhất vào mục **Triển khai AWS A–Z (`eu-north-1`)** trong [README gốc](../README.md).

Thông tin an toàn có thể chia sẻ:

- AWS Account ID
- AWS Region
- Tên S3 bucket
- Cognito User Pool ID
- Cognito App Client ID
- Domain frontend và URL API

Không gửi hoặc commit:

- AWS Secret Access Key
- MongoDB password/connection string
- JWT, refresh token hoặc presigned URL còn hiệu lực
- File `.env` thật

Production dùng IAM Role của Lambda do `template.yaml` tạo; không lưu access key trong mã nguồn hay biến môi trường Lambda.
