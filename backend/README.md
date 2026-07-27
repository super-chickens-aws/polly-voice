# Polly Voice Backend

AWS SAM scaffold for the Polly Voice MVP. This stack is intentionally limited to the `dev`
environment in `us-east-1` and does not create WAF, Route 53, ACM, CodePipeline or CodeBuild.

## Included resources

- API Gateway REST API with a Regional endpoint and Lambda proxy integrations.
- Cognito User Pool, public SPA client, Authorization Code Grant + PKCE configuration and managed
  login domain.
- `Users` and `ConversionJobs` DynamoDB tables with on-demand billing, encryption and point-in-time
  recovery. `ConversionJobs` enables TTL on `expires_at`. A failed initial create is cleaned up via
  `RetainExceptOnCreate`; a successfully deployed stack retains both tables when deleted.
- One private, encrypted and versioned S3 media bucket with EventBridge notifications, restricted
  CORS and lifecycle rules.
- Encrypted TTS/STT SQS queues with dedicated dead-letter queues.
- Polly completion and operations SNS topics.
- EventBridge rules for STT S3 uploads and terminal Transcribe job states.
- API, TTS worker, STT worker and completion Lambda placeholders using Python 3.12 on x86_64.
- JSON API access logs, Lambda log retention and CloudWatch alarms.

All API routes currently return `501 NOT_IMPLEMENTED`. Worker and completion handlers accept and log
their configured event shapes without calling paid AWS AI services.

## Prerequisites

- Python 3.12
- AWS SAM CLI
- AWS CLI credentials configured outside this repository
- Permission to deploy the resources declared in `template.yaml`

The Cognito domain prefix must be globally unique within Cognito managed domains. The template does
not provide a default so deployment cannot accidentally claim a generic shared name.

## Install development tools

From `C:\project\polly-voice\backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
```

## Validate and test

```powershell
$env:SAM_CLI_TELEMETRY = "0"
sam validate --lint
python -m pytest
python -m ruff check src tests
```

## Build

```powershell
$env:SAM_CLI_TELEMETRY = "0"
sam build
```

The four function `requirements.txt` files are intentionally dependency-free because the initial
handlers use only the Python standard library.

## Local invocation

```powershell
sam local invoke ApiFunction --event tests/events/api-tts-preview.json
sam local invoke TtsWorkerFunction --event tests/events/tts-sqs.json
sam local invoke SttWorkerFunction --event tests/events/stt-sqs.json
sam local invoke CompletionFunction --event tests/events/transcribe-eventbridge.json
```

Docker is required by `sam local invoke`, but not by `sam validate` or the current `sam build`.

## Deploy

The checked-in `samconfig.toml` fixes the initial stack name to `polly-voice-dev` and Region to
`us-east-1`. Run a guided deployment the first time:

```powershell
$env:SAM_CLI_TELEMETRY = "0"
sam deploy --guided
```

Use these values when prompted:

- Stack name: `polly-voice-dev`
- AWS Region: `us-east-1`
- Parameter `Environment`: `dev`
- Parameter `FrontendOrigin`: `http://localhost:5173`
- Parameter `CognitoCallbackUrl`: `http://localhost:5173/auth/callback`
- Parameter `CognitoLogoutUrl`: `http://localhost:5173/`
- Parameter `CognitoDomainPrefix`: a unique lowercase value for your account
- Allow SAM CLI IAM role creation: `Y`
- Save arguments to configuration file: `Y`

After the first guided deploy, use:

```powershell
sam deploy
```

No AWS credentials, account IDs, bucket names or fabricated ARNs are stored in this repository.

## Delete

The media bucket must be empty before CloudFormation can remove it:

```powershell
$mediaBucket = aws cloudformation describe-stacks `
  --stack-name polly-voice-dev `
  --region us-east-1 `
  --query "Stacks[0].Outputs[?OutputKey=='MediaBucketName'].OutputValue" `
  --output text

aws s3 rm "s3://$mediaBucket" --recursive --region us-east-1
sam delete --stack-name polly-voice-dev --region us-east-1
```

After a successful deployment, both DynamoDB tables are retained when the stack is deleted to
protect data. Delete retained tables manually only when their data is no longer needed.

## File tree

```text
backend/
├── template.yaml
├── samconfig.toml
├── pyproject.toml
├── requirements-dev.txt
├── README.md
├── src/
│   ├── api/
│   │   ├── __init__.py
│   │   ├── app.py
│   │   └── requirements.txt
│   ├── tts_worker/
│   │   ├── __init__.py
│   │   ├── app.py
│   │   └── requirements.txt
│   ├── stt_worker/
│   │   ├── __init__.py
│   │   ├── app.py
│   │   └── requirements.txt
│   ├── completion/
│   │   ├── __init__.py
│   │   ├── app.py
│   │   └── requirements.txt
│   └── shared/
│       └── __init__.py
└── tests/
    ├── unit/
    │   ├── __init__.py
    │   └── test_handlers.py
    └── events/
        ├── api-tts-preview.json
        ├── polly-sns.json
        ├── stt-sqs.json
        ├── transcribe-eventbridge.json
        └── tts-sqs.json
```
