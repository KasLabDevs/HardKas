---
title: Your first transaction
description: Send KAS on a simnet node in three commands, or step by step - what plan, inspect, sign, send and wait each do, prove and do not prove.
---

# Your first transaction

## Fast path: send KAS on a simnet node in three commands

Use this path when you already have a funded private key and a running node, and you just need the payment to happen.

1. If the node is not the HardKAS localnet (`ws://127.0.0.1:18210`), put its wRPC JSON URL in a `hardkas.config.mjs` in
   the folder where you run the commands. The `tx send` shortcut takes the node from this file.

   ```js
   export default {
     networks: {
       simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://<host>:18210" }
     }
   };
   ```

2. Run the commands:

   ```bash
   export PK=<private key hex>            # read with --private-key-env, never typed on the command line
   export PW=<any keystore password>      # encrypts the imported key in the local keystore
   hardkas accounts real import --name payer --address <kaspasim:sender> --network simnet --private-key-env PK --password-env PW
   hardkas tx send --from payer --to <kaspasim:recipient> --amount 10 --network simnet --password-env PW --yes
   hardkas tx wait <txId> --until confirmed --network simnet
   ```

- `tx send` plans, signs and sends in one step and prints the `Tx ID`.
- `tx wait` returns once the node's UTXO view reflects the transaction.

Use the step-by-step flow below instead when someone must review the plan before it is signed (a CI gate, another
signer), or when you want each step's artifact on disk.

## Step by step: what each step proves

HardKAS replaces "send and hope" with separate steps, and each one writes an
artifact you can check: **plan → inspect → sign → send → observe**. The commands
are the same on the simulated ledger ([Quickstart](./quickstart.md)) and on a
node ([Quickstart: a real transaction](./quickstart-simnet.md)); what each step
proves is not.

### 1. Plan (`tx plan`)

```bash
hardkas tx plan --from alice --to bob --amount 10 --out plan.json
```

**What HardKAS does.** It reads the sender's spendable outputs from the active
network (the simulated ledger, or the node's UTXO index), and the official
`kaspa-wasm` Generator selects the inputs and computes mass and fee. On a node
the fee rate is the node's estimate unless you pass `--fee-rate`, and immature
coinbase outputs are skipped (`NO_SPENDABLE_UTXOS` when nothing else is left).
No key is used.

**Evidence.** A plan (`hardkas.txPlan`) in `plan.json` and under
`.hardkas/artifacts/plans/`. It records the inputs, outputs, fee, mass and the
execution target (mode, domain and network). Its `artifactId` is its content
hash; its `planId` (`plan-` and the first 16 hex characters of that hash) is a
short label derived from it.

**Proves:** with the outputs the network reported at that moment, a transaction
paying the amount and its fee could be built.

**Does not prove:** that the sender authorized it, or that its inputs will still
be unspent when it is sent. `tx send --preflight` checks them at the node right
before the broadcast.

### 2. Inspect (`artifact inspect`, `artifact verify`)

```bash
hardkas artifact inspect plan.json
hardkas artifact verify plan.json
```

**What HardKAS does.** `inspect` shows what the plan would do (recipients,
amounts, fee), so a person or a CI gate can check them before signing. `verify`
recomputes the content hash and checks the schema and lineage.

**Proves:** the file is intact, the one HardKAS wrote (`INTEGRITY_VERIFIED`).

**Does not prove:** anything about the network. A plan is not a transaction on
the network yet.

### 3. Sign (`tx sign`)

```bash
hardkas tx sign plan.json --account alice --out signed.json
```

**What HardKAS does.** It refuses a plan whose content no longer hashes to its
content hash (`ARTIFACT_HASH_MISMATCH`, nothing signed) and checks the plan's fee
against its fee limit. On a node, it signs each input with the account's key
(Schnorr by default; ECDSA for an ECDSA account), read from the account's
encrypted keystore with the password you supply (`--password-env`). On the
simulated ledger it writes a synthetic authorization by the plan's sender: no
Kaspa signature is produced. On mainnet it signs nothing
(`MAINNET_SIGNING_DISABLED`).

**Evidence.** A signed transaction (`hardkas.signedTx`) whose
`lineage.parentArtifactId` is the plan's `artifactId`. The transaction id is fixed
once signed.

**Proves:** the holder of the account's key authorized exactly that plan (on the
simulated ledger: that the plan's sender authorized it).

**Does not prove:** custody safety. These are development keys, and nothing has
been sent yet.

### 4. Send (`tx send`)

```bash
hardkas tx send signed.json --yes
```

**What HardKAS does.** It checks the signed artifact's hash before contacting
anything, then sends it to the network its plan names (`--target` must match the
artifact and never redirects the send). On a network other than `simulated` and
`simnet` it refuses without `--yes`. Sending the same signed transaction again
executes and sends nothing (`--json` reports `ALREADY_SUBMITTED`).

**Evidence.** Under `.hardkas/artifacts/receipts/`:

- the **simulated ledger** applies the transaction and writes a `TxReceipt`;
- a **node send** writes a `TxSubmission` (`hardkas.txSubmission.v1`): what the
  node answered at that instant, the submit point, the fee derived from inputs
  minus outputs, the endpoint and the lineage.

**Proves:** on the simulated ledger, that the ledger applied it. On a node, that
the node accepted the submit request (`SUBMITTED`).

**Does not prove:** that the DAG accepted the transaction, that it is confirmed,
or that it is final. A simulated receipt is never network evidence.

### 5. Observe (`tx wait`, `tx status`): node only

```bash
hardkas tx wait <txId> --until confirmed --timeout 300
hardkas artifact verify signed.json --network simnet --require consensus
```

**What HardKAS does.** `tx wait` and `tx status` look at the node and derive the
state from every observation recorded so far: `SUBMITTED`, `MEMPOOL_ACCEPTED`,
`ACCEPTED`, then `CONFIRMED` at 100 blue-score confirmations, HardKAS's policy (not
a Kaspa parameter). `tx wait` then waits until the node's UTXO view reflects the
transaction. `artifact verify --network` checks the artifact against a node of
its own network.

**Proves:** one node, at one moment, saw the transaction accepted at that depth.

**Does not prove:** irreversible finality, or agreement between several nodes.
[Reading receipts and verification levels](./receipts-and-levels.md) explains
each state and level.

## Next

- [Reading receipts and verification levels](./receipts-and-levels.md)
- [Quickstart: a real transaction on your simnet](./quickstart-simnet.md)
- [Transaction lifecycle](../concepts/transaction-lifecycle.md)
