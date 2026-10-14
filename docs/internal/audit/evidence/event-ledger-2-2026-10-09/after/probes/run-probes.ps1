param(
  [Parameter(Mandatory = $true)][string]$Tag
)
# EVENT-LEDGER-2 · AFTER runtime probes against the rebuilt hk-ra dist, hermetic (same preload as the gate):
#   the investigation's own el2-probes.mjs (P1–P4, unchanged = comparable with runs/probes-1) and el2-after-extra.mjs (A6–A8).
$ErrorActionPreference = "Continue"
$wt = "C:\Users\jrodr\AppData\Local\Temp\hk-ra\wt"
$S = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\178242cc-c0b4-4452-b344-f35b49dc3d1f\scratchpad\el2"
$other = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad\cut46-event-ledger-2\probes\el2-probes.mjs"
$preload = Join-Path $wt "scripts\hermetic\no-network-preload.cjs"
New-Item -ItemType Directory -Force "$S\runs", "$S\logs" | Out-Null
"HEAD=$(git -C $wt rev-parse HEAD)" | Out-File -Encoding ascii "$S\logs\$Tag.head"
Set-Location $wt
$t0 = Get-Date
& node --require $preload $other $wt "$S\runs\$Tag-p" EL2-P1-STALE-EVENTS-LOCK EL2-P2-LOCK-TOOLS EL2-P3-STALE-TELEMETRY-LOCK EL2-P4-EVENT-KINDS *> "$S\logs\$Tag-p.log"
"P exit=$LASTEXITCODE after $([int]((Get-Date) - $t0).TotalSeconds)s" | Out-File -Append -Encoding ascii "$S\logs\$Tag.head"
$t1 = Get-Date
& node --require $preload "$S\el2-after-extra.mjs" $wt "$S\runs\$Tag-x" *> "$S\logs\$Tag-x.log"
"X exit=$LASTEXITCODE after $([int]((Get-Date) - $t1).TotalSeconds)s" | Out-File -Append -Encoding ascii "$S\logs\$Tag.head"
Get-Content "$S\logs\$Tag-p.log"
Get-Content "$S\logs\$Tag-x.log"
Get-Content "$S\logs\$Tag.head"
