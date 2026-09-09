---
title: Release Claims
description: What HardKAS claims, what it explicitly does not claim, and the capability flags behind both.
---

<!-- GENERATED FILE - DO NOT EDIT BY HAND -->
<!-- Regenerate with: pnpm docs:generate-claims -->

# Release Claims

HardKAS `0.12.0-rc.20` (`hardened-alpha`, proof `repro-v0`, hash version `4`).

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
| SilverScript builder | `SILVERSCRIPT_BUILDER_READY` |
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
These are the static defaults; `hardkas capabilities` probes the environment and
may enable `silverScript`, `covenants`, and `transactionV1` at runtime.

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
- `l2Profiles`
- `l2BridgeAssumptions`

Disabled:

- `consensusValidation`
- `productionWallet`
- `silverScript`
- `covenants`
- `transactionV1`
- `trustlessExit`
- `differentialDagValidation`

## Trust boundaries

| Surface | Boundary |
| :------ | :------- |
| `replay` | `local-workflow-only` |
| `artifacts` | `internal-integrity-only` |
| `simulator` | `local-simulation-only` |
| `queryStore` | `rebuildable-read-model` |
| `l2Bridge` | `pre-zk-assumptions` |
