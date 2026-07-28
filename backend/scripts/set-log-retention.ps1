<#
.SYNOPSIS
Sets retention for Lambda log groups discovered from a CloudFormation stack.

.DESCRIPTION
The script discovers every AWS::Lambda::Function physical name in the supplied
stack, maps it to /aws/lambda/<physical-name>, and sets retention to 14 days.
Missing log groups are skipped because Lambda creates them only after its first
invocation.

.PARAMETER StackName
CloudFormation stack containing the Lambda functions.

.PARAMETER Region
AWS region containing the stack and CloudWatch log groups.

.PARAMETER Profile
Optional AWS CLI profile. No credentials are stored in this script.
#>
[CmdletBinding()]
param(
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$StackName = "polly-voice-dev",

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$Region = "us-east-1",

    [Parameter()]
    [string]$Profile = "polly-dev"
)

$ErrorActionPreference = "Stop"
$RetentionInDays = 14

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI was not found on PATH."
}

$AwsContextArguments = @("--region", $Region, "--no-cli-pager")
if (-not [string]::IsNullOrWhiteSpace($Profile)) {
    $AwsContextArguments += @("--profile", $Profile)
}

$ListArguments = @(
    "cloudformation",
    "list-stack-resources",
    "--stack-name",
    $StackName,
    "--output",
    "json"
) + $AwsContextArguments

$StackResourcesJson = & aws @ListArguments
if ($LASTEXITCODE -ne 0) {
    throw "Unable to list resources for CloudFormation stack '$StackName'."
}

$StackResources = $StackResourcesJson | ConvertFrom-Json
$LambdaResources = @(
    $StackResources.StackResourceSummaries |
        Where-Object { $_.ResourceType -eq "AWS::Lambda::Function" }
)

if ($LambdaResources.Count -eq 0) {
    Write-Warning "No Lambda functions were found in stack '$StackName'."
    exit 0
}

$UpdatedLogGroups = 0
foreach ($LambdaResource in $LambdaResources) {
    $FunctionName = [string]$LambdaResource.PhysicalResourceId
    if ([string]::IsNullOrWhiteSpace($FunctionName)) {
        Write-Warning "Skipped a Lambda resource without a physical name."
        continue
    }

    $LogGroupName = "/aws/lambda/$FunctionName"
    $DescribeArguments = @(
        "logs",
        "describe-log-groups",
        "--log-group-name-prefix",
        $LogGroupName,
        "--output",
        "json"
    ) + $AwsContextArguments

    $LogGroupsJson = & aws @DescribeArguments
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Could not inspect log group '$LogGroupName'; skipped."
        continue
    }

    $LogGroups = $LogGroupsJson | ConvertFrom-Json
    $ExactLogGroup = @(
        $LogGroups.logGroups |
            Where-Object { $_.logGroupName -eq $LogGroupName }
    )
    if ($ExactLogGroup.Count -eq 0) {
        Write-Warning "Log group '$LogGroupName' does not exist yet; skipped."
        continue
    }

    $RetentionArguments = @(
        "logs",
        "put-retention-policy",
        "--log-group-name",
        $LogGroupName,
        "--retention-in-days",
        $RetentionInDays
    ) + $AwsContextArguments

    & aws @RetentionArguments
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Failed to update log group '$LogGroupName'."
        continue
    }

    $UpdatedLogGroups += 1
    Write-Host "Updated $LogGroupName to $RetentionInDays-day retention."
}

Write-Host "Updated $UpdatedLogGroups Lambda log group(s) in stack '$StackName'."
