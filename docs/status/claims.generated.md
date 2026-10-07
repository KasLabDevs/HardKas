---
title: Release Claims
description: What HardKAS claims, what it explicitly does not claim, and the capability flags behind both.
---

<!-- GENERATED FILE - DO NOT EDIT BY HAND -->
<!-- Regenerate with: pnpm docs:generate-claims -->

# Release Claims

HardKAS `0.12.0-rc.26` (`hardened-alpha`, proof `repro-v0`, hash version `5`).

This page is generated from the code that enforces these claims. Every value
below is read from `packages/sdk` at generation time, so prose elsewhere in
`docs/` must link here rather than restate it.

Release status: `LOCAL_FIRST_DEVELOPER_RUNTIME_HARDENED`

## Certified

| Claim | Value |
| :---- | :---- |
| Local-first developer runtime | `READY` |
| Toccata v2 localnet baseline | `READY` |
| Corpus verifier | `READY` |
| Release gauntlet | `READY` |
| SDK/CLI parity | `READY` |

## Blocked or not claimed

| Claim | Value |
| :---- | :---- |
| Production readiness | `NOT_CLAIMED` |
| Testnet readiness | `BLOCKED_BY_POLICY` |
| Mainnet readiness | `BLOCKED_BY_POLICY` |
| L2 readiness | `NOT_CLAIMED` |
| Bridge readiness | `NOT_CLAIMED` |

Also explicitly not claimed:

- consensus validation
- full VM simulation
- strict simulator-vs-Docker equivalence
- trustless bridge
- on-chain ZK verification
- proof generation correctness
- full vProgs runtime
- vProgs API stability

## Programmability surface

Source: `programmabilityClaims()` in `packages/sdk/src/programmability.ts`.
Each value is pinned by a TypeScript literal type, so it cannot drift without a
compile error.

| Claim | Value |
| :---- | :---- |
| Artifact coherence | `READY_MATCH` |
| `silver.compile.v1` | `REAL_NODE_EVIDENCE` |
| `silver.p2sh.deploy-spend.v1` | `REAL_NODE_EVIDENCE` |
| `silver.p2sh.relative-timelock.v1` | `REAL_NODE_EVIDENCE` |
| `toccata.covenant.auth-1to1-transition.v1` | `REAL_NODE_EVIDENCE` |
| SilverScript compiler (official silverc, managed) | `OFFICIAL_SILVERC_V1_0_0_MANAGED` |
| General covenant support | `NOT_CLAIMED` |
| ZK corpus surface | `ZK_CORPUS_SURFACE_READY` |
| Groth16 fixture coherence | `READY_GROTH16_FIXTURE_COHERENCE` |
| RISC0 inspect surface | `RISC0_INSPECT_SURFACE_READY` |
| vProgs inspect surface | `VPROGS_INSPECT_SURFACE_READY` |
| Runtime outcome | `PARTIAL` |
| VM/consensus equivalence | `NOT_CLAIMED` |
| On-chain ZK verification | `NOT_CLAIMED` |
| vProgs runtime | `NOT_CLAIMED` |
| vProgs API stability | `NOT_CLAIMED` |
| Mainnet | `BLOCKED_BY_POLICY` |

## Capability flags

Source: `createHardkasCapabilities()` in `packages/sdk/src/capabilities.ts`.
These describe what the build contains and probe nothing. `silverScript`,
`covenants` and `transactionV1` depend on the environment, so they are false
here; the SDK's `capabilities.get()` derives them from the checks
`hardkas silver doctor` reports and from the kaspa-wasm the signer loads.
`covenants` covers the real builders only (1:1 auth-bound transitions,
`hardkas silver covenant genesis|transition`) and also needs the canonical node
to prove its identity. `sdkCovenantPlanning` is false: the SDK's
`covenants.planDeploy/planSpend` refuse.

Enabled:

- `artifacts`
- `lineageVerification`
- `deterministicHashing`
- `atomicPersistence`
- `workspaceLocks`
- `corruptionDetection`
- `secretRedaction`
- `mainnetGuards`
- `localnetSimulation`
- `ghostdagSimulation`
- `dagConflictResolution`
- `massProfiler`
- `simulationScenarios`
- `queryStore`
- `replayVerification`
- `schemaMigrations`
- `dockerNode`
- `scriptRunner`
- `testingFramework`

Disabled:

- `l2Profiles`
- `l2BridgeAssumptions`
- `consensusValidation`
- `productionWallet`
- `silverScript`
- `covenants`
- `sdkCovenantPlanning`
- `transactionV1`
- `trustlessExit`
- `differentialDagValidation`

## Trust boundaries

| Surface | Boundary |
| :------ | :------- |
| `replay` | `local-simulator-only` |
| `artifacts` | `internal-integrity-only` |
| `simulator` | `local-simulation-only` |
| `queryStore` | `rebuildable-read-model` |
| `l2Bridge` | `pre-zk-assumptions` |
