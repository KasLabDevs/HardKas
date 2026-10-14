# EA manifest: MANIFEST.sha256 of the evidence folder, code tree (no evidence), full tree, patch over e14138477.
param([Parameter(Mandatory = $true)][string]$Tag)
$ErrorActionPreference = 'Continue'
$src = 'C:\Users\jrodr\hkl1\ea\src'
$repo = 'C:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo'
$evRel = 'docs/internal/audit/evidence/endpoint-authority-1-2026-10-13'
$ev = Join-Path $src $evRel
$out = Join-Path $PSScriptRoot "manifest-$Tag"
New-Item -ItemType Directory -Force $out | Out-Null
$baseTree = (git -C $repo rev-parse 'e14138477^{tree}').Trim()

# 1. evidence manifest
$lines = Get-ChildItem $ev -Recurse -File | Where-Object { $_.Name -ne 'MANIFEST.sha256' } | Sort-Object FullName | ForEach-Object {
  $rel = $_.FullName.Substring($ev.Length + 1).Replace('\', '/')
  "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $rel
}
[IO.File]::WriteAllText((Join-Path $ev 'MANIFEST.sha256'), (($lines -join "`n") + "`n"))

# 2. trees with a temp index (the scratch repo's own index is untouched)
Push-Location $src
$env:GIT_INDEX_FILE = Join-Path $out 'index.tmp'
git read-tree $baseTree
git add -A -- packages scripts
$codeTree = (git write-tree).Trim()
git add -A -- $evRel
$fullTree = (git write-tree).Trim()
$paths = git diff --cached --name-status $baseTree
Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
git diff --binary $baseTree $fullTree | Set-Content -Encoding Byte -Path (Join-Path $out 'endpoint-authority-1.patch') -ErrorAction SilentlyContinue
cmd /d /c "git diff --binary $baseTree $fullTree > `"$out\endpoint-authority-1.patch`""
Pop-Location
$patchSha = (Get-FileHash (Join-Path $out 'endpoint-authority-1.patch') -Algorithm SHA256).Hash.ToLower()
$paths | Set-Content -Encoding utf8 (Join-Path $out 'paths.txt')
$codePaths = @($paths | Where-Object { $_ -notmatch [regex]::Escape($evRel) }).Count
$evPaths = @($paths | Where-Object { $_ -match [regex]::Escape($evRel) }).Count
$check = cmd /d /c "git -C `"$repo`" apply --check `"$out\endpoint-authority-1.patch`" 2>&1"
$checkCode = $LASTEXITCODE
$summary = @(
  "base commit e14138477 tree $baseTree",
  "CODE tree (packages only) $codeTree",
  "FULL tree (packages + evidence) $fullTree",
  "paths: $(@($paths).Count) = $codePaths code/test + $evPaths evidence",
  "patch sha256 $patchSha ($((Get-Item (Join-Path $out 'endpoint-authority-1.patch')).Length) bytes)",
  "apply --check on owner's checkout: exit $checkCode $check",
  "evidence MANIFEST.sha256 lines: $(@($lines).Count)"
)
$summary | Set-Content -Encoding utf8 (Join-Path $out 'SUMMARY.txt')
$summary
