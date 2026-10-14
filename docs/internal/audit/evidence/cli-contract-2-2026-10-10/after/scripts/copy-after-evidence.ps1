param(
  [string[]]$Tags = @("cc2a-after-1", "cc2a-related-1", "cc2a-after-2"),
  [string[]]$Extra = @("build-cc2a-1.log", "cc2a-after-1.failures.txt")
)
# CLI-CONTRACT-2A · copy the AFTER run logs, the two test files as they stand after the wave and the runner scripts into
# the evidence folder's after/, re-encoded as UTF-8 without BOM (PowerShell 5.1 redirections write UTF-16LE / UTF-8 with
# BOM). Content untouched. Then a 64-hex scan of everything copied (expected: digests, ids, content hashes only).
$ErrorActionPreference = "Stop"
$S = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad\cut49-cli-contract-2"
$WT = "C:\Users\jrodr\AppData\Local\Temp\hk-ra\wt"
$EV = "$WT\docs\internal\audit\evidence\cli-contract-2-2026-10-10"
$utf8 = New-Object System.Text.UTF8Encoding $false
foreach ($d in @("after\tests", "after\logs", "after\scripts")) { New-Item -ItemType Directory -Force (Join-Path $EV $d) | Out-Null }

function Copy-Text([string]$src, [string]$dst) {
  $text = [IO.File]::ReadAllText($src)   # BOM-aware (UTF-16LE / UTF-8 BOM / plain)
  [IO.File]::WriteAllText($dst, $text, $utf8)
  "  $(Split-Path $dst -Leaf) ($([IO.File]::ReadAllBytes($dst).Length) B)"
}

"runs -> after\logs"
foreach ($t in $Tags) {
  foreach ($ext in @("head", "status", "exit", "log", "json")) {
    $src = "$S\logs\$t.$ext"
    if (Test-Path $src) { Copy-Text $src "$EV\after\logs\$t.$ext" } else { "  MISSING $t.$ext" }
  }
}
foreach ($f in $Extra) { if (Test-Path "$S\logs\$f") { Copy-Text "$S\logs\$f" "$EV\after\logs\$f" } else { "  MISSING $f" } }

"tests -> after\tests (the files as they stand after the wave)"
Copy-Text "$WT\packages\cli\test\cli-contract-2a.test.ts" "$EV\after\tests\cli-contract-2a.test.ts"
Copy-Text "$WT\packages\cli\test\cli-contract-2.test.ts" "$EV\after\tests\cli-contract-2.test.ts"

"scripts -> after\scripts"
foreach ($f in @("run-after-chain-cc2a.ps1", "manifest-cc2.ps1", "copy-after-evidence.ps1", "run-files-wt.ps1")) {
  if (Test-Path "$S\$f") { Copy-Text "$S\$f" "$EV\after\scripts\$f" } else { "  MISSING $f" }
}

"64-hex scan of the copied files (every hit listed; expected: digests, ids, content hashes only)"
foreach ($f in (Get-ChildItem "$EV\after" -Recurse -File)) {
  $hits = Select-String -Path $f.FullName -Pattern "[0-9a-f]{64}" -AllMatches
  $n = 0; $distinct = @{}
  foreach ($h in $hits) { foreach ($m in $h.Matches) { $n++; $distinct[$m.Value] = $true } }
  if ($n -gt 0) { "  $($f.Name): $n hits, $($distinct.Count) distinct" }
}
"done"
