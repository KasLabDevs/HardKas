---
title: First Transaction Deep Dive
sidebar_position: 3
---

import QualificationContext from '@site/src/components/QualificationContext';

# First Transaction Deep Dive

The [Quickstart](./quickstart.md) showed you *how* to execute a transaction. This page explains *why* HardKAS breaks the transaction down into discrete stages. 

Traditional Kaspa development involves calling an RPC node directly and hoping the transaction is accepted. HardKAS replaces "request and hope" with an evidence-driven workflow: **Plan &rarr; Sign &rarr; Send &rarr; Receipt**.

Here is what actually happened under the hood when Alice sent 10 KAS to Bob in the Simulator.

---

## 1. Funding Semantics
In our Quickstart, Alice already had 1000 KAS. Where did it come from?

During `hardkas init`, HardKAS provisions deterministic accounts (Alice, Bob, Carol) and injects synthetic UTXOs directly into the Simulator's local state file (`.hardkas/localnet.json`). 

Because we are using the **Simulator**, funding is instant and synthetic. If we were using **Localnet** (a real dockerized Kaspa node), funding would require mining blocks or using a local faucet to physically generate UTXOs on the local network. 

## 2. Planning (`hardkas tx plan`)

```bash
hardkas tx plan --from alice --to bob --amount 10 --out plan.json
```

### What HardKAS does
The HardKAS Core Planner queries the Simulator for Alice's UTXOs, applies a deterministic coin selection algorithm, calculates fees, and structures the exact graph of inputs and outputs. 

*Note: In this Simulator workflow, HardKAS constructs the transaction plan locally. Planner implementation and provenance depend on the execution path; where planner authority is recorded, inspect the generated artifact for that evidence.*

### Evidence produced
It outputs a `TxPlanArtifact` saved to `plan.json`. This artifact contains the exact parameters of the transaction, the targeted environment (`mode: "simulator"`), and is assigned a canonical `artifactId`.

### What this proves
It proves that at this specific moment, a valid, fee-paying transaction graph was geometrically possible using Alice's available UTXOs.

### What this does NOT prove
It does not prove Alice authorized it, nor does it guarantee the UTXOs won't be spent by someone else before execution.

## 3. Signing (`hardkas tx sign`)

```bash
hardkas tx sign plan.json --account alice --out signed.json
```

### What HardKAS does
HardKAS loads the `TxPlanArtifact`, retrieves Alice's deterministic development private key, and applies cryptographic signatures to the selected inputs. 

### Evidence produced
It produces a `SignedTxArtifact`. This artifact explicitly embeds a `parentArtifactId` linking it back to the Plan, cementing the causal relationship.

### What this proves
It proves that whoever holds Alice's private key authorized the exact intent described in the `TxPlanArtifact`. Because the plan is protected by a `contentHash`, any tampering with `plan.json` before signing would cause the operation to fail.

### What this does NOT prove
Development keys are synthetic. A signature here does not imply custody safety or production readiness.

## 4. Submission (`hardkas tx send`)

```bash
hardkas tx send signed.json
```

### What HardKAS does
The HardKAS Execution Guard reads the `SignedTxArtifact` and dispatches it to the execution environment declared in the plan. In our case, the Simulator validates the signatures and applies the state mutation to `.hardkas/localnet.json`.

### Evidence produced
A `TxReceiptArtifact` is written to the `.hardkas/artifacts/receipts/` directory.

### What this proves
The receipt proves that the execution environment (the Simulator) successfully accepted the payload. 

### What this does NOT prove
**A receipt proves submission acceptance, not consensus finality.** If this were Localnet or Mainnet, the receipt would indicate mempool acceptance. It does **not** guarantee that the transaction will be mined into a block or survive a chain reorganization.

---

With the transaction complete, let's look at the trail of evidence it left behind in [Understanding the Result](./understanding-the-result.md).
