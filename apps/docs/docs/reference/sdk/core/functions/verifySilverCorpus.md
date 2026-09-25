[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / verifySilverCorpus

# Function: verifySilverCorpus()

> **verifySilverCorpus**(`corpusDir`, `options?`): `Promise`\<[`SilverCorpusVerifyResult`](../interfaces/SilverCorpusVerifyResult.md)\>

Defined in: [packages/core/src/silverscript-corpus.ts:148](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L148)

Verifies a SilverScript corpus directory. Recompiles with the managed
silverc (it must be installed); needs the managed Kaspa SDK for derivations.

## Parameters

### corpusDir

`string`

### options?

#### home?

`string`

#### workspaceRoot?

`string`

## Returns

`Promise`\<[`SilverCorpusVerifyResult`](../interfaces/SilverCorpusVerifyResult.md)\>
