---
title: "Điều kiện tiên quyết"
date: 2026-07-30
weight: 2
chapter: false
pre: " <b> 5.2. </b> "
---

# Điều kiện tiên quyết

Trước khi triển khai Polly Voice, bạn cần chuẩn bị:

- Một tài khoản AWS đã hoàn tất xác minh và có phương thức thanh toán hợp lệ.
- Một người dùng AWS riêng; không sử dụng root user cho công việc hằng ngày.
- Quyền IAM để triển khai tài nguyên bằng AWS SAM và CloudFormation.
- AWS CLI v2, AWS SAM CLI, Git và Node.js 22.
- Source code của dự án Polly Voice.
- Region mặc định `eu-north-1` (Europe – Stockholm).
- Một tài khoản GitHub để kết nối source frontend với AWS Amplify Hosting.
- Địa chỉ email có thể nhận mã xác nhận từ Amazon Cognito.

## Nội dung chuẩn bị

1. [Chuẩn bị IAM](5.2.1-IAM/)
2. Cài đặt công cụ local.
3. Lấy source code và cấu hình môi trường.
4. Kiểm tra region và danh tính AWS.
5. Thiết lập AWS Budget để kiểm soát chi phí.

{{% notice warning %}}
Không sử dụng root access key. Không lưu access key, secret access key, password,
JWT hoặc presigned URL trong source code, file báo cáo hay GitHub.
{{% /notice %}}

