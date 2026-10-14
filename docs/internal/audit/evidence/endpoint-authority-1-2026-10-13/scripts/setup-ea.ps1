# NODE-NETWORK-IDENTITY-1 Â· isolated tree from the last published develop (e14138477 = 3c61d15f6 + 2A). Owner's checkout: git archive only.
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo'
$commit = 'e14138477'
$root = 'C:\Users\jrodr\hkl1\ea'
$src = Join-Path $root 'src'
$logs = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$sum = Join-Path $logs 'setup-summary.txt'
function Write-Sum([string]$m) { $line = (Get-Date).ToUniversalTime().ToString('s') + 'Z ' + $m; Add-Content -Path $sum -Value $line -Encoding utf8 }
if (Test-Path $src) { Write-Sum "ABORT: $src exists"; exit 2 }
New-Item -ItemType Directory -Force $src | Out-Null
$expectedTree = (git -C $repo rev-parse "$commit^{tree}").Trim()
Write-Sum "commit=$((git -C $repo rev-parse $commit).Trim()) expectedTree=$expectedTree"
git -C $repo archive -o (Join-Path $root 'src.tar') $commit
tar -xf (Join-Path $root 'src.tar') -C $src
Push-Location $src
git init -q
git add -A -f 2>$null
$tree = (git write-tree).Trim()
Write-Sum "baselineTree=$tree match=$($tree -eq $expectedTree)"
if ($tree -ne $expectedTree) { Write-Sum 'ABORT: tree mismatch'; Pop-Location; exit 3 }
$t0 = Get-Date
cmd /d /c "pnpm install --frozen-lockfile > `"$logs\install.log`" 2>&1"
Write-Sum "pnpm install exit=$LASTEXITCODE secs=$([int]((Get-Date)-$t0).TotalSeconds)"
$t0 = Get-Date
cmd /d /c "pnpm turbo build --filter=@hardkas/cli... --filter=@hardkas/sdk... --filter=@hardkas/testnet-qualification... --concurrency 1 > `"$logs\build-0.log`" 2>&1"
Write-Sum "build (cli/sdk/tq + deps) exit=$LASTEXITCODE secs=$([int]((Get-Date)-$t0).TotalSeconds)"
$ver = cmd /d /c "node packages\cli\dist\index.js --version 2>&1"
Write-Sum "cli --version: $ver"
Pop-Location
Write-Sum 'SETUP DONE'

