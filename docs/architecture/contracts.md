# HardKAS Public Contracts

This document defines the stable interfaces and schemas for the HardKAS ecosystem. These are "frozen" and should not be changed without a formal version bump.

## 1. Artifact Contract (@hardkas/artifacts)

The Artifact system is the primary source of truth for transaction plans, signed transactions, and receipts.

### TxPlanArtifact (v1/v2)
- **Stable Schema**: `hardkas.txPlan.v1`, `hardkas.txPlan.v2`
- **Core Fields**:
  - `planId`: Unique identifier (UUID/Hash).
  - `networkId`: Target network (mainnet, testnet-10, simnet).
  - `amountSompi`: BigInt string.
  - `inputs`: UTXO outpoints being spent.
  - `outputs`: Recipient and change addresses.

### SignedTxArtifact (v1/v2)
- **Stable Schema**: `hardkas.signedTx.v1`, `hardkas.signedTx.v2`
- **Core Fields**:
  - `signedId`: Hash of the signed transaction.
  - `sourcePlanId`: Reference to the original plan.
  - `signedTransaction`: Payload (hex) and format.

### TxReceiptArtifact (v1/v2)
- **Stable Schema**: `hardkas.txReceipt.v1`, `hardkas.txReceipt.v2`
- **Core Fields**:
  - `txId`: Canonical Kaspa Transaction ID.
  - `status`: `submitted` | `accepted` | `confirmed` | `finalized` | `failed`.
  - `daaScore`: Inclusion score.

---

## 2. Event Contract (@hardkas/core/events)

The Event Bus uses a fire-and-forget typed stream for observability.

- **Stable Kinds**:
  - `workflow.*`: Plan creation, signing, submission, receipt.
  - `rpc.*`: Health checks, errors, stale node detection.
  - `integrity.*`: Hash mismatches, schema violations.
  - `dag.*`: Conflicts, displacements, reorgs.
  - `replay.*`: Divergence detection between simulation and reality.
- **Envelope**:
  - `ts`: ISO 8601 Timestamp (attached by bus).
  - `kind`: Event identifier.
  - Data fields specific to each kind.

---

## 3. Query Contract (@hardkas/query)

The Operational Query Layer provides introspection across domains.

- **Stable Methods**:
  - `correlate(txId)`: Deep cross-domain correlation (Lineage + DAG + RPC + Replay).
  - `engine.query(filter)`: Domain-agnostic artifact search.
- **Stable Outputs**:
  - `CorrelationBundle`: Unified report structure.

---

## 4. SDK Contract (@hardkas/sdk)

The high-level facade for developers.

- **Stable Class**: `Hardkas`
- **Stable Properties**:
  - `.accounts`: Key management and address derivation.
  - `.tx`: Transaction lifecycle (plan, sign, send, receipt, trace).
  - `.query`: Introspection and operational history.
  - `.localnet`: Control plane for simulated environments.
  - `.l2`: Igra and other L2 integrations.
- **Stable Entry Points**:
  - `Hardkas.open(path)`: Standard project initialization.

---

## Contract Verification

These contracts are enforced via:
1.  **TypeScript Strict Mode**: Zero-tolerance for `any` in public interfaces.
2.  **Schema Validation**: `zod` schemas in `@hardkas/artifacts` for all JSON I/O.
3.  **Golden Fixtures**: Binary and JSON fixtures in `packages/artifacts/test/fixtures` checked in CI.
