---
title: "Transaction Version Compatibility"
description: "How HardKAS transaction abstractions map to Kaspa's transaction versions, v0 and Toccata's v1."
---

# Transaction Version Compatibility
This document outlines the compatibility between HardKAS transaction abstractions and Kaspa's transaction versions.

## Current Support Matrix

| Feature | Legacy TX (V0) | Toccata TX (V1) |
| --- | --- | --- |
| Standard Sends | Fully Supported | Supported via `version: 1` |
| Fee Estimation | Heuristic | Dynamic Toccata Fee Model |
| Signatures | Schnorr and ECDSA P2PK (`accounts real generate\|import --ecdsa`; mixed inputs; ECDSA signed with RFC 6979, low-S); consolidations stay Schnorr-only | Schnorr (P2PK inputs; contract slots by the v1 engine); ECDSA refused (`ECDSA_SPEND_NOT_SUPPORTED`) |
| Covenants | Unsupported | Native Support |
| Storage Mass | Computed by HardKAS (the node's formula) for the plan's mass and fee; the signed transaction **commits 0** (format kept on purpose). The node's mempool sets its own value, equal to HardKAS's, and mines it under the same txid: the id does not cover the field | Committed by the v1 engine (the node's value) |
| Lock Time | A typed absolute lock time on payments and SilverScript spends (`--lock-time-daa`, `--lock-time-ms`), bound into the plan and sent only once the node passes it; 0 on the simulator and in consolidations | A typed absolute lock time on contract spends and covenant transitions (`planContractSpend`, `planTransition`, `silver spend --tx-version 1`), checked against the entry's `tx.daa` / `tx.time` statements |
| Compute Budget | Unsupported | Required for V1 |

RC1 · D1 · the v0 storage-mass commitment, measured: a fixture payment's txid, fee and mass are pinned by
`packages/accounts/test/v0-storage-mass-compat-rc1-d1.test.ts` (txid `b26f6c31…f9d0`, fee 315 400 sompi, mass 4 890,
committed storage mass 0); against rusty-kaspad v2.1.0 on simnet (`send-sync-v0-mass-rc1.simnet`) a HardKAS v0 payment
committing 0 is held by the node's mempool with HardKAS's computed storage mass (9 701) and the plan's exact fee
(315 400), mined in a block with that value under the signed txid, and the recipient's output holds exactly the amount
planned. The signed artifact therefore differs from the mined transaction in that one field. Changing the v0
representation would change certified signed records: it needs a new, versioned format and the owner's decision.
Absolute time locks and ECDSA spends: `docs/proposals/cltv-and-ecdsa-spends.md`.

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

The interface above is abridged (it also has `payloadBytes`, `virtualDaaScore`, `coinbaseMaturity`, `networkId`,
`feeOverrideSompi` and more: `packages/tx-builder/src/index.ts`).

## Fee Policy
`feePolicy` is declared but read by nothing: the three values change nothing in the plan or its fee.
