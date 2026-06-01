$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "=== HardKAS NPM Published Package Smoke Test ==="

$Workspace = "c:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo"
$TestDir = Join-Path $Workspace "npm-smoke-test"

if (Test-Path $TestDir) {
    Write-Host "Cleaning existing test directory..."
    Remove-Item $TestDir -Recurse -Force
}

New-Item -ItemType Directory -Path $TestDir | Out-Null
Set-Location $TestDir

# 1. Initialize npm project
Write-Host "Step 1: Initializing fresh npm project..."
npm init -y | Out-Null

# 2. Install @hardkas/cli@alpha
Write-Host "Step 2: Installing @hardkas/cli@alpha from NPM..."
npm install @hardkas/cli@alpha --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install @hardkas/cli@alpha"
}

# Verify the installed version
$installedVersion = npx hardkas --version
Write-Host "Installed HardKAS CLI version: $installedVersion"

if ($installedVersion -ne "0.7.8-alpha") {
    throw "Expected version 0.7.8-alpha, but got $installedVersion"
}

# 3. Scaffold a new workspace
Write-Host ""
Write-Host "Step 3: Scaffolding a new workspace..."
npx hardkas init my-demo
$DemoDir = Join-Path $TestDir "my-demo"
Set-Location $DemoDir

# 4. Check doctor and capabilities
Write-Host ""
Write-Host "Step 4: Checking environment doctor and capabilities..."
npx hardkas doctor
$capsOutput = npx hardkas capabilities --json
Write-Host "Capabilities: $capsOutput"

# 5. Fund accounts (uses the already running local node)
Write-Host ""
Write-Host "Step 5: Funding accounts..."
npx hardkas accounts fund alice --amount 1000
npx hardkas accounts fund bob --amount 100

# 6. Plan transaction
Write-Host ""
Write-Host "Step 6: Creating transaction plan..."
npx hardkas tx plan `
  --from alice `
  --to bob `
  --amount 15 `
  --network simnet `
  --out tx-plan.json

if (!(Test-Path "tx-plan.json")) {
  throw "tx-plan.json was not created"
}

# 7. Sign transaction
Write-Host ""
Write-Host "Step 7: Signing transaction..."
npx hardkas tx sign tx-plan.json --out tx-signed.json

if (!(Test-Path "tx-signed.json")) {
  throw "tx-signed.json was not created"
}

# 8. Send transaction with tracking
Write-Host ""
Write-Host "Step 8: Sending transaction and tracking deployment..."
$sendOutput = npx hardkas tx send tx-signed.json `
  --track npm-smoke-track `
  --network simnet `
  --json

Write-Host "Send Output: $sendOutput"

try {
  $sendJson = $sendOutput | ConvertFrom-Json
  $txid = $sendJson.txId
} catch {
  throw "tx send did not return valid JSON"
}

if (-not $txid) {
  throw "txId missing from tx send output"
}

Write-Host "Broadcasted TxID: $txid"

# 8b. Fetch receipt and save to tx-receipt.json
Write-Host ""
Write-Host "Step 8b: Fetching receipt and saving as tx-receipt.json..."
$receiptOutput = npx hardkas tx receipt $txid --json
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "tx-receipt.json"), ($receiptOutput -join "`r`n"))

# 9. Deployment tracking
Write-Host ""
Write-Host "Step 9: Listing and inspecting deployments..."
npx hardkas deploy list
npx hardkas deploy inspect npm-smoke-track --network simnet

# 10. Replay Verification
Write-Host ""
Write-Host "Step 10: Replay verification..."
npx hardkas replay verify

Write-Host ""
Write-Host "=== NPM Published Package Smoke Test PASSED ==="
