param([Parameter(Mandatory = $true)][string]$GateTag)
# EVENT-LEDGER-2 closeout · copies the closeout's reports, patches, scripts and run logs (both rounds, the JSON-contract
# check and the final full gate) into the wave's evidence folder, under closeout/. Run after the gate has finished and
# after the final incremental patch (round 2) has been recomputed. Never touches code.
$ErrorActionPreference = "Stop"
$wt = "C:\Users\jrodr\AppData\Local\Temp\hk-ra\wt"
$S = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad\cut46-event-ledger-2"
$ev = Join-Path $wt "docs\internal\audit\evidence\event-ledger-2-2026-10-09\closeout"
foreach ($d in @("round-1", "round-2", "logs", "scripts")) { New-Item -ItemType Directory -Force (Join-Path $ev $d) | Out-Null }

# round 1: report, incremental patch against the EL-2 tree ac80a9a8, its change list and blobs
Copy-Item "$S\closeout\EL2-CLOSEOUT-4-POINTS.md" "$ev\round-1\" -Force
Copy-Item "$S\closeout\closeout-incremental.patch" "$ev\round-1\" -Force
Copy-Item "$S\closeout\incremental-changes.txt", "$S\closeout\incremental-blobs.txt", "$S\closeout\incremental-tree.txt" "$ev\round-1\" -Force

# round 2: report, incremental patch against the round-1 tree b5e9fde9 (code and tests only), its change list and blobs
Copy-Item "$S\closeout2\EL2-FINAL-CLOSEOUT.md" "$ev\round-2\" -Force
Copy-Item "$S\closeout2\final-closeout-incremental.patch" "$ev\round-2\" -Force
Copy-Item "$S\closeout2\final-changes.txt", "$S\closeout2\final-blobs.txt", "$S\closeout2\final-tree.txt" "$ev\round-2\" -Force

# scripts: the runners and the manifest script as used
Copy-Item "$S\run-files-wt.ps1", "$S\run-full-wt.ps1", "$S\manifest2.ps1", "$S\closeout2\copy-evidence.ps1" "$ev\scripts\" -Force

# logs: every closeout run (both results of a repeated run are kept), the builds, the JSON-contract check, the gate
$tags = @("cl-before-1", "cl-after-1", "fc-before-1", "fc-before-2", "fc-after-1", "fc-after-2", "fc-after-3", "fc-related-1", "fc-related-2", "fc-json-1", "fc-json-2", $GateTag)
foreach ($t in $tags) {
  Get-ChildItem "$S\logs" -File -Filter "$t.*" | Where-Object { $_.Name -ne "$t.pid" } | Copy-Item -Destination "$ev\logs\" -Force
}
Get-ChildItem "$S\logs" -File | Where-Object { $_.Name -match "^(build-closeout-1|build-final-(before|after)-\d)\.log$" -or $_.Name -match "^docker-(before|after)-$GateTag\.txt$" } | Copy-Item -Destination "$ev\logs\" -Force

"copied into $ev"
Get-ChildItem $ev -Recurse -File | ForEach-Object { "{0,-60} {1,10}" -f $_.FullName.Substring($ev.Length + 1), $_.Length }
