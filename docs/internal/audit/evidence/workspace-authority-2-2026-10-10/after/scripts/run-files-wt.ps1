param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [Parameter(Mandatory = $true)][string]$Tag,
  [string[]]$Files = @()
)
# WORKSPACE-AUTHORITY-2: same as the cut47 runner (hermetic gate, copy of the v2.1.0 gate home), against an explicit checkout
# (the isolated worktree), logging under cut48-workspace-authority-2\logs.
$ErrorActionPreference = "Continue"
$scratch = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad"
$home_ = Join-Path $env:TEMP "hk-v210-gate-home"
$out = Join-Path $scratch "cut48-workspace-authority-2\logs"
New-Item -ItemType Directory $out -Force | Out-Null
$json = Join-Path $out "$Tag.json"
$log = Join-Path $out "$Tag.log"
if (Test-Path $log) { throw "$log already exists: keep every run, pick a new tag" }
Set-Location $Repo
$Files = @($Files | ForEach-Object { $_ -split "," } | Where-Object { $_ -ne "" })
"REPO=$Repo HEAD=$(git rev-parse HEAD)" | Out-File -FilePath (Join-Path $out "$Tag.head") -Encoding ascii
git status --porcelain=v1 -uall | Out-File -FilePath (Join-Path $out "$Tag.status") -Encoding utf8

$args_ = @("scripts/gate-hermetic.mjs", "--home", $home_, "--", "--coverage.enabled=false", "--reporter=default", "--reporter=json", "--outputFile=$json") + $Files
& node @args_ *> $log
$exit = $LASTEXITCODE
"EXIT=$exit" | Out-File -FilePath (Join-Path $out "$Tag.exit") -Encoding ascii
node (Join-Path $scratch "cut10-reorged-fix\gate-summary.mjs") $json
Get-Content $log -Tail 6
"EXIT=$exit"
