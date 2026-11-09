[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ProgrammabilityClaims

# Interface: ProgrammabilityClaims

Defined in: [packages/sdk/src/programmability.ts:21](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L21)

SilverScript claims mirror the exact capability IDs used across the corpus,
evidence records and `hardkas corpus verify`. Each REAL_NODE_EVIDENCE value
is backed by fixtures/toccata-v2/silver (recompiled by the managed silverc,
re-derived by the Kaspa SDK, evidenced by the verified reference rusty-kaspad).
Covenant EVIDENCE is exactly the 1:1 auth-bound transition. The v1 engine (hardkas.covenants, `silver engine`) also
plans and checks 1:N, N:M and terminating transitions (F1.4), but no node has judged them: they are not claimed, and
neither are leader/cov-bound, derived state mappings or signed covenant metering. Results of @hardkas/simulator or of
the unverified SilverScript runner (SCRIPT_VM) are never REAL_NODE_EVIDENCE.

## Properties

### artifactCoherence

> **artifactCoherence**: `"READY_MATCH"`

Defined in: [packages/sdk/src/programmability.ts:22](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L22)

***

### generalCovenantSupport

> **generalCovenantSupport**: `"NOT_CLAIMED"`

Defined in: [packages/sdk/src/programmability.ts:30](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L30)

***

### mainnet

> **mainnet**: `"BLOCKED_BY_POLICY"`

Defined in: [packages/sdk/src/programmability.ts:40](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L40)

***

### risc0InspectSurface

> **risc0InspectSurface**: `"RISC0_INSPECT_SURFACE_READY"`

Defined in: [packages/sdk/src/programmability.ts:33](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L33)

***

### runtimeOutcome

> **runtimeOutcome**: `"PARTIAL"`

Defined in: [packages/sdk/src/programmability.ts:35](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L35)

***

### silverCapabilities

> **silverCapabilities**: `object`

Defined in: [packages/sdk/src/programmability.ts:23](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L23)

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

Defined in: [packages/sdk/src/programmability.ts:29](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L29)

***

### vmConsensusEquivalence

> **vmConsensusEquivalence**: `"NOT_CLAIMED"`

Defined in: [packages/sdk/src/programmability.ts:36](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L36)

***

### vProgsInspectSurface

> **vProgsInspectSurface**: `"VPROGS_INSPECT_SURFACE_READY"`

Defined in: [packages/sdk/src/programmability.ts:34](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L34)

***

### vProgsRuntime

> **vProgsRuntime**: `"NOT_CLAIMED"`

Defined in: [packages/sdk/src/programmability.ts:38](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L38)

***

### vProgsStableApi

> **vProgsStableApi**: `"NOT_CLAIMED"`

Defined in: [packages/sdk/src/programmability.ts:39](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L39)

***

### zkCorpusSurface

> **zkCorpusSurface**: `"ZK_CORPUS_SURFACE_READY"`

Defined in: [packages/sdk/src/programmability.ts:31](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L31)

***

### zkLocalVerification

> **zkLocalVerification**: `"READY_GROTH16_FIXTURE_COHERENCE"`

Defined in: [packages/sdk/src/programmability.ts:32](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L32)

***

### zkOnchainVerification

> **zkOnchainVerification**: `"NOT_CLAIMED"`

Defined in: [packages/sdk/src/programmability.ts:37](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L37)
