[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / parseSilAbiArtifact

# Function: parseSilAbiArtifact()

> **parseSilAbiArtifact**(`input`): [`SilAbiArtifact`](../interfaces/SilAbiArtifact.md)

Defined in: [packages/core/src/silverscript.ts:159](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L159)

Validates a parsed silverc output as a SilverScript ABI artifact of the
pinned schema and language version. Anything else — an older or newer
schema, a different compiler, missing or unknown fields — is rejected: the
compiler is pinned, so an unexpected shape means drift or tampering.

## Parameters

### input

`unknown`

## Returns

[`SilAbiArtifact`](../interfaces/SilAbiArtifact.md)
