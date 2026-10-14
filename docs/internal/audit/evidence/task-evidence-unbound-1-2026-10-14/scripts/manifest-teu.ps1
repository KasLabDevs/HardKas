# TASK-EVIDENCE-UNBOUND-1 manifest: MANIFEST.sha256 of its evidence folder, code tree, full tree, ONE patch over the
# SECURITY-INTEGRATION-1 tree 64d9b986 (e14138477 + patch 1d12fe26), apply --check on the owner's checkout (read-only).
param([Parameter(Mandatory = $true)][string]$Tag)
$ErrorActionPreference = 'Continue'
$src = 'C:\Users\jrodr\hkl1\teu\src'
$repo = 'C:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo'
$evRoot = 'docs/internal/audit/evidence'
$evRel = "$evRoot/task-evidence-unbound-1-2026-10-14"
$ev = Join-Path $src $evRel
$out = Join-Path $PSScriptRoot "manifest-$Tag"
New-Item -ItemType Directory -Force $out | Out-Null
$baseTree = '64d9b986e7e2baf3a4bce369c23717af48639f71'
$patch = Join-Path $out 'task-evidence-unbound-1.patch'

# 1. evidence manifest (this integration's folder only)
$lines = Get-ChildItem $ev -Recurse -File | Where-Object { $_.Name -ne 'MANIFEST.sha256' } | Sort-Object FullName | ForEach-Object {
  $rel = $_.FullName.Substring($ev.Length + 1).Replace('\', '/')
  "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $rel
}
[IO.File]::WriteAllText((Join-Path $ev 'MANIFEST.sha256'), (($lines -join "`n") + "`n"))

# 2. trees with a temp index (the scratch repo's own index is untouched)
Push-Location $src
$env:GIT_INDEX_FILE = Join-Path $out 'index.tmp'
git read-tree $baseTree
git add -A -- packages scripts docs/reference apps/docs
$codeTree = (git write-tree).Trim()
git add -A -- $evRoot
$fullTree = (git write-tree).Trim()
$paths = git -c core.quotepath=off diff --cached --name-status $baseTree
Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
cmd /d /c "git diff --binary $baseTree $fullTree > `"$patch`""
Pop-Location
$patchSha = (Get-FileHash $patch -Algorithm SHA256).Hash.ToLower()
[IO.File]::WriteAllText((Join-Path $out 'paths.txt'), (($paths -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
$evPaths = @($paths | Where-Object { $_ -match [regex]::Escape($evRoot) }).Count
$siEvPaths = @($paths | Where-Object { $_ -match [regex]::Escape($evRel) }).Count
$codePaths = @($paths).Count - $evPaths
$check = cmd /d /c "git -C `"$repo`" apply --check `"$patch`" 2>&1"
$checkCode = $LASTEXITCODE
$summary = @(
  "base: SECURITY-INTEGRATION-1 tree $baseTree (e14138477 + 1d12fe26)",
  "CODE tree (packages, scripts, docs/reference, apps/docs) $codeTree",
  "FULL tree (code + evidence) $fullTree",
  "paths: $(@($paths).Count) = $codePaths code/test/docs + $evPaths evidence ($siEvPaths of this integration)",
  "patch sha256 $patchSha ($((Get-Item $patch).Length) bytes)",
  "apply --check on owner's checkout: exit $checkCode $check",
  "evidence MANIFEST.sha256 lines: $(@($lines).Count)"
)
[IO.File]::WriteAllText((Join-Path $out 'SUMMARY.txt'), (($summary -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
$summary
