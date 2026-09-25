[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / resolveCanonicalArtifact

# Function: resolveCanonicalArtifact()

> **resolveCanonicalArtifact**(`params`): `string`

Defined in: [packages/core/src/semantics/api.ts:16](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/api.ts#L16)

Resolves a canonical artifact.
Implicit 'latest' is STRICTLY FORBIDDEN.
You must provide an explicit artifactId, lineageId, or semanticHash.
Invariant: `canonical_resolution_never_depends_on_implicit_latest`

## Parameters

### params

#### artifactId?

`string`

#### lineageId?

`string`

#### semanticHash?

`string`

## Returns

`string`
