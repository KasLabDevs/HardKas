param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [Parameter(Mandatory = $true)][string]$Tag
)
# Same as phase1\run-full.ps1 (full hermetic gate, copy of the v2.1.0 gate home), but against an
# explicit checkout (the isolated worktree) and logging under cut10-reorged-fix\logs.
$ErrorActionPreference = "Continue"
$scratch = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad"
$home_ = Join-Path $env:TEMP "hk-v210-gate-home"
$out = Join-Path $scratch "cut10-reorged-fix\logs"
New-Item -ItemType Directory $out -Force | Out-Null
$json = Join-Path $out "$Tag.json"
$log = Join-Path $out "$Tag.log"
if (Test-Path $log) { throw "$log already exists: keep every run, pick a new tag" }
Set-Location $Repo
"REPO=$Repo HEAD=$(git rev-parse HEAD)" | Out-File -FilePath (Join-Path $out "$Tag.head") -Encoding ascii
git status --porcelain=v1 | Out-File -FilePath (Join-Path $out "$Tag.status") -Encoding utf8

docker ps -a --format "{{.ID}} {{.Names}} {{.Labels}}" *> (Join-Path $out "docker-before-$Tag.txt")
$started = Get-Date
$args_ = @("scripts/gate-hermetic.mjs", "--home", $home_, "--", "--coverage.enabled=false", "--reporter=default", "--reporter=json", "--outputFile=$json")
& node @args_ *> $log
$exit = $LASTEXITCODE
$seconds = [int]((Get-Date) - $started).TotalSeconds
docker ps -a --format "{{.ID}} {{.Names}} {{.Labels}}" *> (Join-Path $out "docker-after-$Tag.txt")
"EXIT=$exit DURATION_S=$seconds" | Out-File -FilePath (Join-Path $out "$Tag.exit") -Encoding ascii
node (Join-Path $scratch "cut10-reorged-fix\gate-summary.mjs") $json
Get-Content $log -Tail 8
"EXIT=$exit DURATION_S=$seconds"
