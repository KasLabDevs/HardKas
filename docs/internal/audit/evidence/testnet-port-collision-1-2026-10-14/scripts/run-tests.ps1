# TESTNET-PORT-COLLISION-1: run vitest files in the isolated tree under the hermetic preload (loopback only), isolated HARDKAS_HOME.
#   run-tests.ps1 -Tag <tag> -Files <file1>,<file2>,...
param([Parameter(Mandatory = $true)][string]$Tag, [Parameter(Mandatory = $true)][string[]]$Files, [string]$Src = 'C:\Users\jrodr\hkl1\tpc\src')
$ErrorActionPreference = 'Continue'
$src = $Src
$logs = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$net = Join-Path $logs "$Tag.net.log"
if (Test-Path $net) { Remove-Item $net }
$env:HARDKAS_HOME = 'C:/Users/jrodr/hkl1/home'
$env:NODE_OPTIONS = ('--require=' + ($Src -replace '\\','/') + '/scripts/hermetic/no-network-preload.cjs')
$env:HARDKAS_HERMETIC_LOG = $net
$env:NO_COLOR = '1'
Push-Location $src
$t0 = Get-Date
$Files = @($Files | ForEach-Object { $_ -split "," } | Where-Object { $_ })
$fileArgs = ($Files | ForEach-Object { '"' + $_ + '"' }) -join ' '
cmd /d /c "npx vitest run $fileArgs --coverage.enabled=false --reporter=verbose --reporter=json --outputFile=`"$logs\$Tag.json`" > `"$logs\$Tag.log`" 2>&1"
$code = $LASTEXITCODE
Pop-Location
$secs = [int]((Get-Date) - $t0).TotalSeconds
$nonLoop = 0
if (Test-Path $net) { $nonLoop = (Get-Content $net | Where-Object { $_ -match 'REFUSED' } | Measure-Object).Count }
"$Tag exit=$code secs=$secs refusedNonLoopback=$nonLoop" | Tee-Object -FilePath (Join-Path $logs "$Tag.exit")
if (Test-Path "$logs\$Tag.json") {
  $j = Get-Content "$logs\$Tag.json" -Raw | ConvertFrom-Json
  "tests=$($j.numTotalTests) passed=$($j.numPassedTests) failed=$($j.numFailedTests) skipped=$($j.numPendingTests + $j.numTodoTests)"
  foreach ($f in $j.testResults) { foreach ($a in $f.assertionResults) { "{0,-7} {1}" -f $a.status, $a.fullName } }
}


