[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / deriveCovenantStatus

# Function: deriveCovenantStatus()

> **deriveCovenantStatus**(`params`): [`CovenantStatusResult`](../interfaces/CovenantStatusResult.md)

Defined in: packages/artifacts/dist/index.d.ts:7533

Pure function deriving high-level covenant state from immutable facts and derived L1 transaction status.
Evaluates state progression, successor outpoint activation, reorg rollbacks, and termination.

## Parameters

### params

#### isTerminated?

`boolean`

#### transitionFact

\{ `artifactSha256`: `string`; `contentHash?`: `string`; `contractName`: `string`; `covenantId`: `string`; `draftArtifactId?`: `string`; `entrypoint`: `string`; `hardkasVersion`: `string`; `hashVersion?`: `string` \| `number`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `nextState?`: `z.ZodOptional`\<`z.ZodRecord`\<`z.ZodString`, `z.ZodUnknown`\>\>; `planArtifactId`: `string`; `policy?`: `string`; `previousState?`: `z.ZodOptional`\<`z.ZodRecord`\<`z.ZodString`, `z.ZodUnknown`\>\>; `schema`: `"hardkas.covenantTransitionFact.v1"`; `spentOutpoint`: \{ `index`: `number`; `transactionId`: `string`; \}; `successorAmountSompi?`: `string`; `successorOutpoint?`: \{ `index`: `number`; `transactionId`: `string`; \}; `timestamp`: `string`; `txId`: `string`; `validation`: \{ `diagnostic?`: `string`; `scriptVmPassed?`: `boolean`; `structuralPassed`: `boolean`; `vmStatus?`: `string`; \}; \}

#### transitionFact.artifactSha256

`string`

#### transitionFact.contentHash?

`string`

#### transitionFact.contractName

`string`

#### transitionFact.covenantId

`string`

#### transitionFact.draftArtifactId?

`string`

#### transitionFact.entrypoint

`string`

#### transitionFact.hardkasVersion

`string`

#### transitionFact.hashVersion?

`string` \| `number`

#### transitionFact.networkId

`"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

#### transitionFact.nextState?

`z.ZodOptional`\<`z.ZodRecord`\<`z.ZodString`, `z.ZodUnknown`\>\>

#### transitionFact.planArtifactId

`string`

#### transitionFact.policy?

`string`

#### transitionFact.previousState?

`z.ZodOptional`\<`z.ZodRecord`\<`z.ZodString`, `z.ZodUnknown`\>\>

#### transitionFact.schema

`"hardkas.covenantTransitionFact.v1"`

#### transitionFact.spentOutpoint

\{ `index`: `number`; `transactionId`: `string`; \}

#### transitionFact.spentOutpoint.index

`number`

#### transitionFact.spentOutpoint.transactionId

`string`

#### transitionFact.successorAmountSompi?

`string`

#### transitionFact.successorOutpoint?

\{ `index`: `number`; `transactionId`: `string`; \}

#### transitionFact.successorOutpoint.index

`number`

#### transitionFact.successorOutpoint.transactionId

`string`

#### transitionFact.timestamp

`string`

#### transitionFact.txId

`string`

#### transitionFact.validation

\{ `diagnostic?`: `string`; `scriptVmPassed?`: `boolean`; `structuralPassed`: `boolean`; `vmStatus?`: `string`; \}

#### transitionFact.validation.diagnostic?

`string`

#### transitionFact.validation.scriptVmPassed?

`boolean`

#### transitionFact.validation.structuralPassed

`boolean`

#### transitionFact.validation.vmStatus?

`string`

#### txStatus?

`DerivedTxStatus`

## Returns

[`CovenantStatusResult`](../interfaces/CovenantStatusResult.md)
