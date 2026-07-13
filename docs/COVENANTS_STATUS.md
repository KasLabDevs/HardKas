# Kaspa L1 Covenants Status

This document outlines the current support boundary for Kaspa L1 Covenants (KIP-17/KIP-20) in HardKAS.

## Supported (Architecture Phase)
- ✅ **Covenant Artifact Generation**: Supported. Builders can architect covenants and inspect properties structurally.
- ✅ **Covenant Deploy Plan**: Supported via `hardkas.covenants.planDeploy()`. Constructs a valid `TxPlan` with `version: 1` and corresponding covenant output fields.
- ✅ **Covenant Spend Plan**: Supported via `hardkas.covenants.planSpend()`. Constructs a valid `TxPlan` with `version: 1` and corresponding covenant inputs.

## Blocked (Execution Phase)
- ❌ **Covenant Execution & Signing**: **NOT SUPPORTED YET**. Blocked by the underlying `kaspa-wasm` inability to sign V1 transactions. Calling `hardkas.tx.sign()` on a covenant plan will explicitly throw a `BLOCKED_BY_DEPENDENCY` error.
- ❌ **Covenant RPC Queries**: **BLOCKED**. Pending `kaspa-rpc` Toccata query surface upgrades (e.g., filtering `getUtxosByAddresses` by `covenantId`).

## Builder Lab Guardrails
We adhere strictly to the principle of "No Simulated Product Labs" or "Smoke and Mirrors". 

We will not build simulated Covenant Vaults or products that falsely claim to execute covenant logic when the underlying protocol layers do not yet support it. Developer lab activities regarding covenants are currently restricted to structural planning and artifact inspection. 

Real Builder Labs involving Covenants will commence only when real signing capabilities are introduced.
