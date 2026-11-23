---
title: "Quickstart: your first Kaspa transaction in 5 minutes"
sidebar_label: "5-Minute Quickstart"
description: Plan, sign and send a first transaction on the simulated ledger with the CLI and the SDK, then check its evidence, with no node and no Docker.
---

# 5-Minute Quickstart

Get up and running with HardKAS on the simulated ledger (`network: "simulated"`):
a local UTXO ledger with synthetic accounts, kept in `.hardkas/localnet.json`.
It needs no Docker, no node and no network connection after the install, so you
can focus on the workflow: **plan → sign → send → verify**.

> [!NOTE]
> Nothing the simulated ledger produces is network evidence: it runs no node and
> no Kaspa script. [Build on your own simnet](./build-on-simnet.md) runs the same
> lifecycle against a real `rusty-kaspad` node.

## 1. Installation

Install the SDK and CLI in your project. Name the version, as below: a bare
`npm install` takes npm's `latest` tag, which can be an earlier candidate
([Install HardKAS](./installation.md) has the details).

```bash
npm install @hardkas/sdk@1.0.0
npm install -D @hardkas/cli@1.0.0
```

## 2. Initialize The Workspace

```bash
npx hardkas init .
```

This creates the local `.hardkas/` workspace and a `hardkas.config.ts` whose
default network is `simulated`. The ledger starts with five development accounts,
`alice` … `erin`, each funded with 1000 synthetic KAS. `init` also installs the
Kaspa WASM SDK this release pins (`kaspa-wasm`, from the official rusty-kaspa
release) into `~/.hardkas/toolchains/` and checks it against its pinned SHA-256;
signing and planning use it. If that step fails, `init` stops with an error and
`npx hardkas toolchain install kaspa-wasm` installs it by hand.

## 3. CLI Workflow

Shortcut mode (plan, sign and send in one step):

```bash
npx hardkas tx send --from alice --to bob --amount 10 --network simulated --yes
```

Explicit artifact mode (one file per step):

```bash
npx hardkas tx plan --from alice --to bob --amount 10 --network simulated --out tx-plan.json
npx hardkas artifact inspect tx-plan.json
npx hardkas artifact verify tx-plan.json --strict
npx hardkas tx sign tx-plan.json --account alice --out tx-signed.json
npx hardkas tx send tx-signed.json --network simulated --yes
```

What each step does:

- `tx plan` selects Alice's UTXOs with the official `kaspa-wasm` Generator,
  computes mass and fee, and writes the plan (`hardkas.txPlan`) to
  `tx-plan.json` and to `.hardkas/artifacts/plans/`. No key is used.
- `artifact inspect` shows what the plan would do; `artifact verify` recomputes
  its content hash, so an edited file is caught before anything is signed.
- `tx sign` writes the signed artifact (`hardkas.signedTx`), linked to its plan.
  On the simulated ledger this is a synthetic authorization by the plan's sender:
  no Kaspa signature is produced.
- `tx send` applies the transaction to the ledger and writes a `TxReceipt` under
  `.hardkas/artifacts/receipts/`. Its transaction id is synthetic
  (`synthetic-<hash>`). Sending the same signed artifact again executes nothing.

## 4. SDK Workflow

The SDK is published as ES modules. Run this from an ES module: a project with
`"type": "module"` in its `package.json`, or a `.mjs` file. `hardkas init` sets
`"type": "module"` only when it creates the `package.json`; in step 1 above
`npm install` already created one, so add the field yourself. In a CommonJS
project (the `npm init -y` default) the import fails.

```typescript
import { Hardkas } from "@hardkas/sdk";

async function run() {
  const sdk = await Hardkas.create({
    cwd: process.cwd(),
    autoBootstrap: true,
    network: "simulated"
  });

  const plan = await sdk.tx.plan({
    from: "alice",
    to: "bob",
    amount: "10"
  });

  const signed = await sdk.tx.sign(plan, "alice");
  const { receipt } = await sdk.tx.simulate(signed);

  console.log("Simulation receipt:", receipt.txId);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Amounts given as a string are KAS. The SDK writes the same artifacts as the CLI.

## 5. Check the evidence

```bash
npx hardkas verify
npx hardkas why <receipt path or artifactId>
npx hardkas replay verify <receipt path or artifactId>
```

- `verify` recomputes the hash of every artifact under `.hardkas/artifacts/` and
  checks the lineage each one declares back to its plan. It is an integrity
  check: no replay and no consensus check is performed.
- `why` walks an artifact's lineage back to its plan: receipt → signed
  transaction → plan. `explain` describes one artifact.
- `replay verify` replays the simulated run from its receipt and checks that it
  gives the same result. It exists for simulated receipts only: a node send
  records a `TxSubmission`, which it refuses (`REPLAY_MODE_UNSUPPORTED`).

[Reading receipts and verification levels](./receipts-and-levels.md#the-records-of-a-simulated-run)
explains the receipt and its identifiers.

## Next

- [Your first transaction](./first-transaction.md): what each step proves and does not prove.
- [Build on your own simnet](./build-on-simnet.md): the same lifecycle against a real `rusty-kaspad` node of your own.
- [Configuration](./configuration.md): what `hardkas.config.ts` declares.
