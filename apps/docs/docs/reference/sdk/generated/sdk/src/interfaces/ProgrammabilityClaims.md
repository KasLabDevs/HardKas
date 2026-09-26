[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ProgrammabilityClaims

# Interface: ProgrammabilityClaims

Defined in: [packages/sdk/src/programmability.ts:19](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L19)

SilverScript claims mirror the exact capability IDs used across the corpus,
evidence records and `hardkas corpus verify`. Each REAL_NODE_EVIDENCE value
is backed by fixtures/toccata-v2/silver (recompiled by the managed silverc,
re-derived by the Kaspa SDK, evidenced by a verified rusty-kaspad 2.0.1).
Covenant support is exactly the 1:1 auth-bound transition; leader/cov-bound,
N:M, derived state mappings and signed covenant metering are not claimed.

## Properties

### artifactCoherence

> **artifactCoherence**: `"READY_MATCH"`

Defined in: [packages/sdk/src/programmability.ts:20](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L20)

***

### generalCovenantSupport

> **generalCovenantSupport**: `"NOT_CLAIMED"`

Defined in: [packages/sdk/src/programmability.ts:28](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L28)

***

### mainnet

> **mainnet**: `"BLOCKED_BY_POLICY"`

Defined in: [packages/sdk/src/programmability.ts:38](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L38)

***

### risc0InspectSurface

> **risc0InspectSurface**: `"RISC0_INSPECT_SURFACE_READY"`

Defined in: [packages/sdk/src/programmability.ts:31](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L31)

***

### runtimeOutcome

> **runtimeOutcome**: `"PARTIAL"`

Defined in: [packages/sdk/src/programmability.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L33)

***

### silverCapabilities

> **silverCapabilities**: `object`

Defined in: [packages/sdk/src/programmability.ts:21](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L21)

##### silver.compile.v1

> **silver.compile.v1**: `"REAL_NODE_EVIDENCE"`

##### silver.p2sh.deploy-spend.v1

> **silver.p2sh.deploy-spend.v1**: `"REAL_NODE_EVIDENCE"`

##### silver.p2sh.relative-timelock.v1

> **silver.p2sh.relative-timelock.v1**: `"REAL_NODE_EVIDENCE"`

##### toccata.covenant.auth-1to1-transition.v1

> **toccata.covenant.auth-1to1-transition.v1**: `"REAL_NODE_EVIDENCE"`

***

### silverCompiler

> **silverCompiler**: `"OFFICIAL_SILVERC_V1_0_0_MANAGED"`

Defined in: [packages/sdk/src/programmability.ts:27](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L27)

***

### vmConsensusEquivalence

> **vmConsensusEquivalence**: `"NOT_CLAIMED"`

Defined in: [packages/sdk/src/programmability.ts:34](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L34)

***

### vProgsInspectSurface

> **vProgsInspectSurface**: `"VPROGS_INSPECT_SURFACE_READY"`

Defined in: [packages/sdk/src/programmability.ts:32](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L32)

***

### vProgsRuntime

> **vProgsRuntime**: `"NOT_CLAIMED"`

Defined in: [packages/sdk/src/programmability.ts:36](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L36)

***

### vProgsStableApi

> **vProgsStableApi**: `"NOT_CLAIMED"`

Defined in: [packages/sdk/src/programmability.ts:37](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L37)

***

### zkCorpusSurface

> **zkCorpusSurface**: `"ZK_CORPUS_SURFACE_READY"`

Defined in: [packages/sdk/src/programmability.ts:29](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L29)

***

### zkLocalVerification

> **zkLocalVerification**: `"READY_GROTH16_FIXTURE_COHERENCE"`

Defined in: [packages/sdk/src/programmability.ts:30](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L30)

***

### zkOnchainVerification

> **zkOnchainVerification**: `"NOT_CLAIMED"`

Defined in: [packages/sdk/src/programmability.ts:35](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L35)
