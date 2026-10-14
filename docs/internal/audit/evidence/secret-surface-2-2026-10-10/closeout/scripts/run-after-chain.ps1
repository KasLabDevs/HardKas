# SECRET-SURFACE-2 closing round: the focused AFTER (three files) and then the related set of ss2-related-1 (the same
# file list, read back from that run's own command line), each through run-files-wt.ps1 (hermetic, logged, kept).
$ErrorActionPreference = "Continue"
$S = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad\cut47-secret-surface-2"
$wt = "C:\Users\jrodr\AppData\Local\Temp\hk-ra\wt"

$focused = "packages/cli/test/secret-surface-2.test.ts,packages/core/test/secret-surface-2.test.ts,packages/cli/test/secret-surface-2-wallet-create.test.ts"
Write-Output "===== ss2-after-3 (focused) ====="
& powershell -NoProfile -ExecutionPolicy Bypass -File "$S\run-files-wt.ps1" -Repo $wt -Tag "ss2-after-3" -Files $focused 2>&1 | Select-Object -Last 30

$cmdLine = (Select-String -Path "$S\logs\ss2-related-1.log" -Pattern "gate-hermetic: vitest run" | Select-Object -First 1).Line
$related = @(($cmdLine -split "\s+") | Where-Object { $_ -like "packages/*" }) -join ","
Write-Output "===== ss2-related-2 (related; $((($related -split ',') | Measure-Object).Count) files) ====="
Write-Output $related
& powershell -NoProfile -ExecutionPolicy Bypass -File "$S\run-files-wt.ps1" -Repo $wt -Tag "ss2-related-2" -Files $related 2>&1 | Select-Object -Last 30
