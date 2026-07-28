  # Polly Voice cost controls

These controls are deployed through the existing `polly-voice-dev`
CloudFormation stack in `us-east-1`. They reduce unbounded storage and worker
scaling, but they are not a guaranteed billing cap.

## S3 lifecycle

`MediaBucket` has versioning enabled. Existing encryption, public-access
blocking, bucket ownership, CORS, EventBridge notifications, and the bucket
resource itself remain unchanged.

The job-specific lifecycle rules are:

| Prefix | Current-version expiration | Noncurrent-version expiration |
| --- | ---: | ---: |
| `input/stt/jobs/` | `SttInputRetentionDays` (default 14) | Same value |
| `output/tts/jobs/` | `JobOutputRetentionDays` (default 35) | Same value |
| `output/stt/jobs/` | `JobOutputRetentionDays` (default 35) | Same value |

The existing `temp/` seven-day rule and `cache/tts/` 30-day rule are
preserved. No expiration rule is applied to other live-object prefixes.

Incomplete multipart uploads across the bucket are aborted after
`IncompleteUploadAbortDays` (default one day). Expired delete markers are
removed only when S3 considers them eligible. This cleanup does not make the
bucket public.

Lifecycle policies apply to existing objects as well as new objects. An
already-old object can become eligible soon after the stack update. Once S3
has expired the current and noncurrent versions and removed the delete marker,
the file cannot be recovered from this bucket.

`JobOutputRetentionDays` must be greater than or equal to `JobTtlDays`, so a
job does not retain downloadable metadata after its output has expired.
CloudFormation Rules do not provide a safe numeric greater-than comparison
between two arbitrary Number parameters. The defaults preserve this invariant:
35 output days and 30 metadata days. Operators must preserve it when changing
parameter overrides.

## Worker concurrency

Both workers keep their existing SQS queues, batch size, partial batch failure
reporting, visibility timeout, retries, and DLQs.

- TTS defaults to maximum concurrency 5.
- STT defaults to maximum concurrency 3.
- Values from 2 through 1000 use the SQS event-source `ScalingConfig`.
- Value 1 uses Lambda reserved concurrency because AWS SQS event-source
  maximum concurrency has a minimum of 2.

The API and Completion functions are not concurrency-limited by these
parameters. Provisioned concurrency is not enabled.

## Public preview throttling

The API Gateway stage applies these defaults only to `POST /tts/preview`:

- steady-state rate: 2 requests per second;
- burst: 5 requests.

OPTIONS preflight and authenticated API methods keep their existing method
settings and authorizers. Requests rejected by API Gateway normally return
HTTP 429 and are included in API Gateway 4XX metrics on the existing
CloudWatch dashboard. Stage throttling protects against bursts but is not a
guaranteed billing limit.

## Inspect deployed settings

The examples below use PowerShell and the existing AWS CLI profile:

```powershell
$stackArgs = @(
  "--stack-name", "polly-voice-dev",
  "--region", "us-east-1",
  "--profile", "polly-dev"
)

aws cloudformation describe-stacks @stackArgs `
  --query "Stacks[0].Parameters" --output table

$bucket = aws cloudformation describe-stacks @stackArgs `
  --query "Stacks[0].Outputs[?OutputKey=='MediaBucketName'].OutputValue | [0]" `
  --output text
aws s3api get-bucket-lifecycle-configuration `
  --bucket $bucket --region us-east-1 --profile polly-dev

$apiId = aws cloudformation describe-stacks @stackArgs `
  --query "Stacks[0].Outputs[?OutputKey=='RestApiId'].OutputValue | [0]" `
  --output text
aws apigateway get-stage --rest-api-id $apiId --stage-name dev `
  --region us-east-1 --profile polly-dev

$ttsWorker = aws cloudformation list-stack-resources @stackArgs `
  --query "StackResourceSummaries[?LogicalResourceId=='TtsWorkerFunction'].PhysicalResourceId | [0]" `
  --output text
aws lambda list-event-source-mappings --function-name $ttsWorker `
  --region us-east-1 --profile polly-dev
```

## Change parameters safely

Update the deployment parameter overrides in `samconfig.toml`, or supply the
same values explicitly during `sam deploy`. Review the change set before
execution.

Always keep:

```text
JobOutputRetentionDays >= JobTtlDays
```

Reducing a retention period can make existing files immediately eligible for
lifecycle expiration. Increase or decrease worker concurrency gradually and
watch the queue-age, DLQ, Lambda throttle, and API 4XX dashboard metrics.
