# Backend operations scripts

## Lambda log retention

The deployed stack contains these Lambda logical resources:

- `ApiFunction`
- `TtsWorkerFunction`
- `SttWorkerFunction`
- `CompletionFunction`

Their CloudWatch Logs groups use the standard
`/aws/lambda/<Lambda physical name>` path. Physical names are resolved from
CloudFormation instead of being hardcoded.

Set all existing Lambda log groups to 14-day retention:

```powershell
.\scripts\set-log-retention.ps1 `
  -StackName polly-voice-dev `
  -Region us-east-1 `
  -Profile polly-dev
```

The profile parameter may be an empty string when the AWS CLI should use its
normal credential resolution chain. Lambda log groups that do not exist yet
are reported and skipped safely.
