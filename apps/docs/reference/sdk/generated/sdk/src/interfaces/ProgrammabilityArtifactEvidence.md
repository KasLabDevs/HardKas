[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ProgrammabilityArtifactEvidence

# Interface: ProgrammabilityArtifactEvidence

Defined in: [packages/sdk/src/programmability.ts:72](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/programmability.ts#L72)

ESCALÓN 2 · P10: what an inspect or verify result says of the ARTIFACT it read, kept apart from the product's claims.
Those claims (`programmabilityClaims()`, REAL_NODE_EVIDENCE among them) are backed by the corpus
(fixtures/toccata-v2, `hardkas corpus verify`), never by the file given here: they are not part of a per-artifact
result, which used to carry them as if a freshly compiled record were node evidence. Inspect and verify read the file
(schema, content hash, integrity); they never establish that it ran on a node.

## Properties

### productClaims

> **productClaims**: `"hardkas programmability capabilities"`

Defined in: [packages/sdk/src/programmability.ts:76](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/programmability.ts#L76)

Where the product-level claims are reported.

***

### realNodeEvidence

> **realNodeEvidence**: `"NOT_ESTABLISHED"`

Defined in: [packages/sdk/src/programmability.ts:73](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/programmability.ts#L73)

***

### reason

> **reason**: `string`

Defined in: [packages/sdk/src/programmability.ts:74](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/programmability.ts#L74)
