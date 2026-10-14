# SECURITY-INTEGRATION-1 manifest: MANIFEST.sha256 of the integration's evidence folder (the three waves' folders are
# historical and untouched), code tree, full tree, ONE patch over e14138477 (NNI + EA + MG + integration), apply --check.
param([Parameter(Mandatory = $true)][string]$Tag)
$ErrorActionPreference = 'Continue'
$src = 'C:\Users\jrodr\hkl1\si\src'
$repo = 'C:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo'
$evRoot = 'docs/internal/audit/evidence'
$evRel = "$evRoot/security-integration-1-2026-10-13"
$ev = Join-Path $src $evRel
$out = Join-Path $PSScriptRoot "manifest-$Tag"
New-Item -ItemType Directory -Force $out | Out-Null
$baseTree = (git -C $repo rev-parse 'e14138477^{tree}').Trim()
$patch = Join-Path $out 'security-integration-1.patch'

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
  "base commit e14138477 tree $baseTree",
  "CODE tree (packages, scripts, docs/reference, apps/docs) $codeTree",
  "FULL tree (code + the four evidence folders) $fullTree",
  "paths: $(@($paths).Count) = $codePaths code/test/docs + $evPaths evidence ($siEvPaths of this integration)",
  "patch sha256 $patchSha ($((Get-Item $patch).Length) bytes)",
  "apply --check on owner's checkout: exit $checkCode $check",
  "evidence MANIFEST.sha256 lines: $(@($lines).Count)"
)
[IO.File]::WriteAllText((Join-Path $out 'SUMMARY.txt'), (($summary -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
$summary
