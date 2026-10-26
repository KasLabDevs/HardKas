# Kaspa L1 Covenants Status

This document outlines the current support boundary for Kaspa L1 Covenants (KIP-17/KIP-20) in HardKAS.

## Supported
- ✅ **1:1 auth-bound covenants through the CLI**: `hardkas silver covenant genesis` creates a covenant and `hardkas silver covenant transition` advances it, as transaction v1 against the canonical localnet (`toccata.covenant.auth-1to1-transition.v1`, evidenced on a real node). `hardkas silver doctor` reports whether the toolchains and the canonical node are ready.
- ✅ **Covenant Artifact Generation**: builders can architect covenants and inspect properties structurally (`hardkas.covenants.buildCovenant()`, legacy).
- ✅ **Transaction v1 signing**: `hardkas.tx.sign()` signs a v1 plan for a node network with the managed kaspa-wasm, which signs v1.
- ✅ **One v1 engine for covenants**: `hardkas silver covenant genesis` and `covenant transition` plan, check, sign and send with the SDK's engine (`hardkas.covenants`), as `hardkas silver engine` and the SDK do. `hardkas silver deploy` and `spend` keep sending transaction v0 by default (the certified path) and use the engine only with `--tx-version 1`. Normal payments, batches and consolidations stay transaction v0.
- ✅ **Covenant history and lineage from the workspace's records**: `hardkas.covenants.history()`, `lineage()`, `inspect()` and `getState()` (and `hardkas silver covenant inspect`) follow a covenant through this workspace's own records and the node's unspent outputs at its addresses. The genesis is anchored by recomputing its covenant id (consensus `covenant_id`), transitions are linked by the outpoints they spend, and each live output's declared state is checked against its address. The node has no query by covenant id: a transaction this workspace did not record is not seen, only its effect (an output the lineage expects unspent is not listed).

## Not supported by the SDK
- ❌ **Covenant Deploy / Spend Plans (script/witness forms)**: `hardkas.covenants.planDeploy()` and `planSpend()` refuse with `COVENANT_PLAN_UNSUPPORTED` and never substitute an ordinary payment; the v1 engine plans covenants with `planGenesis()`, `planTransition()`, `planContractDeploy()` and `planContractSpend()`.
- ❌ **Covenant queries by id at the node**: there is no RPC that lists UTXOs by `covenantId`; HardKAS does not invent one (see the lineage above).
- ❌ **v1 plans in the simulator**: `hardkas.tx.sign()` refuses them with `TX_V1_SIMULATION_UNSUPPORTED`; the simulator does not model transaction v1.

`hardkas.covenants.isSupported()` answers whether covenant transactions can be built and submitted here: the managed silverc resolves, the managed kaspa-wasm is verified and signs v1, and the canonical node proves its identity (the checks `hardkas silver doctor` reports).

## Builder Lab Guardrails
We adhere strictly to the principle of "No Simulated Product Labs" or "Smoke and Mirrors".

We will not build simulated Covenant Vaults or products that falsely claim to execute covenant logic when the underlying protocol layers do not yet support it.
