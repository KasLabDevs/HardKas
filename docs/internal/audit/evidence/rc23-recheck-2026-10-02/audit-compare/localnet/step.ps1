param([string]$Label, [string]$Cwd, [Parameter(ValueFromRemainingArguments=$true)][string[]]$HkArgs)
$w = "C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet"
$env:HARDKAS_HOME = "$w\hkhome"
$hk = "C:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo\packages\cli\dist\index.js"
if (-not $Cwd) { $Cwd = "$w\proj" }
Set-Location $Cwd
$start = Get-Date
$out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
$code = $LASTEXITCODE
$secs = [int]((Get-Date) - $start).TotalSeconds
$entry = "`n### $Label`n``hardkas $($HkArgs -join ' ')`` (cwd $Cwd) -> exit $code, ${secs}s`n``````text`n$($out.TrimEnd())`n```````n"
Add-Content -Path "$w\LOG.md" -Value $entry -Encoding utf8
Write-Output $out
Write-Output "EXIT=$code (${secs}s)"
