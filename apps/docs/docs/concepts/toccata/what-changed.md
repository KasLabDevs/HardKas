# What Toccata Changed

> **L1 Status:** ACTIVE CONSENSUS | **SilverScript:** OFFICIAL RELEASE v1.0.0 | **vProgs:** ACTIVE DEVELOPMENT / PROTOTYPE

The Toccata hard fork (activated on Mainnet at DAA `474,165,565` on June 30, 2026) is the most significant upgrade to the Kaspa protocol since its inception. 

However, **Toccata did not turn Kaspa into an EVM.** It strictly extends Kaspa's UTXO-native L1 validation model.

## The Canonical Invariant

> Toccata extends Kaspa's UTXO-native L1 validation model. It does not turn Kaspa into an EVM/account-chain execution environment.

## The Core Primitives

Toccata introduced four primary active consensus capabilities (formally KIPs 16, 17, 20, 21), while also implementing the functionality for transaction v1 and compute pricing (currently documented as KIP-24/25 PRs):

1. **Transaction v1 & Compute Budget:** A new transaction format (v1) introducing compute budgets (`compute_budget`) to replace the legacy `sig_op_count`, enabling accurate script unit pricing (functionality mapped to KIP-24/25).
2. **Covenant Introspection:** Kaspa Script was extended with opcodes that allow a UTXO to introspect the transaction spending it. This allows a script to constrain its own successor outputs (KIP-17).
3. **Covenant IDs:** A non-forgeable, 32-byte identifier tracked by consensus that persists across a covenant's UTXO lineage, enabling off-chain indexers to easily track state evolution (KIP-20).
4. **ZK Verification & Sequencers:** A new native opcode (`OpZkPrecompile`) to verify Zero-Knowledge proofs directly on L1, along with partitioned sequencing commitments via User Lanes (KIP-16/21).

## L1 Covenants vs L2 Rollups vs Based ZK Apps

Do not collapse these categories. They have fundamentally different execution and trust models:

### 1. L1 Covenants (Toccata)
* **What it is:** A UTXO with a Kaspa Script that constrains how it can be spent and what output must be created next.
* **Execution:** Evaluated natively by every Kaspa node during UTXO spend validation.
* **Status:** `ACTIVE CONSENSUS`.

### 2. Based ZK Applications (vProgs)
* **What it is:** An application architecture where execution happens entirely off-chain, and Kaspa L1 is only used to verify the resulting ZK proof (via `OpZkPrecompile`) and commit to the state sequence.
* **Execution:** Off-chain Prover $\rightarrow$ L1 Proof Verification.
* **Status:** `ACTIVE DEVELOPMENT / PROTOTYPE`.

### 3. Layer 2 Networks (Igra / Kasplex L2)
* **What it is:** Separate blockchain networks (often DAGs themselves) that use Kaspa as a Data Availability (DA) and settlement layer.
* **Execution:** Independent L2 nodes.
* **Status:** External architecture (not documented in HardKAS Toccata boundaries).

## July 2026 Documentation Reconciliation

*Historical Note:* Internal architecture documents from July 2026 (prior to the v1.0.0 releases of `rusty-kaspa` and `silverscript`) contained speculative language describing SilverScript as "pre-v1" and Toccata activation as "pending."
Those documents are officially **SUPERSEDED** by the current reality. Toccata is active, and SilverScript is an official V1 release. However, references to `vProgs` in those documents remain prototypes unless otherwise proven by current implementations.

