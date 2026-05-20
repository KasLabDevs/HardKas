$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "=== HardKAS Release Acceptance Test ==="

$Workspace = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Workspace

$CLI_SRC = Join-Path $Workspace "packages/cli/src/index.ts"
$TSX = Join-Path $Workspace "node_modules/.bin/tsx.cmd"

function hardkas {
    & $TSX $CLI_SRC @args
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: hardkas $($args -join ' ')"
    }
}

# 1. Version verification
Write-Host "Step 1: Version verification"
$versionOutput = hardkas --version
Write-Host "  Version: $versionOutput"

$capsOutput = hardkas capabilities --json
$caps = $capsOutput | ConvertFrom-Json
Write-Host "  Capabilities version: $($caps.version)"

# 2. Clean project
Write-Host ""
Write-Host "Step 2: Creating acceptance workspace"
$AcceptDir = Join-Path $Workspace "release-acceptance-test"

if (Test-Path $AcceptDir) {
    Remove-Item $AcceptDir -Recurse -Force
}

hardkas new release-acceptance-test
Set-Location $AcceptDir

# 3. Doctor
Write-Host ""
Write-Host "Step 3: Doctor check"
hardkas doctor

# 4. Fund accounts
Write-Host ""
Write-Host "Step 4: Fund accounts"
hardkas accounts fund alice --amount 1000
hardkas accounts fund bob --amount 100

# 5. Plan
Write-Host ""
Write-Host "Step 5: Transaction plan"
hardkas tx plan `
    --from alice `
    --to bob `
    --amount 10 `
    --network simnet `
    --url http://127.0.0.1:1 `
    --out tx-plan.json

if (!(Test-Path "tx-plan.json")) {
    throw "tx-plan.json was not created"
}

# 6. Sign
Write-Host ""
Write-Host "Step 6: Transaction sign"
hardkas tx sign tx-plan.json --out tx-signed.json

if (!(Test-Path "tx-signed.json")) {
    throw "tx-signed.json was not created"
}

# 7. Send with tracking
Write-Host ""
Write-Host "Step 7: Transaction send with tracking"
$sendOutput = hardkas tx send tx-signed.json `
    --track release-acceptance `
    --network simnet `
    --json

Write-Host $sendOutput

try {
    $sendJson = $sendOutput | ConvertFrom-Json
    $txid = $sendJson.txId
} catch {
    throw "tx send did not return valid JSON"
}

if (-not $txid) {
    throw "txId missing from tx send output"
}

Write-Host "  TXID: $txid"

# 8. Deploy tracking
Write-Host ""
Write-Host "Step 8: Deployment tracking"
hardkas deploy list
hardkas deploy inspect release-acceptance --network simnet

# 9. Receipt
Write-Host ""
Write-Host "Step 9: Receipt"
$receiptOutput = hardkas tx receipt $txid --json
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "tx-receipt.json"), ($receiptOutput -join "`r`n"))
hardkas tx receipt $txid

# 10. Replay verify
Write-Host ""
Write-Host "Step 10: Replay verification"
hardkas replay verify

# 11. Cleanup
Set-Location $Workspace
Remove-Item $AcceptDir -Recurse -Force

Write-Host ""
Write-Host "=== Release Acceptance Test PASSED ==="
