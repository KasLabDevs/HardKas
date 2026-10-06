# Kaspa L1 Covenants Status

This document outlines the current support boundary for Kaspa L1 Covenants (KIP-17/KIP-20) in HardKAS.

## Supported
- ✅ **1:1 auth-bound covenants through the CLI**: `hardkas silver covenant genesis` creates a covenant and `hardkas silver covenant transition` advances it, as transaction v1 against the canonical localnet (`toccata.covenant.auth-1to1-transition.v1`, evidenced on a real node). `hardkas silver doctor` reports whether the toolchains and the canonical node are ready.
- ✅ **Covenant Artifact Generation**: builders can architect covenants and inspect properties structurally (`hardkas.covenants.buildCovenant()`, legacy).
- ✅ **Transaction v1 signing**: `hardkas.tx.sign()` signs a v1 plan for a node network with the managed kaspa-wasm, which signs v1.

## Not supported by the SDK
- ❌ **Covenant Deploy / Spend Plans**: `hardkas.covenants.planDeploy()` and `planSpend()` refuse with `COVENANT_PLAN_UNSUPPORTED`: the SDK cannot carry a covenant script, id or witness data into a v1 plan, and it never substitutes an ordinary payment.
- ❌ **Covenant RPC Queries**: `hardkas.covenants.inspect()` and `getState()` refuse with `COVENANT_INSPECT_UNSUPPORTED` / `COVENANT_STATE_UNSUPPORTED`, pending UTXO queries filtered by `covenantId`.
- ❌ **v1 plans in the simulator**: `hardkas.tx.sign()` refuses them with `TX_V1_SIMULATION_UNSUPPORTED`; the simulator does not model transaction v1.

`hardkas.covenants.isSupported()` answers whether covenant transactions can be built and submitted here: the managed silverc resolves, the managed kaspa-wasm is verified and signs v1, and the canonical node proves its identity (the checks `hardkas silver doctor` reports).

## Builder Lab Guardrails
We adhere strictly to the principle of "No Simulated Product Labs" or "Smoke and Mirrors".

We will not build simulated Covenant Vaults or products that falsely claim to execute covenant logic when the underlying protocol layers do not yet support it.
