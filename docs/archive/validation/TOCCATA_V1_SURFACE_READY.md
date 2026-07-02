# Toccata V1 Surface & Compatibility Detection

## Overview

HardKAS has integrated the structural surface area required to support Kaspa's Toccata upgrade (Transaction V1) without reimplementing consensus-critical logic. 
The V1 capabilities are detected securely via the officially installed `kaspa-wasm` module, ensuring HardKAS acts strictly as an orchestrator.

## Changes Implemented

1. **Kaspa RPC V1 Schemas**: 
   - Mapped `computeBudget` into `KaspaRpcTransactionInput`.
   - Mapped `covenant` into `KaspaRpcTransactionOutput`.
   - Mapped `covenantId` into `KaspaRpcUtxo`.
   - Mapped `storageMass` into `KaspaRpcTransaction` mapping fallback from `mass`.
   
2. **Transaction Builder**:
   - Extended `TxBuildRequest` and `TxPlan` to accept and pass through `computeBudget`.
   - Extended `TxOutput` to accept `covenant` payloads.
   - Extended `Utxo` to include `covenantId`.

3. **Capability Detection Gateway**:
   - Developed dynamic detection in `signer-backend.ts` to deduce if `kaspa-wasm` supports V1 transaction signing capabilities.
   - Added a strict guard in `KaspaWasmPrivateKeySigner`: if a `TxPlan` includes V1 parameters (`computeBudget` or `covenant`) but the installed WASM SDK does not support it, a strict architectural exception `Transaction V1 signing is not supported by the installed kaspa-wasm version` is thrown, preventing undefined behavior.

4. **RPC Normalization**:
   - `KaspaWrpcClient.submitTransaction` now conditionally passes V1 properties if `tx.version === 1`, isolating V0 compatibility strictly.

## Validation Evidence

Executed structural test via `test-v1-surface.ts` locally:

```text
Checking Kaspa SDK capabilities...
Backend Available: true
V1 Signing Capability: false

[1] Structural V1 Test (TxBuilder)
TxPlan generated successfully.
Has computeBudget: true
Has covenant on output: true

[2] Capability Gateway Test
✅ Expected V1 Capability Exception caught.
```

The capability gateway functions optimally. V1 execution is structurally supported and safely blocked until `kaspanet/rusty-kaspa` officially releases the WASM SDK upgrades.
