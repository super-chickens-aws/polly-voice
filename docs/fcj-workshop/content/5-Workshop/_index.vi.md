---
title: "Workshop"
date: 2026-07-30
weight: 5
chapter: false
pre: " <b> 5. </b> "
---

# Workshop: Xây dựng Polly Voice trên AWS

Trong workshop này, bạn sẽ xây dựng và triển khai một ứng dụng Text-to-Speech
và Speech-to-Text theo kiến trúc serverless trên AWS.

Sau khi hoàn thành workshop, bạn có thể:

- Triển khai React frontend bằng AWS Amplify Hosting.
- Quản lý đăng ký và đăng nhập bằng Amazon Cognito.
- Triển khai Node.js/Express backend lên AWS Lambda và API Gateway.
- Chuyển văn bản thành MP3 bằng Amazon Polly.
- Upload media trực tiếp vào private S3 bucket bằng presigned URL.
- Chuyển audio/video thành văn bản bằng Amazon Transcribe.
- Lưu lịch sử và trạng thái job trong Amazon DynamoDB.
- Xem log, metric và cảnh báo bằng Amazon CloudWatch.
- Kiểm thử hệ thống end-to-end.
- Xóa tài nguyên sau workshop để tránh phát sinh chi phí.

## Nội dung workshop

1. Tổng quan workshop
2. Điều kiện tiên quyết
3. Kiến trúc giải pháp
4. Chuẩn bị source code và chạy local
5. Cấu hình Amazon Cognito
6. Triển khai backend bằng AWS SAM
7. Triển khai frontend bằng AWS Amplify
8. Kiểm thử Text-to-Speech
9. Kiểm thử Speech-to-Text
10. Logging và monitoring với CloudWatch
11. Kiểm tra bảo mật và kết quả cuối
12. Clean-up tài nguyên

## Hướng dẫn thực hiện từ đầu đến cuối

Toàn bộ quy trình chuẩn bị, triển khai, kiểm thử, thu thập bằng chứng và clean-up
được tổng hợp trong phần
[Quy trình xây dựng và triển khai Polly Voice](5.3-End-to-end-guide/).

{{% notice warning %}}
Workshop sử dụng các dịch vụ có thể phát sinh chi phí như Amazon Polly,
Amazon Transcribe, S3, Amplify và CloudWatch. Hãy cấu hình AWS Budget và thực
hiện phần Clean-up sau khi hoàn tất.
{{% /notice %}}
