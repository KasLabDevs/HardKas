[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / newEscrowRecord

# Function: newEscrowRecord()

> **newEscrowRecord**(`id`, `result`, `config`): [`EscrowRecord`](../interfaces/EscrowRecord.md)

Defined in: [packages/sdk/src/escrow.ts:336](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L336)

A new record for a compiled escrow (createEscrow's result), CREATED and unfunded.

## Parameters

### id

`string`

### result

#### artifact

`SilAbiArtifact`

#### compiled

\{ `artifactBytes`: `Uint8Array`; `constructorArgs`: readonly `SilArtifactValue`[]; \}

#### compiled.artifactBytes

`Uint8Array`

#### compiled.constructorArgs

readonly `SilArtifactValue`[]

#### effectiveConfig

[`EscrowConfig`](../interfaces/EscrowConfig.md)

#### provenance

[`EscrowCompileProvenance`](../type-aliases/EscrowCompileProvenance.md)

#### state

[`EscrowState`](../interfaces/EscrowState.md)

### config

[`EscrowConfig`](../interfaces/EscrowConfig.md)

## Returns

[`EscrowRecord`](../interfaces/EscrowRecord.md)
