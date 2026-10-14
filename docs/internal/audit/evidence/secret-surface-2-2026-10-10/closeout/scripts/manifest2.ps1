param(
  [Parameter(Mandatory = $true)][ValidateSet("code", "final")][string]$Mode,
  [Parameter(Mandatory = $true)][string]$Tag
)
# SECRET-SURFACE-2 · manifest of hk-ra's working tree, never touching its real index (a temporary index read from HEAD).
# Copy of cut46-event-ledger-2\manifest2.ps1 with this wave's evidence folder and patch name.
#  -Mode code : HEAD + the wave's code and tests WITHOUT its evidence folder -> code tree hash + per-path blobs (stable:
#               what the LEDGER records, since the LEDGER cannot hold the hash of a tree that contains itself).
#  -Mode final: the evidence folder's MANIFEST.sha256 (every file but itself), then HEAD + everything (code, tests,
#               evidence) -> the full tree hash the owner's commit must reproduce, the change list, blobs and the patch
#               (written by git itself with --output, byte for byte).
$ErrorActionPreference = "Stop"
$wt = "C:\Users\jrodr\AppData\Local\Temp\hk-ra\wt"
$S = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad\cut47-secret-surface-2"
$evRel = "docs/internal/audit/evidence/secret-surface-2-2026-10-10"
$out = Join-Path $S "manifest-$Mode-$Tag"
if (Test-Path $out) { throw "$out exists: pick a new tag" }
New-Item -ItemType Directory -Force $out | Out-Null

if ($Mode -eq "final") {
  # the evidence folder's own manifest first, so the full tree below contains it
  $ev = Join-Path $wt ($evRel -replace "/", "\")
  $manifest = Join-Path $ev "MANIFEST.sha256"
  if (Test-Path $manifest) { [System.IO.File]::Delete($manifest) }
  $rows = Get-ChildItem $ev -Recurse -File | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($ev.Length + 1).Replace("\", "/")
    "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower())  $rel"
  }
  [IO.File]::WriteAllText($manifest, (($rows -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
  "evidence files listed in MANIFEST.sha256: $($rows.Count)" | Out-File -Encoding ascii (Join-Path $out "evidence.txt")
}

$tmpIndex = Join-Path $out "index.tmp"
$env:GIT_INDEX_FILE = $tmpIndex
$env:GIT_OPTIONAL_LOCKS = "0"
$env:GIT_CONFIG_PARAMETERS = "'core.safecrlf=false'"
Push-Location $wt
try {
  git read-tree HEAD
  if ($Mode -eq "code") { git add -A -- . ":(exclude)$evRel" } else { git add -A }
  $tree = (git write-tree).Trim()
  $head = (git rev-parse HEAD).Trim()
  $headTree = (git rev-parse "HEAD^{tree}").Trim()
  "MODE=$Mode HEAD=$head HEAD_TREE=$headTree TREE=$tree" | Out-File -Encoding ascii (Join-Path $out "tree.txt")
  git diff-index --cached HEAD --name-status | Out-File -Encoding utf8 (Join-Path $out "changes.txt")
  $paths = @(git diff-index --cached HEAD --name-only)
  $lines = foreach ($p in $paths) {
    $stage = git ls-files --stage -- $p
    if ($stage) { $parts = $stage -split "\s+"; "$($parts[1])  $p" } else { "deleted  $p" }
  }
  $lines | Out-File -Encoding utf8 (Join-Path $out "MANIFEST.blobs")
  $patchName = if ($Mode -eq "final") { "secret-surface-2.patch" } else { "secret-surface-2-code.patch" }
  git diff --cached HEAD --binary --output="$(Join-Path $out $patchName)"
  "patch $patchName sha256 $((Get-FileHash (Join-Path $out $patchName) -Algorithm SHA256).Hash.ToLower())" | Out-File -Encoding ascii -Append (Join-Path $out "tree.txt")
  git diff --cached HEAD --stat | Select-Object -Last 1 | Out-File -Encoding utf8 (Join-Path $out "stat.txt")
} finally {
  Pop-Location
  $env:GIT_INDEX_FILE = $null
  $env:GIT_CONFIG_PARAMETERS = $null
  if (Test-Path $tmpIndex) { [System.IO.File]::Delete($tmpIndex) }
}
Get-Content (Join-Path $out "tree.txt")
Get-Content (Join-Path $out "stat.txt")
"paths: $($paths.Count)"
