# Kaspa L1 Toccata: Transaction V1 Status

This document outlines the current support boundary for Toccata TX V1 features in HardKAS.

## Supported (Plan & Builder Phase)
- ✅ **V1 TxPlan generation**: Supported via `hardkas.tx.plan({ version: 1 })`.
- ✅ **V1 Fee Estimation**: Supported. Automatically applies the Toccata fee floor (`100 sompi * max(computeGrams, 2 * transaction bytes)`).
- ✅ **Compute Budget & Lanes**: Supported. Builder schemas explicitly support `computeBudget`, `lane`, and `computeGrams`.

## Blocked (Execution & Sign Phase)
- ❌ **V1 Signing**: **BLOCKED BY DEPENDENCY**. The current version of `kaspa-wasm` does not natively support building or signing V1 transactions. Attempting to call `hardkas.tx.sign()` on a V1 plan will intentionally throw a `BLOCKED_BY_DEPENDENCY` error.
- ❌ **V1 Broadcast**: **BLOCKED**. We cannot broadcast an unsigned or improperly serialized V1 transaction.

## Framework Policy
HardKAS will not simulate, mock, or fake TX V1 execution. V1 plans can be architected, structurally validated, and inspected in code, but end-to-end execution is halted strictly at the signing boundary. 

Full execution pipelines for V1 will only be enabled when:
1. `kaspa-wasm` supports V1 signing natively.
2. OR an official external toolchain provides V1 serialization and signing that HardKAS can wrap.
