# SECURITY-INTEGRATION-1 stage 3: real isolated regression on the OWN simnet kaspad (hkl1-kaspad, host port 28210) with
# the integrated CLI. Never the canonical localnet, never testnet/mainnet. Positive golden path (CLI + SDK task) with an
# independent raw-RPC cross-check, then a testnet-10 workspace against the same simnet node (must be refused).
$ErrorActionPreference = 'Continue'
$base = 'C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\ecaf7e92-a2ba-49b0-aafc-c62b4cb5eda0\scratchpad\l1-reality-1'
$h = "$base\e1\hk.mjs"
$raw = "$base\e1\raw-rpc.mjs"
$runs = "$base\si\realnode"
New-Item -ItemType Directory -Force $runs | Out-Null
$env:HK_SRC = 'C:/Users/jrodr/hkl1/si/src'
$env:HK_RUNS = $runs
$env:HK_SHOW = '500'
$ws = 'C:\Users\jrodr\hkl1\e1\ws'
$node = 'ws://127.0.0.1:28210'
$bob = 'kaspasim:qz643ghkvjunedtsmjwqewfhpz6edcmsc79fyg2rv2y59439snz8qjvd629nv'
function Save-Raw([string]$tag, [string]$method, [string]$params = '{}') {
  $pf = Join-Path $runs "$tag.params.json"
  [IO.File]::WriteAllText($pf, $params, (New-Object Text.UTF8Encoding($false)))
  $out = node $raw $node $method "@$pf" 2>&1
  [IO.File]::WriteAllText((Join-Path $runs "$tag.json"), ($out -join "`n"), (New-Object Text.UTF8Encoding($false)))
  return ($out -join "`n")
}
function Out-Of([string]$tag) { (Get-Content (Join-Path $runs "$tag.json") -Raw | ConvertFrom-Json) }

'--- containers'
docker start hkl1-kaspad | Out-Null
docker start hkl1-miner | Out-Null
docker ps --filter name=hkl1 --format '{{.Names}} {{.Status}} {{.Ports}}'
$ready = $false
for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
  $si = Save-Raw 'raw-serverinfo' 'getServerInfo'
  if ($si -match '"isSynced"\s*:\s*true') { $ready = $true } else { Start-Sleep -Seconds 2 }
}
"node ready=$ready :: $si"
if (-not $ready) { 'STOP: node not ready'; exit 2 }

'--- positive golden path (CLI)'
node $h rn-balance $ws accounts balance alice --json
$t0 = Get-Date
node $h rn-plan $ws tx plan --from alice --to bob --amount 3 --json
$plan = Get-ChildItem "$ws\.hardkas\artifacts" -Filter *.plan.json | Where-Object { $_.LastWriteTime -ge $t0 } | Sort-Object LastWriteTime | Select-Object -Last 1
"plan: $($plan.Name)"
$t1 = Get-Date
node $h rn-sign $ws tx sign $plan.FullName --password-env HK_PW --json
$signed = Get-ChildItem "$ws\.hardkas\artifacts\signed" -Filter 'signedTx-*.json' | Where-Object { $_.LastWriteTime -ge $t1 } | Sort-Object LastWriteTime | Select-Object -Last 1
"signed: $($signed.Name)"
node $h rn-send $ws tx send $signed.FullName --json
$sendOut = (Out-Of 'rn-send').stdout
$txId = ([regex]'"txId"\s*:\s*"([0-9a-f]{64})"').Match($sendOut).Groups[1].Value
"txId: $txId"
if (-not $txId) { 'STOP: no txId'; exit 3 }
node $h rn-wait $ws tx wait $txId --until confirmed --timeout 180 --json

'--- independent cross-check (raw wRPC, no HardKAS code)'
$utxos = Save-Raw 'raw-utxos-bob' 'getUtxosByAddresses' ('{"addresses":["' + $bob + '"]}')
"bob holds an output of ${txId}: " + ($utxos -match $txId)
Save-Raw 'raw-dag' 'getBlockDagInfo' | Out-Null

'--- SDK path (task pay)'
node $h rn-task $ws task pay --network simnet --json

'--- negative: a testnet-10 workspace against the same simnet node'
$neg = 'C:\Users\jrodr\hkl1\si\realnode-neg'
if (Test-Path $neg) { node -e "require('fs').rmSync(process.argv[1],{recursive:true,force:true})" $neg }
node -e "require('fs').cpSync('C:/Users/jrodr/hkl1/e2/base','C:/Users/jrodr/hkl1/si/realnode-neg',{recursive:true})"
$cfg = 'export default { execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } }, network: { allowPublic: true }, experimental: true, networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: "ws://127.0.0.1:28210" } } };'
[IO.File]::WriteAllText("$neg\hardkas.config.ts", $cfg + "`n", (New-Object Text.UTF8Encoding($false)))
node $h rn-neg-balance $neg accounts balance alice --network testnet-10 --json
node $h rn-neg-plan $neg tx plan --network testnet-10 --from alice --to bob --amount 1 --json
# the simnet transaction signed above, handed to the testnet-10 workspace with the simnet node as explicit endpoint
node $h rn-neg-send $neg tx send $signed.FullName --url $node --yes --json
$negPlans = (Get-ChildItem "$neg\.hardkas" -Recurse -Filter *.plan.json -ErrorAction SilentlyContinue | Measure-Object).Count
$negSubs = (Get-ChildItem "$neg\.hardkas" -Recurse -Filter '*ubmission*' -ErrorAction SilentlyContinue | Measure-Object).Count
"negative workspace: plans written=$negPlans submission files=$negSubs"

'--- stop own containers'
docker stop -t 30 hkl1-miner | Out-Null
docker stop -t 30 hkl1-kaspad | Out-Null
docker ps -a --filter name=hkl1 --format '{{.Names}} {{.Status}}'
$nonLoop = 0
if (Test-Path "$runs\net.log") { $nonLoop = (Get-Content "$runs\net.log" | Where-Object { $_ -match 'REFUSED' } | Measure-Object).Count }
"refusedNonLoopback=$nonLoop"
'STAGE3 DONE'
