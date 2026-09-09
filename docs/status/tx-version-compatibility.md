# HardKAS 0.10.x — Transaction Version Compatibility

This document outlines the compatibility between HardKAS transaction abstractions and Kaspa's transaction versions.

## Current Support Matrix

| Feature | Legacy TX (V0) | Toccata TX (V1) |
| --- | --- | --- |
| Standard Sends | Fully Supported | Supported via `version: 1` |
| Fee Estimation | Heuristic | Dynamic Toccata Fee Model |
| Signatures | ECDSA / Schnorr | Schnorr |
| Covenants | Unsupported | Native Support |
| Storage Mass | Unsupported | Calculated Contextually (Wire field available) |
| Compute Budget | Unsupported | Required for V1 |

## Covenants Status Matrix

| Capability | Status |
| --- | --- |
| Covenant binding/planning | ✅ |
| Covenant input authorizers | ✅ |
| Simnet deploy/spend E2E | ✅ |
| SilverScript compiler adapter | experimental |
| Mainnet production assurance | no auditado |

Kaspa L1 Covenants support in HardKAS is natively integrated and demonstrated. The `SilverScript` integration remains an experimental toolchain for compiling logic, but covenants at the transaction level do not depend on it. Storage Mass is exposed by the protocol (`storage_mass`), and HardKAS distinguishes between the wire field, contextual calculations, and manual user obligations.

## TxBuildRequest API

The `TxBuildRequest` (and `TxPlan`) explicitly models both versions without degrading the interface to `any`:

```typescript
export interface TxBuildRequest {
  readonly fromAddress: string;
  readonly outputs: readonly TxOutput[];
  readonly availableUtxos: readonly Utxo[];
  readonly feeRateSompiPerMass: bigint;
  readonly changeAddress?: string;
  
  // V1 Toccata capabilities
  readonly version?: 0 | 1;
  readonly computeBudget?: bigint;
  readonly storageMass?: bigint;
  readonly lane?: string;
  
  readonly feePolicy?: "legacy" | "toccata" | "auto";
}
```

## Fee Policy
- `"legacy"`: Forces V0 heuristic mass calculation.
- `"toccata"`: Forces V1 Toccata fee model estimation (uses `computeBudget`, `storageMass`).
- `"auto"`: Selects `toccata` if `version >= 1` or if the connected RPC node signals Toccata capabilities.
