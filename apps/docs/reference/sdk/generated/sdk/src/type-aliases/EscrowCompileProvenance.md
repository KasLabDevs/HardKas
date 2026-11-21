[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / EscrowCompileProvenance

# Type Alias: EscrowCompileProvenance

> **EscrowCompileProvenance** = `SilverCompileProvenance` & `object`

Defined in: packages/sdk/src/escrow-core/types.ts:48

Compile evidence for an escrow: the compiler's provenance plus the lock it yields. Digests only.

## Type Declaration

### contractName

> `readonly` **contractName**: `string`

### contractVersion?

> `readonly` `optional` **contractVersion?**: [`EscrowVersion`](EscrowVersion.md)

### escrowNonce?

> `readonly` `optional` **escrowNonce?**: `string`

### lockingScriptHex

> `readonly` **lockingScriptHex**: `string`
