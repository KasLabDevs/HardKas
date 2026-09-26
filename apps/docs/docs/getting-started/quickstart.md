---
title: 5-Minute Quickstart
sidebar_position: 2
---

# 5-Minute Quickstart

This guide will take you from zero to executing a deterministically verified transaction in the HardKAS Simulator. 

We use the **Simulator** for the quickstart because it requires zero external dependencies (no Docker, no Kaspa nodes) and executes instantly, allowing you to focus purely on the HardKAS workflow: **Plan &rarr; Sign &rarr; Send &rarr; Verify**.

---

### 1. Initialize a Workspace

If you haven't already, install HardKAS and initialize a workspace:

```bash
npm install -g @hardkas/cli
hardkas init my-first-project
cd my-first-project
```
**What this does:** Scaffolds a project and automatically funds deterministic development accounts (like `alice` and `bob`) inside the local Simulator state.

### 2. Plan the Transaction

Generate the deterministic execution intent:

```bash
hardkas tx plan --from alice --to bob --amount 10 --out plan.json
```
**What this does:** Selects UTXOs, calculates fees, and produces a `TxPlanArtifact` representing the exact mutations to be made, saved to `plan.json`.

### 3. Sign the Plan

Approve the payload using Alice's development account:

```bash
hardkas tx sign plan.json --account alice --out signed.json
```
**What this does:** Signs the UTXOs consumed in the plan and produces a `SignedTxArtifact` saved to `signed.json`.

> **Warning:** The `alice` account is a deterministic local development account. Never use development keys for production key management.

### 4. Send the Transaction

Submit the signed artifact to the execution environment (Simulator):

```bash
hardkas tx send signed.json
```
**What you should see:** A success message outputting the internal `Tx ID` and the file path where the **Receipt** artifact was written.
```text
  ✔ Transaction simulated successfully

  Artifact Written
    C:\path\to\.hardkas\artifacts\receipts\txReceipt-<hash>.json
```

### 5. Inspect the Evidence

HardKAS enforces extreme accountability. Let's ask HardKAS to explain exactly what just happened by reading the receipt artifact generated in the previous step:

```bash
hardkas explain .hardkas/artifacts/receipts/txReceipt-<hash>.json
```
*(Replace `<hash>` with the actual hash printed in Step 4).*

**What this does:** HardKAS reads the receipt, traverses the Evidence DAG backward to the signature and the plan, and provides a human-readable explanation of the cryptographic causality.

---

### Next Steps
You have successfully completed the core HardKAS transaction lifecycle! 

To understand *why* we do it this way and what these artifacts represent, continue to the [First Transaction Deep Dive](./first-transaction.md).
