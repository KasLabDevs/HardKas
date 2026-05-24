# HardKas Transaction Pipeline Audit (tx plan)

## 1. Scope
This audit analyzes the HardKas transaction planning pipeline, focusing on the `hardkas tx plan` command and the `@hardkas/tx-builder` package. The processes evaluated include:
- Account and network resolution.
- UTXO retrieval and selection.
- Mass and fee calculation.
- Generation of `txPlan` artifacts.
- Determinism and reproducibility of the pipeline.

## 2. Executive Summary
The `tx plan` pipeline implements a decoupled, artifact-based architecture, which is excellent for auditing and CI/CD workflows. The mass calculation logic is protocol-aware (P2PK/Schnorr), and coin selection follows a simple accumulation strategy. HardKas's central goal is not to be a commercial wallet engine, but a **"developer-safe deterministic planner"**. However, the system has weaknesses in **deterministic reproducibility** (lack of canonical ordering in ties), which directly impacts the stability of artifact hashes.

**General Status: SOLID ARCHITECTURE / NEEDS DETERMINISTIC HARDENING**

## 3. Pipeline Flow
The observed execution flow is:
`runTxPlan()` 
  → `resolveHardkasAccountAddress` (Sender/receiver resolution)
  → `RPC: getUtxosByAddress` (Real balance retrieval)
  → `buildPaymentPlan` (UTXO selection and mass calculation)
  → `createTxPlanArtifact` (JSON generation signed by hash)

## 4. Fee Rate Review
- **Configurability**: Supported via CLI and config.
- **Dynamic**: **NO**. The fee-rate is static; it does not consult the network congestion state (mempool).
- **Calculation**: `mass * feeRate`. Correct according to the Kaspa protocol.
- **Risk**: On Mainnet, an outdated static fee-rate can cause stuck transactions or unnecessary overpayments.

## 5. Mass Calculation Review
- **Implementation**: Located in `@hardkas/tx-builder/mass.ts`.
- **Accuracy**: Uses constants for P2PK/Schnorr (Base: 100, Input: 150, Output: 50).
- **Assumptions**: Explicitly documents that it assumes Schnorr signatures.
- **Risk**: `estimated mass != final signed mass`. If the real signature exceeds the prediction due to DER size variations (although Schnorr is fixed, the signature script could vary), the transaction could be rejected for insufficient fee.

## 6. UTXO Selection Review
- **Strategy**: **Smallest-First Accumulation**. Sorts UTXOs from smallest to largest amount and accumulates until the target + fee is covered.
- **Optimization**: There is no consolidation or mass minimization logic.
- **Fragmentation**: This strategy tends to clear "dust" (small UTXOs) but can generate transactions with many inputs if the balance is highly fragmented, increasing the total fee.

## 7. Output Construction Review
- **Change**: Correctly implemented. A change output is generated if there is an amount left over after subtracting the payment and the fee.
- **Dust Limit**: No explicit "dust avoidance" policy is observed for the change output. If the change is minuscule, it should be burned as an additional fee instead of creating an economically useless UTXO.

## 8. Deterministic Ordering Audit
**Critical Finding: WEAK REPRODUCIBILITY**
- **Inputs**: `buildPaymentPlan` sorts UTXOs by `amountSompi` (ascending).
- **Tie-breaking**: If there are multiple UTXOs with the same amount, the order depends on the array returned by the RPC. The RPC does not guarantee deterministic order.
- **Outputs**: Maintained in input order; there is no canonical ordering (BIP69-style).

**Risk**: Two identical `tx plan` calls can produce two artifacts with different `planId` (hashes) if the RPC alters the order of UTXOs with identical amounts.

## 9. Artifact Integrity
- **Schemas**: Correctly typed and versioned (`hardkas.txPlan`).
- **BigInt**: Correctly handled via strings in JSON to avoid loss of precision.
- **Audit**: The artifact contains all the information necessary for signing (`inputs`, `outputs`, `amount`, `network`).

## 10. Side Effects Audit
- **Pipeline**: Purely local read and calculation. 
- **Broadcast**: Does not occur in this phase.
- **Security**: Does not require private keys for this phase.

## 11. Determinism Risk Matrix

| Area | Deterministic | Notes |
| :--- | :--- | :--- |
| Fee formula | YES | Pure formula. |
| Artifact schema | YES | Stable and typed. |
| UTXO retrieval | **NO** | Depends on RPC response order. |
| Coin selection | **PARTIAL** | Lacks canonical tie-breaking (e.g., by txid:index). |
| Output ordering | **NO** | No canonical sorting. |
| Final hash | **PARTIAL** | Unstable with input order changes for identical amounts. |

## 12. Architectural Findings

### GOOD
- **Decoupling**: The `plan -> sign -> send` separation is impeccable.
- **Transparency**: Itemized mass calculation allows debugging fee issues.

### WEAKNESSES
- **Reproducibility**: Potential inconsistencies in artifact hashes.
- **Optimization**: Basic selection strategy.
- **Dust Policy**: Lack of protection against micro-UTXO creation.

## 13. Recommended Stability Classification
- **tx plan architecture**: SOLID
- **fee calculation**: GOOD
- **mass estimation**: GOOD FOR DEV / PARTIAL FOR STRICT FINALITY
- **UTXO selection**: BASIC BUT ACCEPTABLE
- **deterministic reproducibility**: **NEEDS HARDENING** (Impacts Artifacts)
- **wallet optimization**: OUT OF SCOPE FOR NOW

## 14. Recommendations

### P0 — Reproducibility (Maximum Priority)
- **Deterministic Tie-break**: Implement secondary sorting by `txid` (lexicographical) and `index` (ascending) for inputs of equal amount. This guarantees an identical `planId` for any RPC response.
- **Selection Strategy in Artifact**: Explicitly persist the `selectionStrategy` used within the artifact for reconstruction auditing.

### P1 — Robustness
- **Dust Threshold**: Formalize a minimum limit for creating change outputs to avoid useless micro-fragmentation.

### P2 — Dev Flexibility
- **Selection Strategies**: Implement optional modes (e.g., `consolidate`, `minimize-mass`) to facilitate mass limit testing.

### P3 — Dynamism
- **Dynamic Fees**: Allow RPC fee-rate consultation (low priority for local environments).

## 15. Proposed Pipeline v1 (Hardened)
1. Resolve Accounts
2. Fetch UTXOs from RPC
3. **Canonical Pre-Sort (txid:index)**
4. Deterministic Coin Selection (Smallest-first + Tie-break)
5. Mass Estimation
6. Fee Calculation
7. Dust Elimination (Merge tiny change into fee)
8. **Canonical Output Sort**
9. Emit Stable txPlan Artifact

## 16. Final Assessment
HardKas `tx plan` is a robust and very well-structured planner. Its greatest current challenge is not financial optimization, but **technical determinism** to ensure the artifact pipeline is 100% reproducible and reliable in CI/CD environments.

## 17. Checklist
- [x] Review fee-rate
- [x] Review mass calculation
- [x] Review UTXO selection
- [x] Review outputs
- [x] Review deterministic ordering
- [x] No modifications to runtime logic
- [x] No modifications to tx-builder
- [x] No modifications to runners
- [x] Document audit only

## Guardrails
No modifications to runtime logic.
No modifications to tx-builder.
No modifications to runners.
No modifications to commands.
This is a documentary audit.
