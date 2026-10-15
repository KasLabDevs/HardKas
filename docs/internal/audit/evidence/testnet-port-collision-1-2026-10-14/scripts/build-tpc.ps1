# TESTNET-PORT-COLLISION-1 - build of the isolated tree.
param([string]$Tag = 'build-1')
$ErrorActionPreference = 'Continue'
$src = 'C:\Users\jrodr\hkl1\tpc\src'
$logs = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$sum = Join-Path $logs 'setup-summary.txt'
function Write-Sum([string]$m) { $line = (Get-Date).ToUniversalTime().ToString('s') + 'Z ' + $m; [IO.File]::AppendAllText($sum, $line + "`r`n", (New-Object Text.UTF8Encoding($false))) }
Push-Location $src
if (-not (Test-Path (Join-Path $src 'node_modules'))) {
  $t0 = Get-Date
  cmd /d /c "pnpm install --frozen-lockfile > `"$logs\install.log`" 2>&1"
  Write-Sum "pnpm install exit=$LASTEXITCODE secs=$([int]((Get-Date)-$t0).TotalSeconds)"
}
$t0 = Get-Date
cmd /d /c "pnpm turbo build --filter=@hardkas/cli... --filter=@hardkas/sdk... --filter=@hardkas/toolkit... --filter=@hardkas/testnet-qualification... --concurrency 1 > `"$logs\$Tag.log`" 2>&1"
Write-Sum "$Tag (cli/sdk/toolkit/tq + deps) exit=$LASTEXITCODE secs=$([int]((Get-Date)-$t0).TotalSeconds)"
# the build rewrites tracked outputs (pskt .node); the integration does not change them
$dirty = git diff --name-only -- '*.node'
foreach ($d in $dirty) { git checkout -- $d; Write-Sum "restored $d" }
$ver = cmd /d /c "node packages\cli\dist\index.js --version 2>&1"
Write-Sum "cli --version: $ver"
Pop-Location
Write-Sum "$Tag DONE"
