param(
  [string[]]$Tags = @("wa2-closeout-before-1", "wa2-closeout-after-1", "wa2-closeout-after-2", "wa2-related-a-3", "wa2-related-b-3", "wa2-related-b-4"),
  [string[]]$Extra = @("build-wa2-closeout-1.log", "build-wa2-closeout-2.log"),
  [switch]$Gate
)
# WORKSPACE-AUTHORITY-2 closeout: copy run logs, the final test files and the runner scripts into the evidence folder,
# re-encoded as UTF-8 without BOM (PowerShell 5.1 redirections write UTF-16LE / UTF-8 with BOM). Content untouched.
$ErrorActionPreference = "Stop"
$S = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad\cut48-workspace-authority-2"
$WT = "C:\Users\jrodr\AppData\Local\Temp\hk-ra\wt"
$EV = "$WT\docs\internal\audit\evidence\workspace-authority-2-2026-10-10"
$utf8 = New-Object System.Text.UTF8Encoding $false

function Copy-Text([string]$src, [string]$dst) {
  $text = [IO.File]::ReadAllText($src)   # BOM-aware (UTF-16LE / UTF-8 BOM / plain)
  [IO.File]::WriteAllText($dst, $text, $utf8)
  "  $(Split-Path $dst -Leaf) ($([IO.File]::ReadAllBytes($dst).Length) B)"
}

"logs -> after\logs"
foreach ($t in $Tags) {
  foreach ($ext in @("head", "status", "exit", "log", "json")) {
    $src = "$S\logs\$t.$ext"
    if (Test-Path $src) { Copy-Text $src "$EV\after\logs\$t.$ext" } else { "  MISSING $t.$ext" }
  }
}
foreach ($f in $Extra) { Copy-Text "$S\logs\$f" "$EV\after\logs\$f" }
if ($Gate) {
  foreach ($f in @("docker-before-wa2-gate-1.txt", "docker-after-wa2-gate-1.txt", "wa2-gate-1.env")) {
    if (Test-Path "$S\logs\$f") { Copy-Text "$S\logs\$f" "$EV\after\logs\$f" } else { "  MISSING $f" }
  }
}

"tests -> after\tests (final files)"
Copy-Text "$WT\packages\sdk\test\workspace-authority-2.test.ts" "$EV\after\tests\sdk-workspace-authority-2.test.ts"
Copy-Text "$WT\packages\cli\test\workspace-authority-2.test.ts" "$EV\after\tests\cli-workspace-authority-2.test.ts"

"scripts -> after\scripts"
foreach ($f in @("run-closeout-chain-2.ps1", "run-full-wt.ps1", "copy-closeout-evidence.ps1", "manifest2.ps1", "run-files-wt.ps1", "run-after-chain.ps1")) {
  if (Test-Path "$S\$f") { Copy-Text "$S\$f" "$EV\after\scripts\$f" } else { "  MISSING $f" }
}

"64-hex scan of the copied closeout files (every hit listed; expected: digests, constants, content hashes only)"
$files = @()
foreach ($t in $Tags) { $files += Get-ChildItem "$EV\after\logs\$t.*" }
foreach ($f in $Extra) { $files += Get-Item "$EV\after\logs\$f" }
$files += Get-Item "$EV\after\tests\sdk-workspace-authority-2.test.ts", "$EV\after\tests\cli-workspace-authority-2.test.ts"
foreach ($f in $files) {
  $hits = Select-String -Path $f.FullName -Pattern "[0-9a-f]{64}" -AllMatches
  $n = 0; $distinct = @{}
  foreach ($h in $hits) { foreach ($m in $h.Matches) { $n++; $distinct[$m.Value] = $true } }
  if ($n -gt 0) { "  $($f.Name): $n hits, $($distinct.Count) distinct" }
}
"done"
