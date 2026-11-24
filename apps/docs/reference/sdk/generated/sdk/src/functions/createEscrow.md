[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / createEscrow

# Function: createEscrow()

> **createEscrow**(`config`, `options?`): `Promise`\<\{ `artifact`: `SilAbiArtifact`; `compiled`: \{ `artifactBytes`: `Uint8Array`; `constructorArgs`: readonly `SilArtifactValue`[]; \}; `effectiveConfig`: [`EscrowConfig`](../interfaces/EscrowConfig.md); `provenance`: [`EscrowCompileProvenance`](../type-aliases/EscrowCompileProvenance.md); `state`: [`EscrowState`](../interfaces/EscrowState.md); \}\>

Defined in: packages/sdk/src/escrow-core/create-escrow.ts:151

Compiles the escrow contract for these parties with the managed silverc
v1.0.0 and derives its P2SH lock from the SDK.

## Parameters

### config

[`EscrowConfig`](../interfaces/EscrowConfig.md)

### options?

[`CreateEscrowOptions`](../interfaces/CreateEscrowOptions.md) = `{}`

## Returns

`Promise`\<\{ `artifact`: `SilAbiArtifact`; `compiled`: \{ `artifactBytes`: `Uint8Array`; `constructorArgs`: readonly `SilArtifactValue`[]; \}; `effectiveConfig`: [`EscrowConfig`](../interfaces/EscrowConfig.md); `provenance`: [`EscrowCompileProvenance`](../type-aliases/EscrowCompileProvenance.md); `state`: [`EscrowState`](../interfaces/EscrowState.md); \}\>
