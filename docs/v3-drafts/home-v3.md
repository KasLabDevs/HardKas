---
Status: DRAFT
Source baseline: HardKAS 0.12.0-rc.12
Audience: Public documentation / product architecture
Claims policy: Code-backed only
---

# Home V3: Execution-safe development for Kaspa

## 01 Hero
**Execution-safe development for Kaspa.**
HardKAS makes execution assumptions explicit, verifies artifact lineage, and rejects incompatible workflow boundaries before supported operations proceed.

## 02 The Problem
### The old way
```text
request → mutation → hope
```
Developing on blockchain traditionally means throwing transactions into the network and hoping they confirm as expected. If they fail, debugging relies on reading node logs.

### The HardKAS way
```text
intent → artifact → verify → execute → replay
```
HardKAS transforms transactions into reproducible workflows. Critical workflow stages produce versioned, verifiable artifacts with explicit lineage.

## 03 Execution Contract
The **Execution Contract** makes the intended execution boundary explicit, allowing HardKAS to reject incompatible execution contexts.

It is represented by a simple tuple that explicitly declares the target environment:

```typescript
type ExecutionTarget = {
  mode: "simulator" | "localnet" | "rpc" | "l2-rpc";
  domain: "kaspa-l1" | "evm-l2";
  network: string; // e.g. "simnet", "mainnet"
};
```

## 04 Execution Guard
Before supported execution operations proceed, HardKAS validates the execution target and account compatibility.

**For example:** If you try to sign a transaction with a synthetic simulator account but target a real RPC network, the Guard stops it instantly.

```text
Account
kind = synthetic

Target
mode = rpc
domain = kaspa-l1
network = mainnet

                    │
                    ▼
         EXECUTION MODE MISMATCH
                    ✕
```

## 05 Artifacts
Transactions are not just API calls; they are **Artifacts** (`TxPlan`, `SignedTx`, `TxReceipt`).
*   **Hashes:** Canonical hashing gives artifacts stable semantic identity independent of non-semantic representation details.
*   **Lineage:** Artifacts can record parentArtifactId and rootArtifactId, making causal relationships between workflow stages verifiable.
*   **Provenance:** Artifacts preserve the execution and lineage metadata defined by their schema.

## 06 Replay
**Why did this transaction behave differently?**

Instead of guessing, use the HardKAS Replay engine. It reconstructs the recorded local execution context and verifies the transition against the original artifacts and invariants.

```text
TxReceipt
   │
   ├─ sourcePlanId
   ├─ DAA score
   └─ lineage
           │
           ▼
reconstructStateAtDaa(receiptDaa - 1)
           │
           ▼
      replay transition
           │
           ▼
   ┌───────┼──────────┐
   ▼       ▼          ▼
lineage determinism contamination
  OK       OK          OK

              PASS
```

## 07 Execution Environments
HardKAS exposes three execution environments with increasing proximity to real network behavior.

```text
Fast feedback                         External network
     │                                      │
Simulator           Localnet              RPC
     ───────────────────────────────────────►
           increasing execution fidelity
```

### Coherence Simulator
Fast, synthetic coherence testing without a Kaspa node.
*   **What it validates:** transaction structure, fees, Tx v0/v1 planning, compute budgets, lightweight DAG behavior.
*   **What it does NOT claim:** Kaspa VM equivalence, native script execution, native signing, full consensus validation.

### Localnet
Localnet moves the workflow across the real node, signing, and consensus boundary without requiring a public network.

## 08 Capability Honesty
HardKAS reports capability state explicitly instead of hiding unavailable or experimental behavior:
*   🟢 **SUPPORTED**: HardKAS implements this operation.
*   🟡 **EXPERIMENTAL**: Available, but API/schema may change.
*   🔴 **BLOCKED_BY_DEPENDENCY**: Architected in HardKAS, but blocked by external dependencies.
*   ⚪ **NOT_CLAIMED**: Explicitly not supported or guaranteed by HardKAS.

## 09 Toccata Support
**Toccata support without pretend execution.**

HardKAS exposes upstream capability boundaries rather than replacing unavailable protocol behavior with mocks.

| Feature | Status |
| :--- | :--- |
| Transaction v1 planning | 🟢 SUPPORTED |
| Compute budget planning | 🟢 SUPPORTED |
| Lane metadata | 🟢 SUPPORTED |
| Covenant planning | 🟢 SUPPORTED |
| Fee estimation | 🟢 SUPPORTED |
| Covenant signing | 🔴 BLOCKED_BY_DEPENDENCY |
| Covenant execution | 🔴 BLOCKED_BY_DEPENDENCY |
| SilverScript tooling | 🟡 EXPERIMENTAL |
| ZK corpus | 🟡 EXPERIMENTAL |
| VM consensus equivalence | ⚪ NOT_CLAIMED |

## 10 Architecture
HardKAS enforces a strict layer separation to maintain a clean boundary with the underlying node.
*   **Level 1 (RPC):** Strict 1:1 mapping with the node. Zero business logic.
*   **Level 2 (Toolkit):** Watchers, subscriptions, and translation of raw mechanics.
*   **Level 3 (SDK):** High-level developer facade and workflow orchestration.

## 11 Quickstart
The first time a developer can explain a previous transaction from its artifacts instead of from logs.

1.  Start a local Toccata node:
    `hardkas localnet start --profile toccata-v2`
2.  Create a transaction plan:
    `hardkas tx plan --from alice --to bob --amount 10 --network simnet --out tx-plan.json`
3.  Sign the transaction:
    `hardkas tx sign tx-plan.json --account alice --out tx-signed.json`
4.  Execute the transaction against the network:
    `hardkas tx send tx-signed.json --network simnet --yes`
5.  Compare the signed artifact with the resulting receipt:
    `hardkas tx compare tx-signed.json tx-receipt.json`

## 12 Builder Labs
*(Showcase of reference examples and workshops powered by HardKAS: Wallet backends, Checkout systems, Local indexers, etc.)*

## 13 Security Boundaries
HardKAS can enforce policy gates that block mainnet execution by default in supported workflows. 
HardKAS is developer infrastructure, not a custody or consensus-security layer.

## 14 Get Started
Ready to build execution-safe workflows?
*(Link to GitHub / Installation guide)*
