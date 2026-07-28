# BACKEND

npm install @aws-sdk/client-dynamodb
npm install @aws-sdk/lib-dynamodb
npm install @aws-sdk/client-polly
npm install @aws-sdk/client-s3
npm install @aws-sdk/s3-request-presigner

# Event mà lambda nhận có dạng
```js
event = {
    body: {
        text: text,
        voiceId: voiceId,
        engine: engine,
        speed: speed,
        pitch: pitch,
        volume: volume 
    },
    requestContext: {
        http:{
            path:"/tts"
        },
        authorizer:{
            jwt:{
                claims:{
                    sub:"123",
                    email:"abc@gmail.com"
                }
            }
        }
    }
}
```

```
backend/
│
├── src/
│
├── handlers/
│   ├── auth.js
│   ├── tts.js
│   ├── preview.js
│   ├── history.js
│   ├── profile.js
│
├── services/
│   ├── pollyService.js
│   ├── s3Service.js
│   ├── historyService.js
│   ├── userService.js
│
├── utils/
│   ├── response.js
│   └── error.js
│
├── index.mjs
│
└── package.json
```