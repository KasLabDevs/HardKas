# TASK-EVIDENCE-UNBOUND-1 · step 2 (run ONLY after the owner published SECURITY-INTEGRATION-1):
#   - the published commit must carry exactly the qualified tree 64d9b986 on top of e14138477;
#   - a NEW isolated tree from that commit (git archive; the owner's checkout is only read);
#   - the TEU patch applies there, touches exactly the 8 expected code/test paths plus its evidence folder, and the
#     resulting tree is the qualified FULL tree; then install + build. Tests and the real Golden Path follow (run-tests,
#     run-related, realnode-teu.ps1 -Src <tree>).
param(
  [Parameter(Mandatory = $true)][string]$Commit,
  [Parameter(Mandatory = $true)][string]$Patch,
  [Parameter(Mandatory = $true)][string]$ExpectedFullTree,
  [string]$Root = 'C:\Users\jrodr\hkl1\teu2'
)
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo'
$logs = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$sum = Join-Path $logs 'integrate-summary.txt'
function Write-Sum([string]$m) { $line = (Get-Date).ToUniversalTime().ToString('s') + 'Z ' + $m; [IO.File]::AppendAllText($sum, $line + "`r`n", (New-Object Text.UTF8Encoding($false))); $line }
$EXPECTED_CODE = @(
  'packages/artifacts/src/scenario-result.ts',
  'packages/artifacts/src/schemas.ts',
  'packages/cli/src/commands/evidence.ts',
  'packages/cli/src/commands/task.ts',
  'packages/cli/test/task-evidence-unbound-1.test.ts',
  'packages/sdk/src/artifacts-manager.ts',
  'packages/sdk/src/evidence.ts',
  'packages/sdk/src/tx.ts'
)
$EV = 'docs/internal/audit/evidence/task-evidence-unbound-1-2026-10-14/'

# 1. the published SECURITY-INTEGRATION-1 commit
$env:GIT_OPTIONAL_LOCKS = '0'
$full = (git -C $repo rev-parse "$Commit^{commit}").Trim()
$tree = (git -C $repo rev-parse "$Commit^{tree}").Trim()
$parent = (git -C $repo rev-parse "$Commit^").Trim()
Write-Sum "commit=$full tree=$tree parent=$parent"
if ($tree -ne '64d9b986e7e2baf3a4bce369c23717af48639f71') { Write-Sum 'STOP: the commit is not the qualified SECURITY-INTEGRATION-1 tree'; exit 2 }
if (-not $parent.StartsWith('e14138477')) { Write-Sum 'STOP: the commit does not sit on e14138477'; exit 3 }

# 2. a new isolated tree from it
$src = Join-Path $Root 'src'
if (Test-Path $src) { Write-Sum "STOP: $src exists"; exit 4 }
New-Item -ItemType Directory -Force $src | Out-Null
git -C $repo archive -o (Join-Path $Root 'src.tar') $Commit
tar -xf (Join-Path $Root 'src.tar') -C $src
Push-Location $src
git init -q
git add -A -f 2>$null
$base = (git write-tree).Trim()
Write-Sum "baselineTree=$base match=$($base -eq $tree)"
if ($base -ne $tree) { Pop-Location; Write-Sum 'STOP: archive tree mismatch'; exit 5 }

# 3. the patch: exactly the expected paths, the qualified result
Write-Sum "patch sha256=$((Get-FileHash $Patch -Algorithm SHA256).Hash.ToLower())"
cmd /d /c "git apply --index `"$Patch`" > `"$logs\integrate-apply.log`" 2>&1"
Write-Sum "apply exit=$LASTEXITCODE"
$changed = @(git -c core.quotepath=off diff --cached --name-only $base)
$code = @($changed | Where-Object { -not $_.StartsWith($EV) })
$evidence = @($changed | Where-Object { $_.StartsWith($EV) })
$unexpected = @($code | Where-Object { $EXPECTED_CODE -notcontains $_ })
$missing = @($EXPECTED_CODE | Where-Object { $code -notcontains $_ })
Write-Sum "code paths=$($code.Count) (unexpected: $($unexpected -join ', ')) (missing: $($missing -join ', ')); evidence paths=$($evidence.Count)"
$result = (git write-tree).Trim()
Write-Sum "resultTree=$result match=$($result -eq $ExpectedFullTree)"
if ($unexpected.Count -gt 0 -or $missing.Count -gt 0 -or $result -ne $ExpectedFullTree) { Pop-Location; Write-Sum 'STOP: the integration does not match the qualified patch'; exit 6 }

# 4. install + build (cli/sdk and their dependencies)
$t0 = Get-Date
cmd /d /c "pnpm install --frozen-lockfile > `"$logs\integrate-install.log`" 2>&1"
Write-Sum "pnpm install exit=$LASTEXITCODE secs=$([int]((Get-Date)-$t0).TotalSeconds)"
$t0 = Get-Date
cmd /d /c "pnpm turbo build --filter=@hardkas/cli... --filter=@hardkas/sdk... --concurrency 1 > `"$logs\integrate-build.log`" 2>&1"
Write-Sum "build exit=$LASTEXITCODE secs=$([int]((Get-Date)-$t0).TotalSeconds)"
foreach ($d in (git diff --name-only -- '*.node')) { git checkout -- $d; Write-Sum "restored $d" }
Pop-Location
Write-Sum 'INTEGRATE DONE (next: run-tests -Src, run-related, realnode-teu.ps1 -Src)'
