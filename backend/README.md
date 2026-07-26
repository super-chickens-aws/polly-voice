# Polly Voice Backend

Node.js + Express + TypeScript API dùng MongoDB. Chạy local với media giả lập hoặc chạy AWS với Polly, Transcribe, S3, Cognito, Lambda và API Gateway.

```powershell
Copy-Item .env.example .env
docker compose up -d
npm install
npm run dev
```

API chạy tại `http://localhost:8080`; health check tại `GET /health`.

```powershell
npm test
npm run build
```

Triển khai AWS:

```powershell
sam validate --lint
sam build
sam deploy --guided
```

Xem hướng dẫn đầy đủ trong [README gốc](../README.md).
