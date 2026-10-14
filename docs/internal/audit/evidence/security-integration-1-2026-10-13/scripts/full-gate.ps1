# SECURITY-INTEGRATION-1 D3: full gate on the integrated tree. Full build, the hermetic vitest gate (copy of the
# isolated home with the pinned kaspa-wasm; canonical localnet ports denied), workflows, full typecheck, lint, docs checks.
param([string]$Tag = 'gate-1')
$ErrorActionPreference = 'Continue'
$src = 'C:\Users\jrodr\hkl1\si\src'
$logs = Join-Path $PSScriptRoot 'logs'
$sum = Join-Path $logs "$Tag-summary.txt"
function Write-Sum([string]$m) { $line = (Get-Date).ToUniversalTime().ToString('s') + 'Z ' + $m; [IO.File]::AppendAllText($sum, $line + "`r`n", (New-Object Text.UTF8Encoding($false))); $line }
Push-Location $src
$t0 = Get-Date
cmd /d /c "pnpm build > `"$logs\$Tag-build.log`" 2>&1"
Write-Sum "build (all) exit=$LASTEXITCODE secs=$([int]((Get-Date)-$t0).TotalSeconds)"
foreach ($d in (git diff --name-only -- '*.node')) { git checkout -- $d; Write-Sum "restored $d" }
$t0 = Get-Date
cmd /d /c "node scripts/gate-hermetic.mjs --home C:/Users/jrodr/hkl1/home --deny-ports 16210,17210,18210 -- --coverage.enabled=false --reporter=default --reporter=json --outputFile=`"$logs\$Tag-vitest.json`" > `"$logs\$Tag-vitest.log`" 2>&1"
Write-Sum "gate-hermetic exit=$LASTEXITCODE secs=$([int]((Get-Date)-$t0).TotalSeconds)"
$t0 = Get-Date
cmd /d /c "pnpm test:workflows > `"$logs\$Tag-workflows.log`" 2>&1"
Write-Sum "test:workflows exit=$LASTEXITCODE secs=$([int]((Get-Date)-$t0).TotalSeconds)"
cmd /d /c "pnpm typecheck > `"$logs\$Tag-typecheck.log`" 2>&1"
Write-Sum "typecheck (all) exit=$LASTEXITCODE"
cmd /d /c "pnpm lint > `"$logs\$Tag-lint.log`" 2>&1"
Write-Sum "lint exit=$LASTEXITCODE"
cmd /d /c "pnpm docs:check-cli > `"$logs\$Tag-docs-check-cli.log`" 2>&1"
Write-Sum "docs:check-cli exit=$LASTEXITCODE"
cmd /d /c "pnpm docs:check > `"$logs\$Tag-docs-check.log`" 2>&1"
Write-Sum "docs:check exit=$LASTEXITCODE"
cmd /d /c "pnpm docs:check-claims > `"$logs\$Tag-docs-check-claims.log`" 2>&1"
Write-Sum "docs:check-claims exit=$LASTEXITCODE"
foreach ($d in (git diff --name-only -- '*.node' '*.snap')) { git checkout -- $d; Write-Sum "restored $d" }
Pop-Location
Write-Sum "$Tag DONE"
