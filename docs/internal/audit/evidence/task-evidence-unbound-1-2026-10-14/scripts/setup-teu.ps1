# TASK-EVIDENCE-UNBOUND-1: isolated tree = published develop e14138477 + the delivered SECURITY-INTEGRATION-1 patch
# (sha 1d12fe26, what the owner is publishing). Owner's checkout: git archive only (read).
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo'
$commit = 'e14138477'
$patch = 'C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\ecaf7e92-a2ba-49b0-aafc-c62b4cb5eda0\scratchpad\l1-reality-1\si\manifest-m2\security-integration-1.patch'
$root = 'C:\Users\jrodr\hkl1\teu'
$src = Join-Path $root 'src'
$logs = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$sum = Join-Path $logs 'setup-summary.txt'
function Write-Sum([string]$m) { $line = (Get-Date).ToUniversalTime().ToString('s') + 'Z ' + $m; [IO.File]::AppendAllText($sum, $line + "`r`n", (New-Object Text.UTF8Encoding($false))) }
if (Test-Path $src) { Write-Sum "ABORT: $src exists"; exit 2 }
New-Item -ItemType Directory -Force $src | Out-Null
$expectedTree = (git -C $repo rev-parse "$commit^{tree}").Trim()
git -C $repo archive -o (Join-Path $root 'src.tar') $commit
tar -xf (Join-Path $root 'src.tar') -C $src
Push-Location $src
git init -q
git add -A -f 2>$null
$tree = (git write-tree).Trim()
Write-Sum "baselineTree=$tree match=$($tree -eq $expectedTree)"
if ($tree -ne $expectedTree) { Write-Sum 'ABORT: tree mismatch'; Pop-Location; exit 3 }
Write-Sum "patch sha256=$((Get-FileHash $patch -Algorithm SHA256).Hash.ToLower())"
cmd /d /c "git apply --index `"$patch`" > `"$logs\apply.log`" 2>&1"
Write-Sum "apply exit=$LASTEXITCODE"
$applied = (git write-tree).Trim()
Write-Sum "appliedTree=$applied match=$($applied -eq '64d9b986e7e2baf3a4bce369c23717af48639f71')"
$t0 = Get-Date
cmd /d /c "pnpm install --frozen-lockfile > `"$logs\install.log`" 2>&1"
Write-Sum "pnpm install exit=$LASTEXITCODE secs=$([int]((Get-Date)-$t0).TotalSeconds)"
$t0 = Get-Date
cmd /d /c "pnpm turbo build --filter=@hardkas/cli... --filter=@hardkas/sdk... --concurrency 1 > `"$logs\build-0.log`" 2>&1"
Write-Sum "build (cli/sdk + deps) exit=$LASTEXITCODE secs=$([int]((Get-Date)-$t0).TotalSeconds)"
foreach ($d in (git diff --name-only -- '*.node')) { git checkout -- $d; Write-Sum "restored $d" }
$ver = cmd /d /c "node packages\cli\dist\index.js --version 2>&1"
Write-Sum "cli --version: $ver"
Pop-Location
Write-Sum 'SETUP DONE'
