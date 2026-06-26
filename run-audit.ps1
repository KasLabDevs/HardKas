$ErrorActionPreference = "Continue"

$CliPath = "node c:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo\packages\cli\dist\index.js"

if (!(Test-Path tmp-audit)) {
    mkdir tmp-audit | Out-Null
}
cd tmp-audit

function RunCmd($name, $cmd) {
    Write-Output "==== $name ===="
    Write-Output "> $cmd"
    Invoke-Expression "$cmd" 2>&1
    Write-Output "EXIT_CODE: $LASTEXITCODE"
    Write-Output "========================="
    Write-Output ""
}

RunCmd "Init" "$CliPath init ."
RunCmd "Fund" "$CliPath accounts fund alice --amount 1000"
RunCmd "Send" "$CliPath tx send --from alice --to bob --amount 10 --network simulated --yes"
RunCmd "Plan" "$CliPath tx plan --from alice --to bob --amount 10 --network simulated --out tx-plan.json"
RunCmd "Inspect" "$CliPath artifact inspect tx-plan.json"
RunCmd "Verify" "$CliPath artifact verify tx-plan.json --strict"
RunCmd "Sign" "$CliPath tx sign tx-plan.json --account alice --out tx-signed.json"
RunCmd "Send Artifact" "$CliPath tx send tx-signed.json --network simulated --yes"

# Also let's test the your-first-test.md commands
RunCmd "Test" "npx vitest run --passWithNoTests" # "npx hardkas test" under the hood? The doc says "npx hardkas test"
RunCmd "Test Command" "$CliPath test"
RunCmd "Test Evidence" "$CliPath test --evidence"
RunCmd "Test Evidence Verify" "$CliPath evidence verify dummy.hke.json" # Will fail but let's see if the command exists

# Programmability Builder Surface
RunCmd "Prog Capabilities" "$CliPath programmability capabilities --json"
RunCmd "Prog Corpus Verify" "$CliPath programmability corpus verify fixtures/toccata-v2 --json"
RunCmd "Prog Inspect" "$CliPath programmability inspect somepath --kind silver --json"
RunCmd "Prog App Plan" "$CliPath programmability app plan --kind full-lab --json"

# ZK corpus surfaces
RunCmd "ZK Capabilities" "$CliPath zk capabilities --json"
RunCmd "ZK Proof Inspect" "$CliPath zk proof inspect somepath --json"
RunCmd "ZK Proof Verify" "$CliPath zk proof verify-local somepath --json"
RunCmd "ZK Corpus Verify" "$CliPath zk corpus verify fixtures/toccata-v2/zk --json"

# vProgs inspect surfaces
RunCmd "vProgs Capabilities" "$CliPath vprogs capabilities --json"
RunCmd "vProgs Status" "$CliPath vprogs status --json"
RunCmd "vProgs Inspect" "$CliPath vprogs inspect somepath --json"

