param([Parameter(Mandatory = $true)][string]$Label)
# Runs surface-probe-3c1.mjs inside both packed consumers of a label (npm, strict pnpm), each with
# its own HARDKAS_HOME, and keeps stdout/stderr per consumer under %TEMP%\hk-3c1.
$ErrorActionPreference = "Continue"
$scratch = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad"
$base = Join-Path $env:TEMP "hk-3c1"
foreach ($pm in @("npm", "pnpm")) {
  $dir = Join-Path $base "$Label\$pm-consumer"
  if (-not (Test-Path $dir)) { "$Label/${pm}: no consumer dir"; continue }
  Copy-Item (Join-Path $scratch "cut7-3c1\surface-probe-3c1.mjs") (Join-Path $dir "surface-probe-3c1.mjs") -Force
  $env:HARDKAS_HOME = Join-Path $base "$Label\$pm-hardkas-home"
  Push-Location $dir
  node surface-probe-3c1.mjs 1> (Join-Path $base "probe-$Label-$pm.json") 2> (Join-Path $base "probe-$Label-$pm.err")
  "$Label/${pm}: exit=$LASTEXITCODE"
  Pop-Location
}
Remove-Item Env:HARDKAS_HOME -ErrorAction SilentlyContinue
