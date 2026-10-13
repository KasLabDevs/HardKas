param(
  [string[]]$Tags = @("cc2-before-1"),
  [string[]]$Runs = @("test-2", "sweep-2")
)
# CLI-CONTRACT-2 · investigation + BEFORE: copy the vitest run logs, the BEFORE test file, the probe results and the
# runner scripts into the evidence folder, re-encoded as UTF-8 without BOM (PowerShell 5.1 redirections write UTF-16LE /
# UTF-8 with BOM). Content untouched. Then a 64-hex scan of everything copied (expected: digests and ids only).
$ErrorActionPreference = "Stop"
$S = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad\cut49-cli-contract-2"
$P = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad\cut43-mini-reaudit-1\probes"
$WT = "C:\Users\jrodr\AppData\Local\Temp\hk-ra\wt"
$EV = "$WT\docs\internal\audit\evidence\cli-contract-2-2026-10-10"
$utf8 = New-Object System.Text.UTF8Encoding $false
foreach ($d in @("before\tests", "before\logs", "before\probes", "before\scripts")) { New-Item -ItemType Directory -Force (Join-Path $EV $d) | Out-Null }

function Copy-Text([string]$src, [string]$dst) {
  $text = [IO.File]::ReadAllText($src)   # BOM-aware (UTF-16LE / UTF-8 BOM / plain)
  [IO.File]::WriteAllText($dst, $text, $utf8)
  "  $(Split-Path $dst -Leaf) ($([IO.File]::ReadAllBytes($dst).Length) B)"
}

"vitest runs -> before\logs"
foreach ($t in $Tags) {
  foreach ($ext in @("head", "status", "exit", "log", "json", "failures.txt")) {
    $src = "$S\logs\$t.$ext"
    if (Test-Path $src) { Copy-Text $src "$EV\before\logs\$t.$ext" } else { "  MISSING $t.$ext" }
  }
}
foreach ($f in @("manual-A4.txt")) { if (Test-Path "$S\logs\$f") { Copy-Text "$S\logs\$f" "$EV\before\logs\$f" } else { "  MISSING $f" } }

"tests -> before\tests"
Copy-Text "$WT\packages\cli\test\cli-contract-2.test.ts" "$EV\before\tests\cli-contract-2.test.ts"

"probes -> before\probes (results, driver logs, the batteries as run)"
foreach ($r in $Runs) {
  if (Test-Path "$S\runs\$r\results.json") { Copy-Text "$S\runs\$r\results.json" "$EV\before\probes\$r-results.json" } else { "  MISSING runs\$r\results.json" }
  if (Test-Path "$S\runs\$r\network.log") { Copy-Text "$S\runs\$r\network.log" "$EV\before\probes\$r-network.log" }
  foreach ($ext in @("log", "exit")) { if (Test-Path "$S\logs\$r.$ext") { Copy-Text "$S\logs\$r.$ext" "$EV\before\probes\$r.$ext" } else { "  MISSING logs\$r.$ext" } }
}
foreach ($f in @("harness.mjs", "adv-test.mjs", "adv-sweep.mjs")) { Copy-Text "$P\$f" "$EV\before\probes\$f" }

"scripts -> before\scripts"
foreach ($f in @("run-files-wt.ps1", "run-probe.ps1", "copy-before-evidence.ps1")) { Copy-Text "$S\$f" "$EV\before\scripts\$f" }

"64-hex scan of the copied files (every hit listed; expected: digests, ids, content hashes only)"
foreach ($f in (Get-ChildItem "$EV\before" -Recurse -File)) {
  $hits = Select-String -Path $f.FullName -Pattern "[0-9a-f]{64}" -AllMatches
  $n = 0; $distinct = @{}
  foreach ($h in $hits) { foreach ($m in $h.Matches) { $n++; $distinct[$m.Value] = $true } }
  if ($n -gt 0) { "  $($f.Name): $n hits, $($distinct.Count) distinct" }
}
"done"
