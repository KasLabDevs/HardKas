$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$CLI_SRC = "C:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo\packages\cli\src\index.ts"
$TSX = "C:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo\node_modules\.bin\tsx.cmd"

function hardkas {
    & $TSX $CLI_SRC @args
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: hardkas $($args -join ' ')"
    }
}

Write-Host "=== HardKAS TX Lifecycle Smoke Test ==="

# 0. Version
hardkas --version

# 1. Clean project
$Project = "tx-lifecycle-smoke"
$Workspace = "C:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo"
$ProjectDir = Join-Path $Workspace $Project

Set-Location $Workspace

if (Test-Path $ProjectDir) {
  Remove-Item $ProjectDir -Recurse -Force
}

hardkas new $Project
Set-Location $ProjectDir

# Commenting out pnpm install as we use the local monorepo source via tsx
# pnpm install

# 2. Environment
hardkas doctor
hardkas capabilities --json

# 3. Node
hardkas node start
hardkas node status
hardkas rpc health --wait

# 4. Accounts
hardkas accounts list
hardkas accounts fund alice --amount 1000
hardkas accounts fund bob --amount 100

# 5. Plan
hardkas tx plan `
  --from alice `
  --to bob `
  --amount 10 `
  --network simnet `
  --out tx-plan.json

if (!(Test-Path "tx-plan.json")) {
  throw "tx-plan.json was not created"
}

# 6. Verify plan
hardkas artifact verify tx-plan.json

# 7. Sign
hardkas tx sign tx-plan.json `
  --out tx-signed.json

if (!(Test-Path "tx-signed.json")) {
  throw "tx-signed.json was not created"
}

# 8. Verify signed artifact
hardkas artifact verify tx-signed.json

# 9. Send
$sendOutput = hardkas tx send tx-signed.json `
  --track lifecycle-demo `
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

Write-Host "TXID: $txid"

# 10. Deployment tracking
hardkas deploy list
hardkas deploy inspect lifecycle-demo --network simnet

# 11. Receipt + Trace
hardkas tx receipt $txid
hardkas tx trace $txid

# 12. Query store
hardkas query store sync
hardkas query artifacts list

# 13. Lineage
hardkas artifact lineage tx-signed.json

# 14. Replay
hardkas replay verify

# 15. Final doctor
hardkas doctor --json

Write-Host ""
Write-Host "=== TX Lifecycle Smoke Test PASSED ==="
