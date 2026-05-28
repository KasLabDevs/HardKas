$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "=== HardKAS NPM Smoke Test (0.7.1-alpha) ==="

$Workspace = "C:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo"
$SmokeDir = Join-Path $Workspace "npm-smoke-test-run"
$ProjectName = "fresh-onboarding-test"
$ProjectDir = Join-Path $SmokeDir $ProjectName

# 1. Prepare isolated workspace
Write-Host "`nStep 1: Preparing isolated workspace..."
if (Test-Path $SmokeDir) {
    Write-Host "  Removing existing smoke directory: $SmokeDir"
    Remove-Item $SmokeDir -Recurse -Force
}
New-Item -ItemType Directory -Path $SmokeDir | Out-Null
Set-Location $SmokeDir

# 2. Scaffold new project using npx @hardkas/cli@0.7.1-alpha
Write-Host "`nStep 2: Scaffolding new project using NPM package..."
# We run npx @hardkas/cli@0.7.1-alpha init with --skip-install to manually install with npm afterwards
& npx @hardkas/cli@0.7.1-alpha init $ProjectName --skip-install
if ($LASTEXITCODE -ne 0) {
    throw "npx @hardkas/cli@0.7.1-alpha init failed"
}

# Move into project directory
Set-Location $ProjectDir

# Run npm install to fetch pure packages from npm registry without workspace links
Write-Host "`nInstalling dependencies using npm..."
& npm install
if ($LASTEXITCODE -ne 0) {
    throw "npm install failed"
}

# 3. Verify packages inside the project
Write-Host "`nStep 3: Verifying package dependencies..."
$pkgJson = Get-Content "package.json" -Raw | ConvertFrom-Json
Write-Host "  Project Name: $($pkgJson.name)"
Write-Host "  Dependencies: "
$pkgJson.devDependencies | Format-List

# Double check CLI version running from node_modules
Write-Host "`nChecking CLI version..."
$cliVersion = & npx hardkas --version
Write-Host "  Installed CLI Version: $cliVersion"
if ($cliVersion -ne "0.7.1-alpha") {
    throw "Expected version 0.7.1-alpha, got $cliVersion"
}

# Run doctor and capabilities
Write-Host "`nStep 4: Checking environment doctor and capabilities..."
& npx hardkas doctor
if ($LASTEXITCODE -ne 0) { throw "hardkas doctor failed" }

& npx hardkas capabilities --json
if ($LASTEXITCODE -ne 0) { throw "hardkas capabilities failed" }

# 5. Start node
Write-Host "`nStep 5: Starting simulated localnet node..."
& npx hardkas node start
if ($LASTEXITCODE -ne 0) { throw "hardkas node start failed" }

& npx hardkas node status
if ($LASTEXITCODE -ne 0) { throw "hardkas node status failed" }

& npx hardkas rpc health --wait
if ($LASTEXITCODE -ne 0) { throw "hardkas rpc health --wait failed" }

# 6. Fund accounts
Write-Host "`nStep 6: Funding simulated accounts..."
& npx hardkas accounts list
if ($LASTEXITCODE -ne 0) { throw "hardkas accounts list failed" }

& npx hardkas accounts fund alice --amount 1000
if ($LASTEXITCODE -ne 0) { throw "hardkas accounts fund alice failed" }

& npx hardkas accounts fund bob --amount 100
if ($LASTEXITCODE -ne 0) { throw "hardkas accounts fund bob failed" }

# 7. Transaction Plan
Write-Host "`nStep 7: Planning transfer..."
& npx hardkas tx plan `
  --from alice `
  --to bob `
  --amount 10 `
  --network simnet `
  --out tx-plan.json

if (!(Test-Path "tx-plan.json")) {
    throw "tx-plan.json was not created"
}

# Verify plan artifact
& npx hardkas artifact verify tx-plan.json
if ($LASTEXITCODE -ne 0) { throw "artifact verify tx-plan.json failed" }

# 8. Sign transaction
Write-Host "`nStep 8: Signing transfer..."
& npx hardkas tx sign tx-plan.json --out tx-signed.json

if (!(Test-Path "tx-signed.json")) {
    throw "tx-signed.json was not created"
}

# Verify signed artifact
& npx hardkas artifact verify tx-signed.json
if ($LASTEXITCODE -ne 0) { throw "artifact verify tx-signed.json failed" }

# 9. Send transaction
Write-Host "`nStep 9: Sending transaction with tracking..."
$sendOutput = & npx hardkas tx send tx-signed.json `
  --track npm-smoke-demo `
  --network simnet `
  --json

Write-Host $sendOutput

try {
    $sendJson = $sendOutput | ConvertFrom-Json
    $txid = $sendJson.txId
} catch {
    throw "tx send did not return valid JSON: $sendOutput"
}

if (-not $txid) {
    throw "txId missing from tx send output"
}
Write-Host "  Success! TXID: $txid"

# 10. Deployment tracking
Write-Host "`nStep 10: Verifying deployment tracking..."
& npx hardkas deploy list
if ($LASTEXITCODE -ne 0) { throw "hardkas deploy list failed" }

& npx hardkas deploy inspect npm-smoke-demo --network simnet
if ($LASTEXITCODE -ne 0) { throw "hardkas deploy inspect failed" }

# 11. Transaction Receipt
Write-Host "`nStep 11: Inspecting transaction receipt..."
& npx hardkas tx receipt $txid
if ($LASTEXITCODE -ne 0) { throw "hardkas tx receipt failed" }

$receiptOutput = & npx hardkas tx receipt $txid --json
if ($LASTEXITCODE -ne 0) { throw "hardkas tx receipt --json failed" }
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "tx-receipt.json"), ($receiptOutput -join "`r`n"))

# 12. Query Store
Write-Host "`nStep 12: Syncing query store and listing artifacts..."
& npx hardkas query store sync
if ($LASTEXITCODE -ne 0) { throw "hardkas query store sync failed" }

& npx hardkas query artifacts list
if ($LASTEXITCODE -ne 0) { throw "hardkas query artifacts list failed" }

# 13. Lineage
Write-Host "`nStep 13: Verifying artifact lineage..."
& npx hardkas artifact lineage tx-signed.json
if ($LASTEXITCODE -ne 0) { throw "hardkas artifact lineage failed" }

# 14. Replay Verification
Write-Host "`nStep 14: Running replay verification..."
& npx hardkas replay verify
if ($LASTEXITCODE -ne 0) { throw "hardkas replay verify failed" }

# 15. Run Unit Tests (Vitest)
Write-Host "`nStep 15: Running scaffolded unit tests..."
& npm test
if ($LASTEXITCODE -ne 0) { throw "npm test failed" }

# 16. Stop Node
Write-Host "`nStep 16: Stopping node..."
& npx hardkas node stop
if ($LASTEXITCODE -ne 0) { throw "hardkas node stop failed" }

# 17. Final doctor
Write-Host "`nStep 17: Final doctor status..."
& npx hardkas doctor --json
if ($LASTEXITCODE -ne 0) { throw "hardkas doctor --json failed" }

# 18. Cleanup
Write-Host "`nStep 18: Cleaning up smoke workspace..."
Set-Location $Workspace
Remove-Item $SmokeDir -Recurse -Force

Write-Host "`n==============================================="
Write-Host "✅ NPM SMOKE TEST PASSED SUCCESSFULLY!"
Write-Host "==============================================="
