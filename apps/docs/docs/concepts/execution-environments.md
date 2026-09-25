# Execution Environments

HardKAS enforces a strict conceptual separation between **where a transaction is constructed**, **where it is validated**, and **how it achieves consensus**.

If you only remember one thing from this page, let it be this:
**`Simulator ≠ Simnet ≠ Localnet ≠ Testnet ≠ Mainnet`**

Mixing these up leads to invalid evidence, failed transaction plans, and rejected broadcasts.

## The Four Dimensions of Execution

Every HardKAS environment is defined by four distinct properties:

1. **Environment:** The network namespace and address prefix (`simnet`, `testnet-10`, `mainnet`, or pure `simulator`).
2. **Execution:** The engine calculating the transaction plan (HardKAS internal planner vs Kaspa WASM).
3. **Validation:** Who verifies the signatures and rules (HardKAS Simulator vs Kaspa node).
4. **Consensus:** Who accepts the transaction into a block DAG (Simulator vDAG vs Real Network).
5. **Evidence:** What cryptographic proof is produced (Simulator Trace vs Real Node Receipt).

---

## 1. Pure Simulator (`mode: "simulator"`)

The Simulator is a **local, synchronous, zero-infrastructure** environment. It runs entirely in-memory within the HardKAS process.

* **Environment:** `kaspa-l1` (Internal synthetic namespace).
* **Execution:** HardKAS Core Planner.
* **Validation:** HardKAS internal consensus engine (validates signatures, amounts, fees).
* **Consensus:** Synthetic virtual DAG (vDAG). Blocks are instantaneous.
* **Evidence:** Local execution trace (`receipt.json` without real Kaspa `txId`).
* **Replay:** `hardkas verify` can achieve 100% deterministic replay from `plan.json`.

**When to use:** TDD, continuous integration, rapid UI prototyping, unit testing policies and workflows.

## 2. Localnet (`mode: "localnet", network: "simnet"`)

Localnet is a **real Kaspa network running locally** (typically via Docker, e.g., Toccata). It requires a running `kaspad` node.

* **Environment:** `simnet` (Addresses start with `kaspasim:`).
* **Execution:** Kaspa WASM Planner (via RPC).
* **Validation:** Real Kaspa Node (`kaspad`).
* **Consensus:** Local CPU miner. Blocks obey Kaspa consensus rules.
* **Evidence:** Real Node Receipt (`txId` exists in the local DAG).
* **Replay:** `hardkas verify` checks artifact integrity, but *cannot* do a pure stateless replay of the transaction because UTXO states have advanced in the real node. Real-node replays "fail closed" by design to prevent state corruption.

**When to use:** First integration testing, DApp end-to-end testing, local blockchain explorers, realistic latency/mining simulations.

## 3. Testnet (`network: "testnet-10"`)

Testnet is the public Kaspa testing network. It behaves exactly like Mainnet but uses valueless coins.

* **Environment:** `testnet-10` (Addresses start with `kaspatest:`).
* **Execution:** Kaspa WASM Planner (via public/private RPC).
* **Validation:** Public Kaspa Network.
* **Consensus:** Global Proof-of-Work (PoW).
* **Evidence:** Real Node Receipt, verifiable on public block explorers.
* **Replay:** Fails closed (same as Localnet).

**When to use:** Final staging, public beta testing, cross-team integration.

## 4. Mainnet (`network: "mainnet"`)

The real Kaspa network. Value is at stake.

* **Environment:** `mainnet` (Addresses start with `kaspa:`).
* **Execution:** Kaspa WASM Planner.
* **Validation & Consensus:** Global PoW.
* **Evidence:** Permanent, immutable public ledger inclusion.

**When to use:** Production deployments, real value transfers.

---

## Pedagogical Progression

HardKAS is designed to escalate smoothly through these environments without changing your application code:

1. **5-Minute Development (Simulator):** Start here. Get your workflow compiling, policies passing, and tests green. No infrastructure required.
2. **First Real Node (Localnet):** Run `hardkas localnet start`. Point your SDK to `simnet`. Discover how your app handles block mining latency, real RPC errors, and real Kaspa cryptography.
3. **Staging (Testnet):** Point your config to a public testnet RPC. Give your application to beta testers.
4. **Production (Mainnet):** The final step. HardKAS ensures that the transaction shape you tested in the Simulator and Localnet is mathematically identical to what broadcasts on Mainnet.
