# CLI-CONTRACT-2 · runs one probe script (the mini re-audit batteries in cut43-mini-reaudit-1\probes, unchanged) against
# the worktree in the hermetic environment: Docker unreachable, the localnet ports and 8545 refused even on loopback, no
# non-loopback network (the preload), a private HARDKAS_HOME copy made by the harness under the run directory. Every run
# gets a new run directory under cut49-cli-contract-2\runs: none is ever replaced.
# usage: run-probe.ps1 -Script <file.mjs> -Run <name> [-Extra <args...>]
param([Parameter(Mandatory)][string]$Script, [Parameter(Mandatory)][string]$Run, [string[]]$Extra = @())
$wt = "$env:TEMP\hk-ra\wt"
$b = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad\cut49-cli-contract-2"
$runDir = Join-Path $b "runs\$Run"
if (Test-Path $runDir) { throw "run $Run exists: keep every run, pick a new name" }
$log = Join-Path $b "logs\$Run.log"
$env:HARDKAS_HERMETIC_LOG = Join-Path $b "logs\$Run-driver-net.log"
$env:HARDKAS_HERMETIC_DENY_PORTS = "16210,17210,18210,16110,17110,18110,8545"
$env:DOCKER_HOST = "tcp://127.0.0.1:1"
$env:NO_COLOR = "1"
$env:NODE_ENV = $null
$env:HARDKAS_EXPERIMENTAL = $null
$hkBefore = Test-Path "C:\.hardkas"
$head = (git -C $wt rev-parse HEAD).Trim()
$t0 = Get-Date
Push-Location (Split-Path -Parent $Script)
& node --require "$wt\scripts\hermetic\no-network-preload.cjs" $Script $wt $runDir @Extra *> $log
$exit = $LASTEXITCODE
Pop-Location
$ms = [int]((Get-Date) - $t0).TotalMilliseconds
"[$Run] HEAD=$head exit=$exit ms=$ms C:\.hardkas before=$hkBefore after=$(Test-Path 'C:\.hardkas')" | Tee-Object -FilePath (Join-Path $b "logs\$Run.exit")
