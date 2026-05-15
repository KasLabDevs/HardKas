# HardKAS Replay & Verification

Deterministic replay is a core pillar of the HardKAS "Hardened Alpha" transition. It allows developers to verify that a transaction execution can be reproduced bit-for-bit in a local simulation.

## 1. The Replay Workflow

When you run `hardkas replay verify <path>`, HardKAS performs the following steps:

1.  **Identity Check**: Verifies the receipt's `contentHash` and lineage.
2.  **Pre-state Alignment**: Checks if the current localnet state matches the `preStateHash` recorded in the receipt.
3.  **Simulation Execution**: Re-executes the transaction plan in a clean simulated environment.
4.  **Divergence Detection**: Compares the new execution result against the original receipt.
5.  **Audit Report**: Generates a report highlighting any mismatches.

## 2. Divergence Taxonomy

HardKAS classifies mismatches into specific issue codes to help developers diagnose the root cause:

| Code | Meaning | Severity |
| :--- | :--- | :--- |
| `preStateHash mismatch` | The current local state does not match the state when the original transaction was executed. | FATAL |
| `artifactHash mismatch` | The plan or receipt file has been tampered with or corrupted. | FATAL |
| `fee mismatch` | The re-calculated fee differs from the recorded fee (possible mass calculation change). | HIGH |
| `lineage loop` | A circular dependency was detected in the artifact chain. | HIGH |
| `network mismatch` | Attempting to replay a mainnet receipt on a simnet environment. | HIGH |

## 3. Guarantees & Limits

### What is Guaranteed:
- **Workflow Reproducibility**: If you use the same version of HardKAS and the same initial state, the `txReceipt` will be identical.
- **Economic Invariants**: Fees and amounts are verified to be consistent with the plan.
- **Deterministic Hashing (v3)**: Cross-platform identity is guaranteed via NFC and LF normalization.

### What is NOT Guaranteed:
- **Consensus Validity**: Replay proves the workflow is consistent, but it does NOT prove that a real Kaspa node would accept the transaction under protocol rules.
- **Finality Proof**: Replay happens in a local-first simulation; it does not represent network finality.

## 4. Replay Implementation Boundaries

Replay in HardKAS is an **Honest Model**. It explicitly acknowledges what it cannot verify:

- **Consensus Validation**: Set to `unimplemented` in reports to avoid false security claims.
- **Bridge Correctness**: Trust boundaries (MPC/Multisig) are documented but not cryptographically proven during replay.

> [!TIP]
> Always ensure your localnet state is clean before replaying high-value diagnostic artifacts. Use `hardkas node reset` if you encounter a `preStateHash mismatch`.
