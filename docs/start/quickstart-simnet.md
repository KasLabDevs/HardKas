---
title: "Quickstart: a real transaction on your simnet"
description: From an empty project to a confirmed, verified payment on your own rusty-kaspad simnet node, with the CLI and then with the SDK.
---

# Quickstart: a real transaction on your simnet

From an initialized project to a payment that your own node accepted and
confirmed, and that `artifact verify` checks against that node: accounts →
funding → plan → inspect → sign → send → wait → receipt → verify. Then the same
payment through the SDK.

It is part of [Build on your own simnet](./build-on-simnet.md). Before you start:

- the project is installed and initialized ([Install HardKAS](./installation.md));
- your node runs and the workspace points at it ([Run your own simnet node](./simnet-node.md), steps 2 and 4).

> [!WARNING]
> Everything here happens on your private simnet. HardKAS refuses to sign or
> broadcast on mainnet. These keys are development keys: never fund them on a
> public network.

## 1. Create two accounts

The accounts are real Kaspa keys, kept in encrypted keystores under
`.hardkas/keystore/`. Choose a password for this simnet and put it in an
environment variable; commands read it with `--password-env`, so it never
appears on a command line.

bash / zsh:

```bash
export HARDKAS_PASSWORD='choose-a-simnet-password'
```

PowerShell:

```powershell
$env:HARDKAS_PASSWORD = 'choose-a-simnet-password'
```

Windows `cmd`: `set HARDKAS_PASSWORD=choose-a-simnet-password`.

```bash
npx hardkas accounts real generate --name miner --network simnet --password-env HARDKAS_PASSWORD
npx hardkas accounts real generate --name alice --network simnet --password-env HARDKAS_PASSWORD
npx hardkas accounts list
```

```text
Generated 1 real dev account(s)

WARNING: Development keys only. Do not use on mainnet.

Name:    miner
Address: kaspasim:qqpuayan244a0upvex6xa9px5gypxjy37xflcw4r9mf36wnfvzhazwxevn463
Private: yes (masked)
```

Your addresses will differ. `accounts list` also shows the simulated accounts
`init` created (`kaspa:sim_…`); those exist only in the simulator.

## 2. Fund the miner account

