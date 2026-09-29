# Localnet guide re-verification (2026-10-02, HEAD 0f4c2f26b, CLI 0.12.0-rc.26)

Step 0: hardkas init proj -> exit 0; kaspa-wasm 2.1.0 bootstrapped into fresh HARDKAS_HOME (SHA-256 checked).

### 1a localnet start
`hardkas localnet start --profile toccata-v2` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 14s
```text
  ✔ TOCCATA_NODE_READY
  ℹ Image: kaspanet/rusty-kaspad:v2.1.0@sha256:f85da74b9514584451f83a2cbea3aa93f700248302fe7e3e0ab17288f93c905b
  ℹ Container: hardkas-kaspad-toccata-v2
  ℹ RPC: http://127.0.0.1:18210
```


### 1b localnet status
`hardkas localnet status` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text

  ═══ HardKAS Toccata Localnet ═══
  ℹ Node:  TOCCATA_NODE_READY
  ℹ Miner: TOCCATA_MINER_STOPPED
  ℹ Identity: VERIFIED (hardkas-kaspad-toccata-v2, sha256:f85da74b9514…)
  ℹ Version: 2.1.0
  ℹ DAA: 0
```


docker ps after start: hardkas-kaspad-toccata-v2|127.0.0.1:16210->16210/tcp, 127.0.0.1:17210->17210/tcp, 127.0.0.1:18210->18210/tcp

### 2a accounts real generate alice_real
`hardkas accounts real generate --name alice_real --network simnet` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 2s
```text
[?25h[36m?[39m [1mEnter password to encrypt 1 new account(s):[22m [2m»[22m
```


### 2b accounts real generate bob_real
`hardkas accounts real generate --name bob_real --network simnet` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 2s
```text
[?25h[36m?[39m [1mEnter password to encrypt 1 new account(s):[22m [2m»[22m
```


### 2c accounts list (after verbatim generate)
`hardkas accounts list` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 2s
```text
HardKAS accounts

alice        kaspa:sim_alice          (synthetic)
bob          kaspa:sim_bob            (synthetic)
carol        kaspa:sim_carol          (synthetic)
dave         kaspa:sim_dave           (synthetic)
erin         kaspa:sim_erin           (synthetic)
```


### 2d WORKAROUND generate alice_real --password-env
`hardkas accounts real generate --name alice_real --network simnet --password-env HK_PW` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text
Generated 1 real dev account(s)

WARNING: Development keys only. Do not use on mainnet.

Name:    alice_real
Address: kaspasim:qpy3m8qaht4850d43zrqse4vczlm3cyrnhn8ua0593a47yz65qk4ymk7zskqp
Private: yes (masked)
```


### 2e WORKAROUND generate bob_real --password-env
`hardkas accounts real generate --name bob_real --network simnet --password-env HK_PW` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text
Generated 1 real dev account(s)

WARNING: Development keys only. Do not use on mainnet.

Name:    bob_real
Address: kaspasim:qrced0xr3qakt9y6jpme78ewgrk0v79gd9uy5qee9nq42jhv5jtz6mgpp7w6g
Private: yes (masked)
```


### 2f accounts list
`hardkas accounts list` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 2s
```text
HardKAS accounts

alice        kaspa:sim_alice          (synthetic)
bob          kaspa:sim_bob            (synthetic)
carol        kaspa:sim_carol          (synthetic)
dave         kaspa:sim_dave           (synthetic)
erin         kaspa:sim_erin           (synthetic)
alice_real   kaspasim:qpy3m8qaht4850d43zrqse4vczlm3cyrnhn8ua0593a47yz65qk4ymk7zskqp (kaspa) (encrypted)
bob_real     kaspasim:qrced0xr3qakt9y6jpme78ewgrk0v79gd9uy5qee9nq42jhv5jtz6mgpp7w6g (kaspa) (encrypted)
```


### 3a localnet fund alice_real --amount 100
`hardkas localnet fund alice_real --amount 100` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 33s
```text
  ✔ TOCCATA_ACCOUNT_FUNDED
  ℹ Address: kaspasim:qpy3m8qaht4850d43zrqse4vczlm3cyrnhn8ua0593a47yz65qk4ymk7zskqp
  ℹ Mature balance: 1280000000000 sompi
```


### 3b localnet status after fund
`hardkas localnet status` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text

  ═══ HardKAS Toccata Localnet ═══
  ℹ Node:  TOCCATA_NODE_READY
  ℹ Miner: TOCCATA_MINER_STOPPED
  ℹ Identity: VERIFIED (hardkas-kaspad-toccata-v2, sha256:f85da74b9514…)
  ℹ Version: 2.1.0
  ℹ DAA: 1302
```


### AUD-25 accounts balance alice_real
`hardkas accounts balance alice_real --network simnet` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 2s
```text

Account:  alice_real
Address:  kaspasim:qpy3m8qaht4850d43zrqse4vczlm3cyrnhn8ua0593a47yz65qk4ymk7zskqp
Balance:  61900 KAS
UTXOs:    1085
Network:  simnet
```


### AUD-25 accounts balance alice_real --json
`hardkas accounts balance alice_real --network simnet --json` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text
{
  "ok": true,
  "command": "accounts balance",
  "mode": "cli",
  "result": {
    "name": "alice_real",
    "address": "kaspasim:qpy3m8qaht4850d43zrqse4vczlm3cyrnhn8ua0593a47yz65qk4ymk7zskqp",
    "balanceSompi": "6190000000000",
    "utxoCount": 1085,
    "network": "simnet"
  }
}
```


### 4a tx plan
`hardkas tx plan --from alice_real --to bob_real --amount 10 --network simnet --out plan.json` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text
HardKAS Transaction Plan Artifact (v2)
======================================
Plan ID:      plan-128c81ed67d1597f
Version:      1.0.0-alpha
Hash:         128c81ed67d1597f248f88fa9d5490a0af13c66b78c6f11d2280354f148e885a
Created:      2026-10-02T19:58:47.075Z

Network:      simnet
Mode:         localnet

From:         kaspasim:qpy3m8qaht4850d43zrqse4vczlm3cyrnhn8ua0593a47yz65qk4ymk7zskqp
To:           kaspasim:qrced0xr3qakt9y6jpme78ewgrk0v79gd9uy5qee9nq42jhv5jtz6mgpp7w6g
Amount:       10

Inputs:       1
Outputs:      1
Fee:          0.002036
Mass:         2036

Deterministic Planning Specifications:
  Coin Selection:
    deterministic canonical ordering enabled
  Input Ordering:
    amountSompi ASC
    txid ASC
    index ASC
  Output Ordering:
    amountSompi ASC
    address ASC

Artifact saved to: plan.json
Plan saved to: .hardkas\artifacts\2026-10-02T19-58-47-397Z-plan-128c81ed67d1597f.plan.json
```


### 4b tx sign (verbatim, no password source)
`hardkas tx sign plan.json --account alice_real --out signed.json` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 1, 3s
```text
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  ✗ Error:
    DEV_ACCOUNT_KEY_UNAVAILABLE: Missing required private key for account 'alice_real'.
```


### 4b-W1 WORKAROUND generate alice_pt --unsafe-plaintext
`hardkas accounts real generate --name alice_pt --network simnet --unsafe-plaintext --yes` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  ⚠️  WARNING:
     LEGACY MODE: Generating accounts in plaintext is unsafe.
Generated 1 real dev account(s)

WARNING: Development keys only. Do not use on mainnet.

Name:    alice_pt
Address: kaspasim:qp6wmrysf95v2jtum5jt96y5gyqffwe853dyah8qxzlvpp5jwpc9vektjnlrq
Private: yes (masked)
```


### 4b-W2 fund alice_pt
`hardkas localnet fund alice_pt --amount 100` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 34s
```text
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.

  ✔ TOCCATA_ACCOUNT_FUNDED
  ℹ Address: kaspasim:qp6wmrysf95v2jtum5jt96y5gyqffwe853dyah8qxzlvpp5jwpc9vektjnlrq
  ℹ Mature balance: 755000000000 sompi
```


### 4a' tx plan alice_pt
`hardkas tx plan --from alice_pt --to bob_real --amount 10 --network simnet --out plan.json` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.

HardKAS Transaction Plan Artifact (v2)
======================================
Plan ID:      plan-df8ecea503fe79f1
Version:      1.0.0-alpha
Hash:         df8ecea503fe79f1f6d5a8e51985c8552dc9dd86b6225d5f70d40435647df345
Created:      2026-10-02T20:00:09.523Z

Network:      simnet
Mode:         localnet

From:         kaspasim:qp6wmrysf95v2jtum5jt96y5gyqffwe853dyah8qxzlvpp5jwpc9vektjnlrq
To:           kaspasim:qrced0xr3qakt9y6jpme78ewgrk0v79gd9uy5qee9nq42jhv5jtz6mgpp7w6g
Amount:       10

Inputs:       1
Outputs:      1
Fee:          0.002036
Mass:         2036

Deterministic Planning Specifications:
  Coin Selection:
    deterministic canonical ordering enabled
  Input Ordering:
    amountSompi ASC
    txid ASC
    index ASC
  Output Ordering:
    amountSompi ASC
    address ASC

Artifact saved to: plan.json
Plan saved to: .hardkas\artifacts\2026-10-02T20-00-09-539Z-plan-df8ecea503fe79f1.plan.json
```


### 4b' tx sign alice_pt
`hardkas tx sign plan.json --account alice_pt --out signed.json` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.

HardKAS Signed Transaction Artifact (v2)
=========================================
Signed ID:    signed-d94de15a3157dad3
Plan ID:      plan-df8ecea503fe79f1
Hash:         d94de15a3157dad3af027827bce1ae24adf416c09838191e259afb87a6c383e1

Network:      simnet
Mode:         localnet
Status:       SIGNED

From:         kaspasim:qp6wmrysf95v2jtum5jt96y5gyqffwe853dyah8qxzlvpp5jwpc9vektjnlrq
To:           kaspasim:qrced0xr3qakt9y6jpme78ewgrk0v79gd9uy5qee9nq42jhv5jtz6mgpp7w6g
Amount:       10

Format:       hex
Tx ID:        91eb27245a768f14e3000bb6b929353401eb848ebbb9ed264e2a2755eec9feab

Signed artifact saved to: signed.json
```


### 4c tx send --out receipt.json (miner stopped)
`hardkas tx send signed.json --out receipt.json` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 1, 2s
```text
node.exe : error: unknown option '--out'
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (error: unknown option '--out':String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
(Did you mean --amount?)

Usage: hardkas tx send [options] [signedPath]

Broadcast a signed transaction or send directly stable

Options:
  --target <name>            Named execution target from hardkas.config.ts
                             (signed-artifact mode: it must match the artifact
                             and never redirects the send)
  --from <accountOrAddress>  Sender (shortcut mode)
  --to <address>             Recipient (shortcut mode)
  --amount <kas>             Amount in KAS (shortcut mode)
  --network <name>           Network name
  --fee-rate <sompiPerMass>  Fee rate in sompi per mass (shortcut mode)
  --provider <type>          Provider mode (auto, rpc, simulated;
                             signed-artifact mode only) (default: "auto")
  --url <url>                RPC URL (optional override)
  --yes                      Confirm broadcast. Required unless the network is
                             simulated or simnet (in shortcut mode, unless
                             --network simulated or simnet is given): without
                             it the send is refused (NOT EXECUTED, exit 3) and
                             nothing is written (default: false)
  --wait-lock                Wait for workspace lock if held (default: false)
  --lock-timeout <ms>        Lock wait timeout in ms (default: "30000")
  --json                     Output as JSON (default: false)
  --track <label>            Signed-artifact mode: after an accepted broadcast,
                             record a deployment with this label
  -h, --help                 display help for command
```


### 4c-W tx send signed.json (no --out), miner stopped
`hardkas tx send signed.json` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text

  ✔ Transaction submitted to the node

  Execution ID
    exec_mure0v1e

  Artifact ID
    42edb69a997549111acfd93b5e03f96c3b459452b61e0e5d59612d094c6bc31d

  Tx ID
    91eb27245a768f14e3000bb6b929353401eb848ebbb9ed264e2a2755eec9feab

  Network
    simnet

  Execution Scope
    network submission

  Artifact Written
    C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\artifacts\receipts\txSubmission-42edb69a997549111acfd93b5e03f96c3b459452b61e0e5d59612d094c6bc31d.json

  Projection
    SQLite query-store (indexed while the dashboard runs)

  State
    SUBMITTED — submitTransaction returned success at that instant on the responding node; nothing has been observed since

  Replay Status
    not supported for network submissions


  💡 Next Steps:
     > hardkas explain 42edb69a997549111acfd93b5e03f96c3b459452b61e0e5d59612d094c6bc31d
     > hardkas why 42edb69a997549111acfd93b5e03f96c3b459452b61e0e5d59612d094c6bc31d
     > hardkas tx status 91eb27245a768f14e3000bb6b929353401eb848ebbb9ed264e2a2755eec9feab
```


### AUD-16 tx status (miner stopped)
`hardkas tx status 91eb27245a768f14e3000bb6b929353401eb848ebbb9ed264e2a2755eec9feab` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 2s
```text

  ℹ Transaction state: MEMPOOL_ACCEPTED

  Tx ID
    91eb27245a768f14e3000bb6b929353401eb848ebbb9ed264e2a2755eec9feab

  Network
    simnet

  State
    MEMPOOL_ACCEPTED

  Policy
    hardkas.txStatusPolicy.default v1: CONFIRMED at ≥ 100 blue-score confirmations (a HardKAS product default, not a Kaspa parameter)

  Observed Through
    observation obtained through the configured RPC observer (obs_3336b3578bddc2fbe630ae4242eed7442f59f2cf77bf29357218e4c6dcd3244f)

  Evidence
    submission 42edb69a997549111acfd93b5e03f96c3b459452b61e0e5d59612d094c6bc31d · 1 deciding observation(s)

  This Look
    new observation 59e185bf173124cffc8320db7279af14e0f88d23516dafaa54a0d1acaaeb1d2a

  Why
    present in this observer's mempool at the observation point (local, transient)


  💡 Next Steps:
     > hardkas tx wait 91eb27245a768f14e3000bb6b929353401eb848ebbb9ed264e2a2755eec9feab --until confirmed
```


### AUD-16 tx wait (miner stopped)
`hardkas tx wait --help` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 2s
```text
Usage: hardkas tx wait [options] <txId>

Wait until the derived state of a txId reaches ACCEPTED or CONFIRMED
(blue-score depth ≥ the HardKAS policy), observing the configured node, then
until that node's UTXO view reflects it stable

Options:
  --until <target>         accepted or confirmed (default: "confirmed")
  --timeout <seconds>      Timeout in seconds (default: "60")
  --interval <seconds>     Seconds between observations (default: "2")
  -n, --network <network>  Network whose configured node observes (default: the
                           network of the recorded submission)
  --json                   Output as JSON (default: false)
  -h, --help               display help for command
```


### AUD-19 second plan while first pending
`hardkas tx plan --from alice_pt --to bob_real --amount 10 --network simnet --out plan2.json` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 2s
```text
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.

HardKAS Transaction Plan Artifact (v2)
======================================
Plan ID:      plan-fa27c09890b938ed
Version:      1.0.0-alpha
Hash:         fa27c09890b938edd875fc99605e3fec31c104c6e979b8e8daa2669a47548eae
Created:      2026-10-02T20:00:46.680Z

Network:      simnet
Mode:         localnet

From:         kaspasim:qp6wmrysf95v2jtum5jt96y5gyqffwe853dyah8qxzlvpp5jwpc9vektjnlrq
To:           kaspasim:qrced0xr3qakt9y6jpme78ewgrk0v79gd9uy5qee9nq42jhv5jtz6mgpp7w6g
Amount:       10

Inputs:       1
Outputs:      1
Fee:          0.002036
Mass:         2036

Deterministic Planning Specifications:
  Coin Selection:
    deterministic canonical ordering enabled
  Input Ordering:
    amountSompi ASC
    txid ASC
    index ASC
  Output Ordering:
    amountSompi ASC
    address ASC

Artifact saved to: plan2.json
Plan saved to: .hardkas\artifacts\2026-10-02T20-00-46-687Z-plan-fa27c09890b938ed.plan.json
```


### AUD-19 shortcut send #1 (sequential)
`hardkas tx send --from alice_pt --to bob_real --amount 1 --network simnet` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ✔ Transaction submitted to the node

  Execution ID
    exec_mure1kpa

  Artifact ID
    c12e9d372fd61c58bbcfef0398b17bd0097e715cd052053656df68cb2939c20d

  Tx ID
    d12de57244ac66f542b9bda9d274acefb1a7bcba9605d7b34276c34639d5ecf5

  Network
    simnet

  Execution Scope
    network submission

  Artifact Written
    C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\artifacts\receipts\txSubmission-c12e9d372fd61c58bbcfef0398b17bd0097e715cd052053656df68cb2939c20d.json

  Projection
    SQLite query-store (indexed while the dashboard runs)

  State
    SUBMITTED — submitTransaction returned success at that instant on the responding node; nothing has been observed since

  Replay Status
    not supported for network submissions


  💡 Next Steps:
     > hardkas explain c12e9d372fd61c58bbcfef0398b17bd0097e715cd052053656df68cb2939c20d
     > hardkas why c12e9d372fd61c58bbcfef0398b17bd0097e715cd052053656df68cb2939c20d
     > hardkas tx status d12de57244ac66f542b9bda9d274acefb1a7bcba9605d7b34276c34639d5ecf5
     > hardkas dev last --replay
     > hardkas status
```


### AUD-19 shortcut send #2 (sequential)
`hardkas tx send --from alice_pt --to bob_real --amount 1 --network simnet` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ✔ Transaction submitted to the node

  Execution ID
    exec_mure1mvo

  Artifact ID
    ecd9caa7e17f8f42b41c8ef916292c7d0fe391334d6def62531993db4f6de9a1

  Tx ID
    068cedf1262170c3ca4ba4e16a5506c3abfc73ff71fa9de19a678d5b49b11d65

  Network
    simnet

  Execution Scope
    network submission

  Artifact Written
    C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\artifacts\receipts\txSubmission-ecd9caa7e17f8f42b41c8ef916292c7d0fe391334d6def62531993db4f6de9a1.json

  Projection
    SQLite query-store (indexed while the dashboard runs)

  State
    SUBMITTED — submitTransaction returned success at that instant on the responding node; nothing has been observed since

  Replay Status
    not supported for network submissions


  💡 Next Steps:
     > hardkas explain ecd9caa7e17f8f42b41c8ef916292c7d0fe391334d6def62531993db4f6de9a1
     > hardkas why ecd9caa7e17f8f42b41c8ef916292c7d0fe391334d6def62531993db4f6de9a1
     > hardkas tx status 068cedf1262170c3ca4ba4e16a5506c3abfc73ff71fa9de19a678d5b49b11d65
     > hardkas dev last --replay
     > hardkas status
```


### AUD-19 shortcut send PARALLEL #2
`hardkas tx send --from alice_pt --to bob_real --amount 1 --network simnet` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 1, 3s
```text
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  Ô£ù Error:
    Workspace is locked by another HardKAS process (PID: 19384).
```


### AUD-19 shortcut send PARALLEL #1
`hardkas tx send --from alice_pt --to bob_real --amount 1 --network simnet` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  ÔÜá´©Å  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ÔÜá´©Å  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ÔÜá´©Å  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  ÔÜá´©Å  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.


  Ô£ö Transaction submitted to the node

  Execution ID
    exec_mure1unq

  Artifact ID
    1487e5911f5ac132db5087e0f5f962c6888a295b7382be3f687bef66bf8cad0b

  Tx ID
    aef49774f62d2a37937dbd9e933e7d08f73932a255933a6ef794b9ab93eb6667

  Network
    simnet

  Execution Scope
    network submission

  Artifact Written
    C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\artifacts\receipts\txSubmission-1487e5911f5ac132db5087e0f5f962c6888a295b7382be3f687bef66bf8cad0b.json

  Projection
    SQLite query-store (indexed while the dashboard runs)

  State
    SUBMITTED ÔÇö submitTransaction returned success at that instant on the responding node; nothing has been observed since

  Replay Status
    not supported for network submissions


  ­ƒÆí Next Steps:
     > hardkas explain 1487e5911f5ac132db5087e0f5f962c6888a295b7382be3f687bef66bf8cad0b
     > hardkas why 1487e5911f5ac132db5087e0f5f962c6888a295b7382be3f687bef66bf8cad0b
     > hardkas tx status aef49774f62d2a37937dbd9e933e7d08f73932a255933a6ef794b9ab93eb6667
     > hardkas dev last --replay
     > hardkas status
```


### AUD-16 tx wait --until accepted --timeout 30 (miner stopped)
`hardkas tx wait 91eb27245a768f14e3000bb6b929353401eb848ebbb9ed264e2a2755eec9feab --until accepted --timeout 30` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 1, 34s
```text
  • MEMPOOL_ACCEPTED
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  ✗ [TX_WAIT_TIMEOUT] Timed out after 30s waiting for 91eb27...feab [REDACTED] to be ACCEPTED; last derived state: MEMPOOL_ACCEPTED.
```


### AUD-16 localnet fund alice_pt --amount 1 --keep-miner
`hardkas localnet fund alice_pt --amount 1 --keep-miner` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 6s
```text
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: alice_pt
     Location: C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj\.hardkas\accounts.real.json
     Recommendation: Re-import these accounts using encrypted keystores.

  ✔ TOCCATA_ACCOUNT_FUNDED
  ℹ Address: kaspasim:qp6wmrysf95v2jtum5jt96y5gyqffwe853dyah8qxzlvpp5jwpc9vektjnlrq
  ℹ Mature balance: 1618696886100 sompi
```


### AUD-16 tx wait --until confirmed (miner running)
`hardkas tx wait 91eb27245a768f14e3000bb6b929353401eb848ebbb9ed264e2a2755eec9feab --until confirmed --timeout 120` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 4s
```text
  • CONFIRMED (335 blue-score confirmations ≥ 100)

  ✔ Reached CONFIRMED: CONFIRMED (335 blue-score confirmations ≥ 100)

  Tx ID
    91eb27245a768f14e3000bb6b929353401eb848ebbb9ed264e2a2755eec9feab

  Network
    simnet

  State
    CONFIRMED (335 blue-score confirmations ≥ 100)

  Accepting Block
    f65d8ff9ef5a16116ffdebfbc56106d1e92bd1f89cf081b7af6e3f92bcdcfc82

  Policy
    hardkas.txStatusPolicy.default v1: CONFIRMED at ≥ 100 blue-score confirmations (a HardKAS product default, not a Kaspa parameter)

  Observed Through
    observation obtained through the configured RPC observer (obs_3336b3578bddc2fbe630ae4242eed7442f59f2cf77bf29357218e4c6dcd3244f)

  Evidence
    submission 42edb69a997549111acfd93b5e03f96c3b459452b61e0e5d59612d094c6bc31d · 18 deciding observation(s)

  This Look
    new observation 50d8108772f51a7cd0cdabf3f838fbd4716411ad929e0186e22339df702e3988

  Why
    accepted by chain block f65d8ff9ef5a16116ffdebfbc56106d1e92bd1f89cf081b7af6e3f92bcdcfc82 with 335 blue-score confirmations (minimum across observers) ≥ policy hardkas.txStatusPolicy.default v1 (100, hardkas-product-default)

  UTXO View
    reflects this transaction: an output of it is listed for 2 address(es) and the inputs it spent are no longer listed (1 look(s))
```


### 5a verify receipt.json
`hardkas verify receipt.json` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 4s
```text

  ═══ Artifact Verification: receipt.json ═══
  ✔ VERIFICATION SUCCESSFUL
  Type:    hardkas.txSubmission.v1
  Version: 1.0.0-alpha
  Hash:    42edb69a997549111acfd93b5e03f96c3b459452b61e0e5d59612d094c6bc31d
  Scope:   FULL

Operational Audit (STRICT):
  ✔   ✓ Economic & Lineage invariants verified.

Replay Verification:
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  ⚠️  WARNING:
       ⚠ REPLAY UNSUPPORTED (Consensus simulation skipped)
```


### 5b replay receipt.json
`hardkas replay receipt.json` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 1, 3s
```text
node.exe : error: unknown command 'receipt.json'
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (error: unknown command 'receipt.json':String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 

Usage: hardkas replay [options] [command]

Manage HardKAS transaction replays

Options:
  -h, --help                   display help for command

Commands:
  verify [options] [artifact]  Verify deterministic simulator-mode replay for a
                               receipt (required) by exact artifactId or a
                               workspace path such as ./receipt.json. Real-node
                               sends are not supported: they record a
                               TxSubmission, not a TxReceipt. stable
  diff [options] <idA> <idB>   Compare two replay artifacts for deterministic
                               divergence alpha
  help [command]               display help for command
```


### 5c WORKAROUND replay verify receipt.json
`hardkas replay verify ./receipt.json` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 1, 5s
```text
node.exe : 
En C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\step.ps1: 8 Carácter: 8
+ $out = & node $hk @HkArgs 2>&1 | Out-String -Width 220
+        ~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  ✗ [REPLAY_MISSING_DEPENDENCY] Lineage is missing a TxReceipt artifact.
```


### AUD-24 node reset --help
`hardkas node reset --help` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 3s
```text
Usage: hardkas node reset [options]

Stop node and remove all local chain data preview

Options:
  --start              Restart the node after reset (default: false)
  --yes                Skip confirmation prompt (default: false)
  --wait-lock          Wait for workspace lock if held (default: false)
  --lock-timeout <ms>  Lock wait timeout in ms (default: "30000")
  --json               Output results as JSON (default: false)
  -h, --help           display help for command
```


### AUD-24 node reset --yes from othercwd
`hardkas node reset --yes` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\othercwd) -> exit 0, 5s
```text
  ✔ Kaspa node reset complete. Data removed: true. Node is currently stopped.
```


### cleanup localnet stop
`hardkas localnet stop` (cwd C:\Users\jrodr\AppData\Local\Temp\claude\audit-compare\localnet\proj) -> exit 0, 2s
```text
  ℹ Simulated localnet state is managed in-memory.
```


## End state
Node container removed by node reset; hardkas-toccata-miner left Exited(1) (pre-existed as Created); no running containers; no 0.0.0.0 bindings (node published 127.0.0.1 only). merchant-pos-demo container hardkas-kaspad-toccata-v2 (Exited) was replaced by localnet start (product does docker rm -f) - its bind-mounted data dir is intact.
