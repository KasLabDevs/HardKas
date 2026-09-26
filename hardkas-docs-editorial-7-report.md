# HardKAS 0.12.0-rc.23 — Docs Editorial 7: Execution Environments

## Status: PASS

## 1. Environment Disambiguation
* **Objective:** Kill the confusion: Simulator ≠ Simnet ≠ Localnet ≠ Testnet ≠ Mainnet.
* **Action:** Authored `apps/docs/docs/concepts/execution-environments.md`.
* **Details:** I clearly mapped the 4 execution dimensions (Environment, Execution, Validation, Consensus, Evidence) across the 4 major deployment models (Pure Simulator, Localnet, Testnet, Mainnet). This conceptually separates HardKAS's internal vDAG/Planner from Kaspa WASM/real nodes.

## 2. Pedagogical Progression
* **Objective:** Create a two-step onboarding path (Simulator -> Localnet) that demonstrates capability scaling without framing it as an automatic "safety ladder".
* **Action:** Authored `apps/docs/docs/guides/simulator.md` and `apps/docs/docs/guides/localnet-node.md`.
* **Details:** 
  - **Simulator Guide:** Focuses on the "5-minute zero-infrastructure" path, highlighting the `hardkas verify` replay superpower.
  - **Localnet Node Guide:** Introduces `hardkas localnet start --profile toccata-v2`, `hardkas accounts real generate`, and `hardkas localnet fund`. It explicitly contrasts the Simulator's ability to replay state with the Real Node's design choice to **fail closed** on replays (since UTXO state has actually advanced on the Kaspa node).

## 3. Real Node Transaction Execution (Localnet)
* **Objective:** Execute the lifecycle against Docker `toccata-v2` to validate the CLI documentation against the system reality.
* **Action:**
  - Started the Localnet (`hardkas localnet start --profile toccata-v2`).
  - Successfully generated real developer accounts via `hardkas accounts real generate --unsafe-plaintext`.
  - Triggered `hardkas localnet fund` (Confirmed working, miner successfully funded the real accounts).
  - Executed the `tx plan` -> `tx sign` -> `tx send` pipeline.
  - Hit the known constraint where `hardkas replay` correctly fails on Real Node receipts because the UTXOs are spent, confirming the design behavior documented in the new guides.

## 4. Updates from Editorial 6
As requested, the following ledger items have been preserved/updated from Editorial 6:
* `SDK-CONTENTHASH-1` remains **OPEN** as a real code defect (cache-dependent `verify(contentHash)` resolution).
* `TYPEDOC-TYPECHECK-1` is recorded as **OPEN** (documentation generation succeeds via relaxed strictness, but the SDK graph is not natively type-clean).
* Internal roadmap terms ("Candidate B") have been scrubbed from the public-facing planning documentation.
* The blanket classification linking all experimental APIs to DEF20/22/23 has been removed from the conceptual layer, deferring to specific advanced qualification phases later.

---

**Next Phase Readiness:** The documentation now has a solid core structural spine:
`Getting Started → Concepts → Evidence → Transactions → CLI → SDK → Environments`.
We are greenlit to proceed to the second half: Testing, Wallets, Covenants/Toccata, Advanced Integrations, and Troubleshooting.
