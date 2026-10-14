# TASK-EVIDENCE-UNBOUND-1 · step 3 (after SECURITY-INTEGRATION-1 is published and this wave is integrated on it):
# real Golden Path on the OWN simnet kaspad (hkl1-kaspad, host 28210). Never the canonical localnet, never testnet/mainnet.
#   task paycheck --evidence (plan, sign, send, observe until CONFIRMED)  ->  evidence verify --json  ->  raw wRPC cross-check
# Three results kept SEPARATE in the report: (1) the package verdict, (2) the RPC observation the package carries,
# (3) the independent raw-wRPC check of the node's state. None of them alone is "payment proven".
param([Parameter(Mandatory = $true)][string]$Src, [string]$Tag = 'rn-1')
$ErrorActionPreference = 'Continue'
$base = 'C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\ecaf7e92-a2ba-49b0-aafc-c62b4cb5eda0\scratchpad\l1-reality-1'
$h = "$base\e1\hk.mjs"
$raw = "$base\e1\raw-rpc.mjs"
$runs = "$base\teu\realnode\$Tag"
New-Item -ItemType Directory -Force $runs | Out-Null
$env:HK_SRC = ($Src -replace '\\', '/')
$env:HK_RUNS = $runs
$env:HK_SHOW = '400'
$node = 'ws://127.0.0.1:28210'
$bob = 'kaspasim:qz643ghkvjunedtsmjwqewfhpz6edcmsc79fyg2rv2y59439snz8qjvd629nv'
$ws = 'C:\Users\jrodr\hkl1\teu\realnode-ws'
function Save-Raw([string]$tag, [string]$method, [string]$params = '{}') {
  $pf = Join-Path $runs "$tag.params.json"
  [IO.File]::WriteAllText($pf, $params, (New-Object Text.UTF8Encoding($false)))
  $out = node $raw $node $method "@$pf" 2>&1
  [IO.File]::WriteAllText((Join-Path $runs "$tag.json"), ($out -join "`n"), (New-Object Text.UTF8Encoding($false)))
  return ($out -join "`n")
}

'--- workspace: a copy of the E1'' workspace (its keystores), with a task that observes its own payment'
if (-not (Test-Path $ws)) { node -e "require('fs').cpSync('C:/Users/jrodr/hkl1/e1/ws','C:/Users/jrodr/hkl1/teu/realnode-ws',{recursive:true})" }
$cfg = @'
// TEU step 3 workspace (test only): own simnet kaspad `hkl1-kaspad` on 127.0.0.1:28210. Not the canonical localnet.
export default {
  execution: { default: "e1", targets: { e1: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
  network: { allowPublic: false },
  experimental: false,
  networks: { simnet: { kind: "kaspa-rpc", network: "simnet", rpcUrl: "ws://127.0.0.1:28210" } },
  tasks: {
    paycheck: {
      description: "pay alice -> bob, then observe the payment until the node reports it CONFIRMED (bounded)",
      params: { amount: { type: "string", description: "KAS", defaultValue: "1", isOptional: true } },
      actionFn: async (args, hk) => {
        const plan = await hk.tx.plan({ from: "alice", to: "bob", amount: String(args.amount ?? "1") });
        const signed = await hk.tx.sign(plan, { account: "alice", keystorePassword: process.env.HK_PW });
        const sent = await hk.tx.send(signed);
        const txId = sent?.txId ?? signed.txId;
        let last;
        for (let i = 0; i < 40; i++) {
          last = await hk.tx.observe(txId, { maxBatches: 4 });
          if (/CONFIRMED|FINALIZED/.test(String(last?.derived?.status ?? ""))) break;
          await new Promise((r) => setTimeout(r, 3000));
        }
        return { txId, planHash: plan.contentHash, signedHash: signed.contentHash, lastObservation: last?.observation?.contentHash ?? null, derived: String(last?.derived?.status ?? "none") };
      }
    }
  }
};
'@
[IO.File]::WriteAllText("$ws\hardkas.config.ts", $cfg, (New-Object Text.UTF8Encoding($false)))

'--- containers (own; the miner starts once the node listens)'
docker start hkl1-kaspad | Out-Null
$ready = $false
for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
  $si = Save-Raw 'raw-serverinfo-0' 'getServerInfo'
  if ($si -match '"networkId"\s*:\s*"simnet"') { $ready = $true } else { Start-Sleep -Seconds 2 }
}
docker start hkl1-miner | Out-Null
$synced = $false
for ($i = 0; $i -lt 60 -and -not $synced; $i++) {
  $si = Save-Raw 'raw-serverinfo' 'getServerInfo'
  if ($si -match '"isSynced"\s*:\s*true') { $synced = $true } else { Start-Sleep -Seconds 2 }
}
docker ps --filter name=hkl1 --format '{{.Names}} {{.Status}}'
"node synced=$synced"
if (-not $synced) { 'STOP: node not synced'; docker stop -t 30 hkl1-miner | Out-Null; docker stop -t 30 hkl1-kaspad | Out-Null; exit 2 }

'--- (1) the task: payment + its own observations, sealed and packed'
node $h "$Tag-task" $ws task paycheck --network simnet --evidence --json
$taskOut = (Get-Content (Join-Path $runs "$Tag-task.json") -Raw | ConvertFrom-Json).stdout
$txId = ([regex]'"txId"\s*:\s*"([0-9a-f]{64})"').Match($taskOut).Groups[1].Value
"txId: $txId"

'--- (2) the package verdict (integrity, membership, lineage) — and, separately, the RPC observation it carries'
node $h "$Tag-verify-json" $ws evidence verify "$ws\paycheck.hke.json" --json
node $h "$Tag-verify-human" $ws evidence verify "$ws\paycheck.hke.json"

'--- (3) independent check of the node state (raw wRPC, no HardKAS code)'
$utxos = Save-Raw 'raw-utxos-bob' 'getUtxosByAddresses' ('{"addresses":["' + $bob + '"]}')
"node holds an output of $txId for bob: " + ($txId -and ($utxos -match $txId))
Save-Raw 'raw-dag' 'getBlockDagInfo' | Out-Null

'--- stop own containers'
docker stop -t 30 hkl1-miner | Out-Null
docker stop -t 30 hkl1-kaspad | Out-Null
docker ps -a --filter name=hkl1 --format '{{.Names}} {{.Status}}'
$nonLoop = 0
if (Test-Path "$runs\net.log") { $nonLoop = (Get-Content "$runs\net.log" | Where-Object { $_ -match 'REFUSED' } | Measure-Object).Count }
"refusedNonLoopback=$nonLoop"
'REALNODE DONE'
