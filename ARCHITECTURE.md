# Project Architecture

The codebase is organized by responsibility and business capability. UI, security,
API access, AWS infrastructure, and domain routes are kept in separate modules.

## Frontend

```text
frontend/src/
├── @core/
│   └── utils/                    # Framework-independent helpers
├── @theme/
│   └── styles/                   # Global theme and shared presentation
├── guard/                        # Authentication-aware UI guards
├── pages/
│   ├── profile/                  # Cognito profile screen
│   ├── speech-to-text/           # Audio transcription screen
│   └── workspace/                # Main navigation and feature orchestration
├── security/                     # Cognito authentication integration
├── shared/
│   ├── models/                   # Frontend domain types
│   ├── services/                 # HTTP/API clients
│   └── settings/                 # Voice and region-specific configuration
└── main.tsx                      # React bootstrap
```

Dependency direction:

```text
pages -> guard/security/shared/@core
shared/services -> backend HTTP API
security -> Amazon Cognito
```

## Backend

```text
backend/src/
├── core/
│   ├── config/                   # Environment validation and configuration
│   └── http/                     # Shared HTTP errors and middleware
├── infrastructure/
│   ├── aws/                      # Amazon Polly integration
│   ├── database/                 # DynamoDB connection and repositories
│   └── storage/                  # Local/S3 media storage implementations
├── modules/
│   ├── stt/                      # Speech-to-text routes and workflow
│   └── tts/                      # Text-to-speech routes and workflow
├── security/                     # Cognito JWT authentication middleware
├── shared/
│   └── types/                    # Cross-module request and domain types
├── app.ts                        # Express composition root
├── lambda.ts                     # AWS Lambda adapter
└── server.ts                     # Local Node.js entry point
```

Dependency direction:

```text
app -> modules -> infrastructure
modules -> security/core/shared
lambda/server -> app
```

The public API routes and AWS resource names are unchanged by this refactor.
