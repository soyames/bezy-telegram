<#
.SYNOPSIS
    Registers the Bezy Telegram webhook with the update types Telegram Stars requires,
    then prints the resulting configuration.

.DESCRIPTION
    Telegram only delivers the update types listed in allowed_updates. The default list
    EXCLUDES pre_checkout_query, so a bot registered with allowed_updates=@("message")
    receives successful_payment but never pre_checkout_query — every Stars checkout then
    times out after 10 seconds and the buyer is refunded.

    The bot token is read from the environment and is never printed, never written to
    disk and never passed on the command line.

.EXAMPLE
    $env:TELEGRAM_BOT_TOKEN = "..."      # paste into your own shell only
    $env:TELEGRAM_WEBHOOK_SECRET = "..." # only if the Vercel env var is set
    .\scripts\set-webhook.ps1

.EXAMPLE
    .\scripts\set-webhook.ps1 -VerifyOnly
#>
[CmdletBinding()]
param(
    [string]$WebhookUrl = "https://bezy-telegram.vercel.app/api/telegram/webhook",
    [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"

$token = $env:TELEGRAM_BOT_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Error 'TELEGRAM_BOT_TOKEN is not set. Run: $env:TELEGRAM_BOT_TOKEN = "<token>"  (this shell only)'
    exit 1
}

# successful_payment arrives inside a normal `message` update, so "message" covers it.
# pre_checkout_query is a separate update type and must be requested explicitly.
$allowed = @("message", "pre_checkout_query")

if (-not $VerifyOnly) {
    $body = @{
        url                  = $WebhookUrl
        allowed_updates      = $allowed
        drop_pending_updates = $false
    }
    if (-not [string]::IsNullOrWhiteSpace($env:TELEGRAM_WEBHOOK_SECRET)) {
        $body.secret_token = $env:TELEGRAM_WEBHOOK_SECRET
        Write-Host "Using TELEGRAM_WEBHOOK_SECRET from the environment." -ForegroundColor DarkGray
    } else {
        Write-Host "No TELEGRAM_WEBHOOK_SECRET set - the webhook will be registered without a secret header." -ForegroundColor Yellow
        Write-Host "If the Vercel project HAS that variable, set it here too or the webhook will reject Telegram with 401." -ForegroundColor Yellow
    }

    $set = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" `
        -ContentType "application/json" -Body ($body | ConvertTo-Json)
    Write-Host "setWebhook: ok=$($set.ok) $($set.description)" -ForegroundColor Green
}

$info = (Invoke-RestMethod -Method Get -Uri "https://api.telegram.org/bot$token/getWebhookInfo").result

Write-Host ""
Write-Host "=== Webhook status ===" -ForegroundColor Cyan
# allowed_updates is an array: -join expands it. Format-List prints "System.Object[]" instead,
# which is why a misconfigured list can look correct.
[PSCustomObject]@{
    url                    = $info.url
    allowed_updates        = ($info.allowed_updates -join ", ")
    pending_update_count   = $info.pending_update_count
    max_connections        = $info.max_connections
    ip_address             = $info.ip_address
    has_custom_certificate = $info.has_custom_certificate
    last_error_date        = if ($info.last_error_date) { (Get-Date "1970-01-01").AddSeconds($info.last_error_date).ToString("u") } else { "none" }
    last_error_message     = if ($info.last_error_message) { $info.last_error_message } else { "none" }
} | Format-List

$ready = $info.allowed_updates -contains "pre_checkout_query" -and $info.allowed_updates -contains "message"
if ($ready) {
    Write-Host "READY: message and pre_checkout_query are both registered. Telegram Stars can complete." -ForegroundColor Green
} else {
    Write-Host "NOT READY: allowed_updates is missing message and/or pre_checkout_query." -ForegroundColor Red
    Write-Host "Stars checkout will time out at pre-checkout. Re-run this script without -VerifyOnly." -ForegroundColor Red
    exit 2
}
