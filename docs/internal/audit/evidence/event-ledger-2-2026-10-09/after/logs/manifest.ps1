param([Parameter(Mandatory = $true)][string]$Tag)
# EVENT-LEDGER-2 · what the working tree of hk-ra holds, without touching its real index: a temporary index is read from
# HEAD, every change (tracked + untracked, not ignored) is staged into it, and from it come the tree hash, the per-path
# blob hashes (MANIFEST) and the patch. Also the sha256 of every file of the wave's evidence folder.
$ErrorActionPreference = "Stop"
$wt = "C:\Users\jrodr\AppData\Local\Temp\hk-ra\wt"
$S = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\178242cc-c0b4-4452-b344-f35b49dc3d1f\scratchpad\el2"
$out = Join-Path $S "manifest-$Tag"
New-Item -ItemType Directory -Force $out | Out-Null
$tmpIndex = Join-Path $out "index.tmp"
if (Test-Path $tmpIndex) { Remove-Item $tmpIndex -Force }
$env:GIT_INDEX_FILE = $tmpIndex
$env:GIT_OPTIONAL_LOCKS = "0"
Push-Location $wt
try {
  git read-tree HEAD
  git add -A
  $tree = (git write-tree).Trim()
  $head = (git rev-parse HEAD).Trim()
  $headTree = (git rev-parse "HEAD^{tree}").Trim()
  "HEAD=$head HEAD_TREE=$headTree WORKTREE_TREE=$tree" | Out-File -Encoding ascii (Join-Path $out "tree.txt")
  git diff-index --cached HEAD --name-status | Out-File -Encoding utf8 (Join-Path $out "changes.txt")
  $paths = @(git diff-index --cached HEAD --name-only)
  $lines = foreach ($p in $paths) {
    $stage = git ls-files --stage -- $p
    if ($stage) { $parts = $stage -split "\s+"; "blob $($parts[1]) $p" } else { "deleted $p" }
  }
  $lines | Out-File -Encoding utf8 (Join-Path $out "MANIFEST.blobs")
  git diff --cached HEAD --binary | Out-File -Encoding utf8 (Join-Path $out "event-ledger-2.patch")
  git diff --cached HEAD --stat | Out-File -Encoding utf8 (Join-Path $out "stat.txt")
} finally {
  Pop-Location
  Remove-Item Env:GIT_INDEX_FILE
}
# the evidence folder's own manifest (sha256 of every file, relative paths with forward slashes), written next to LEDGER.md
$ev = Join-Path $wt "docs\internal\audit\evidence\event-ledger-2-2026-10-09"
$manifest = Join-Path $ev "MANIFEST.sha256"
if (Test-Path $manifest) { Remove-Item $manifest }
$rows = Get-ChildItem $ev -Recurse -File | Sort-Object FullName | ForEach-Object {
  $rel = $_.FullName.Substring($ev.Length + 1).Replace("\", "/")
  "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower())  $rel"
}
[IO.File]::WriteAllText($manifest, (($rows -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
Get-Content (Join-Path $out "tree.txt")
Get-Content (Join-Path $out "stat.txt") | Select-Object -Last 3
"evidence files: $($rows.Count)"