Start the miner with the **miner** account's address
([Run your own simnet node, step 3](./simnet-node.md#3-start-the-miner)):

```bash
docker run -d --name my-simnet-miner --network container:my-simnet kaspanet/cpuminer@sha256:60f78ab2828ab24b249c99210eee5a2825303a5226154260dd021ff26d46748b --mining-address <miner-address> --kaspad-address 127.0.0.1 --port 26511 --threads 1 --mine-when-not-synced --throttle 20
```

Wait about a minute for coinbase maturity
([why](./simnet-node.md#5-wait-for-coinbase-maturity)), then check:

```bash
npx hardkas rpc info --network simnet
npx hardkas accounts balance miner --network simnet
```

```text
Synced:       yes
Virtual DAA:  1314

Account:  miner
Balance:  68100 KAS
UTXOs:    1262
Network:  simnet
```

Keep the miner running until the end of this page.

## 3. Plan

```bash
npx hardkas tx plan --network simnet --from miner --to alice --amount 100 --out plan.json
```

```text
Network:      simnet
Mode:         localnet
From:         kaspasim:qqpuayan244a0upvex6xa9px5gypxjy37xflcw4r9mf36wnfvzhazwxevn463
To:           kaspasim:qz2n6hxsqq6qptaegap325q7p33ny7hf47f2fdtsja70wjqk5jcpce2myljaa
Amount:       100
Inputs:       3
Outputs:      1
Fee:          0.004272
Mass:         4272
Artifact saved to: plan.json
```

The plan is built from the node's UTXOs by the official `kaspa-wasm` Generator,
with a fee rate of 100 sompi per gram (the real-network default; not a live
estimate). It is a transaction **v0**, like every normal payment. No key was
used.

## 4. Inspect and verify before signing

```bash
npx hardkas artifact inspect plan.json
npx hardkas artifact verify plan.json
```

```text
  ✔ VERIFICATION SUCCESSFUL
  Type:    hardkas.txPlan
Levels:
  Integrity: INTEGRITY_VERIFIED (offline)
  Network:   NOT_CHECKED [OFFLINE] · offline verification: no node was asked (use --network/--url for the network level)
  Consensus: NOT_CHECKED [OFFLINE] · no network observation, so no confirmation · policy hardkas.txStatusPolicy.default v1 (≥ 100 blue-score)
  Verdict:   INTEGRITY_VERIFIED
```

A plan is not a transaction on the network yet, so only its integrity can be
checked. `verify` also warns `REPLAY UNSUPPORTED`: replay is for simulated
records only.

## 5. Sign

```bash
npx hardkas tx sign plan.json --account miner --password-env HARDKAS_PASSWORD --out signed.json
```

```text
Status:       SIGNED
Tx ID:        3087f21464b64fcd4fb74b44411e37f3e94c133f36c15f3fa9ad2d8c41bc4d61
Signed artifact saved to: signed.json
```

The transaction id is fixed once signed. Use yours in the next steps.

## 6. Send

```bash
npx hardkas tx send signed.json --yes
```

```text
  ✔ Transaction submitted to the node
  Tx ID
    3087f21464b64fcd4fb74b44411e37f3e94c133f36c15f3fa9ad2d8c41bc4d61
  Artifact Written
    .hardkas\artifacts\receipts\txSubmission-9917e2fa….json
  State
    SUBMITTED — submitTransaction returned success at that instant on the responding node; nothing has been observed since
```

This is the only broadcast of the page. `SUBMITTED` means the node accepted the
request, nothing more ([what each state means](./receipts-and-levels.md)). On
simnet `--yes` is optional; on any other network the send is refused without it.

## 7. Wait for confirmation

```bash
npx hardkas tx wait <txId> --until confirmed --timeout 300
```

```text
  ✔ Reached CONFIRMED: CONFIRMED (266 blue-score confirmations ≥ 100)
  Accepting Block
    ff0a8aaf583c8506e60ba48453872fd449f4b5aeb5143ad395b7e73542d237b4
  Policy
    hardkas.txStatusPolicy.default v1: CONFIRMED at ≥ 100 blue-score confirmations (a HardKAS product default, not a Kaspa parameter)
  UTXO View
    reflects this transaction: an output of it is listed for 2 address(es) and the inputs it spent are no longer listed (1 look(s))
```

## 8. Read the receipt and the status

```bash
npx hardkas tx receipt <txId> --json
npx hardkas tx status <txId>
```

`tx receipt` prints the submission record (`hardkas.txSubmission.v1`): the
node's answer, the submit point, the fee derived from inputs minus outputs, the
endpoint and the lineage back to the plan (`--json` gives the whole record; the
plain-text view shows sender, recipient, amount and fee).
`tx status` takes one new look at the node and derives the current state from
all the evidence recorded so far.

## 9. Verify against the node

```bash
npx hardkas artifact verify signed.json --network simnet --require consensus
```

```text
Levels:
  Integrity: INTEGRITY_VERIFIED (offline)
  Network:   NETWORK_OBSERVED · virtual-chain: accepted in the node's virtual chain by ff0a8aaf583c8506e60ba48453872fd449f4b5aeb5143ad395b7e73542d237b4 (derived CONFIRMED); one node, one look · node rusty-kaspad 2.1.0 at ws://127.0.0.1:26510 (node-endpoint, sync synced)
  Consensus: CONSENSUS_CONFIRMED · accepting chain block ff0a8aaf…37b4: 483 ≥ 100 blue-score confirmations · policy hardkas.txStatusPolicy.default v1 (≥ 100 blue-score)
  Verdict:   CONSENSUS_CONFIRMED (required: consensus)
```

`--require consensus` makes the command fail unless that level is reached. The
same works on the submission record in `.hardkas/artifacts/receipts/`.
[Reading receipts and verification levels](./receipts-and-levels.md) explains
what each level does and does not prove.

## 10. Check the result, and try sending again

```bash
npx hardkas accounts balance alice --network simnet
npx hardkas tx send signed.json --yes
```

```text
Account:  alice
Balance:  100 KAS

  ✔ Transaction already submitted from this workspace: not sent again
```

Sending the same signed transaction again sends nothing: `--json` reports
`"code": "ALREADY_SUBMITTED"` with the state seen. Editing `signed.json` by hand
makes it unsendable: `ARTIFACT_HASH_MISMATCH`
([Common errors](./common-errors.md)).

## 11. The same payment from the SDK

`pay.mjs`, in the project folder (an ES module project, see
[Install](./installation.md#install)):

```javascript
// pay.mjs: one payment on your own simnet node through the SDK (plan -> sign -> send -> wait).
// Run from the workspace: node pay.mjs   (HARDKAS_PASSWORD holds the miner account's keystore password)
import { Hardkas } from "@hardkas/sdk";

const sdk = await Hardkas.create({ cwd: process.cwd(), network: "simnet" });
try {
  const plan = await sdk.tx.plan({ from: "miner", to: "alice", amount: "2" });
  const signed = await sdk.tx.sign(plan, {
    account: "miner",
    keystorePassword: process.env.HARDKAS_PASSWORD
  });
  const { submission } = await sdk.tx.send(signed);
  console.log("submitted", submission.txId);

  const confirmed = await sdk.tx.waitForConfirmations({
    txId: submission.txId,
    minConfirmations: 100,
    timeoutMs: 300_000
  });
  console.log(confirmed.status, confirmed.confirmations, "blue-score confirmations");
  console.log("accepting block", confirmed.acceptingBlockHash);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await sdk.close();
}
```

```bash
node pay.mjs
```

```text
submitted 1477c618bd641ede3ae0672737b3aa3d002bb2f6f0304797152dd4b385d9961f
confirmed 124 blue-score confirmations
accepting block fbf1f103fc73fa5ae8833dfc9c581f00108d33b1d709a9d3bd223e20b056798e
```

The SDK writes the same records as the CLI (plan, signed transaction,
submission, observations), so `npx hardkas tx status <txId>` and
`artifact verify` work on it too. Amounts as a string are KAS; a `bigint` is
sompi.

## What this proved, and what it did not

Proved: your node accepted the transaction, its virtual chain accepted it in a
block, that block reached HardKAS's 100 blue-score policy as that node saw it,
and the recipient holds the output.

Not proved: anything about testnet-10 or mainnet, irreversible finality, or
agreement between several nodes. See
[What works in this release](./what-works.md).

When you are done, stop the miner (`docker stop my-simnet-miner`); see
[Stop and restart](./simnet-node.md#7-stop-and-restart-without-losing-data).

## Next

- [SilverScript and covenants on your simnet](./silverscript-covenants.md)
- [Common errors and recovery](./common-errors.md)
