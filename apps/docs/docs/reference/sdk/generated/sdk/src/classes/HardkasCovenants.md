[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasCovenants

# Class: HardkasCovenants

Defined in: [packages/sdk/src/covenants.ts:322](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L322)

HardKAS Covenants — Kaspa L1 Core

Provides the covenant lifecycle interface for Kaspa L1 post-Toccata.
Covenants are protocol-native, recursive spending rules embedded in UTXOs,
enforced at the consensus layer (KIP-17, KIP-20).

Covenants are live on Kaspa mainnet since DAA score 474,165,565 (June 30, 2026). In HardKAS, mainnet signing and
broadcast stay BLOCKED_BY_POLICY (SC-13); see docs/status/limitations.md for the networks each method accepts.

**The v1 engine (phase 3):** `planGenesis`, `planTransition`, `planContractDeploy` and `planContractSpend` plan v1
transactions (sealed and stored in the workspace); `check` runs the engine's validation (F1.4) without any private
key; `sign` signs with the engine; `send` is `sdk.tx.send` (F1.6). `hardkas silver engine` drives the same methods.

`history`, `lineage`, `inspect` and `getState` (V1-ENGINE-2) follow a covenant through this workspace's records and the
node's unspent outputs by address, anchored by its recomputed genesis covenant id.

**Current limitations:**
- `planDeploy()` and `planSpend()` (the script/witness forms) refuse with a typed error (SURFACE-TRUTH-1A). They never
  fall back to an ordinary payment.
- The engine's validation checks templates, bindings, lineage, entries, budgets and fees, not what a covenant's policy
  computes: the node executes the scripts, and a transition the policy rejects is the node's final rejection.
- The node has no query by covenant id: a transaction of a covenant this workspace did not record is not seen, only
  its effect (an output the lineage expects unspent is not listed).

## See

https://github.com/kaspanet/rusty-kaspa/blob/master/docs/toccata-guide.md

## Constructors

### Constructor

> **new HardkasCovenants**(`sdk`): `HardkasCovenants`

Defined in: [packages/sdk/src/covenants.ts:323](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L323)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasCovenants`

## Methods

### ~~buildCovenant()~~

> **buildCovenant**(`options`): `Promise`\<`CovenantArtifact`\>

Defined in: [packages/sdk/src/covenants.ts:547](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L547)

Build a covenant artifact (legacy compatibility).

#### Parameters

##### options

###### computeBudget?

`number`

###### covenant?

`string`

###### scriptHash

`string`

###### userLane?

`string`

#### Returns

`Promise`\<`CovenantArtifact`\>

#### Deprecated

Legacy compatibility only, for code that used `hardkas.experimental.toccata.buildCovenant()`. The SDK
plans no covenant deployment (`planDeploy()` refuses with COVENANT_PLAN_UNSUPPORTED); create covenants with
`hardkas silver covenant genesis`.

***

### check()

> **check**(`plan`, `options?`): `Promise`\<\{ `feeSompi`: `bigint`; `mass`: `any`; `txId`: `string`; `warnings`: readonly `string`[]; \}\>

Defined in: [packages/sdk/src/covenants.ts:835](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L835)

F1.4 without any private key: what `sign` checks first (the plan's identity, its inputs as the node lists them, the
compiler's facts, the covenant rules, the fee floor). Nothing is signed or written; `txId` is the id the signed
transaction will have. Local validation only: the node still executes the scripts.

#### Parameters

##### plan

`any`

##### options?

`Pick`\<`CovenantSignOptions`, `"facts"` \| `"keys"` \| `"compileRecords"`\> = `{}`

#### Returns

`Promise`\<\{ `feeSompi`: `bigint`; `mass`: `any`; `txId`: `string`; `warnings`: readonly `string`[]; \}\>

***

### checkCapabilities()

> **checkCapabilities**(): `Promise`\<`CovenantCapabilityResult`\>

Defined in: [packages/sdk/src/covenants.ts:336](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L336)

Check whether covenant transactions can be built and submitted in this environment.

SURFACE-TRUTH-1B (D-ST1): read from `sdk.capabilities` (one authority, the checks `hardkas silver doctor` reports):
1. the managed silverc resolves;
2. the managed kaspa-wasm is verified and signs TX V1;
3. the canonical node proves its identity (the pinned Toccata reference node). A node that was not observed is
   never reported as covenant-capable.

The v1 engine methods of this class (`planGenesis`, `planTransition`, …) need these same three.

#### Returns

`Promise`\<`CovenantCapabilityResult`\>

***

### checkDraft()

> **checkDraft**(`draft`, `plan`, `account?`): `void`

Defined in: [packages/sdk/src/covenants.ts:862](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L862)

F1.9 · whether a draft is one HardKAS sealed for this plan, and has slots of `account` (when given): what signing checks before any key.

#### Parameters

##### draft

`V1TxDraft`

##### plan

`any`

##### account?

`string`

#### Returns

`void`

***

### combineDrafts()

> **combineDrafts**(`drafts`, `plan`): `V1TxDraft`

Defined in: [packages/sdk/src/covenants.ts:877](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L877)

F1.9 · combines drafts signed by different parties: same transaction and slots, every signature verified (one bad signature refuses all).

#### Parameters

##### drafts

readonly `V1TxDraft`[]

##### plan

`any`

#### Returns

`V1TxDraft`

***

### deriveStatus()

> **deriveStatus**(`params`): [`CovenantStatusResult`](../interfaces/CovenantStatusResult.md)

Defined in: [packages/sdk/src/covenants.ts:450](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L450)

Derives deterministic covenant lifecycle status from a transition fact and optional tx observation status.

#### Parameters

##### params

###### conflictingTxIds?

readonly `string`[]

###### isTerminated?

`boolean`

###### transitionFact

\{ `artifactSha256`: `string`; `contentHash?`: `string`; `contractName`: `string`; `covenantId`: `string`; `draftArtifactId?`: `string`; `entrypoint`: `string`; `hardkasVersion`: `string`; `hashVersion`: `string` \| `number`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `nextState?`: `Record`\<`string`, `unknown`\>; `planArtifactId`: `string`; `policy?`: `string`; `previousState?`: `Record`\<`string`, `unknown`\>; `schema`: `"hardkas.covenantTransitionFact.v1"`; `spentOutpoint`: \{ `index`: `number`; `transactionId`: `string`; \}; `successorAmountSompi?`: `string`; `successorOutpoint?`: \{ `index`: `number`; `transactionId`: `string`; \}; `timestamp`: `string`; `txId`: `string`; `validation`: \{ `diagnostic?`: `string`; `scriptVmPassed?`: `boolean`; `structuralPassed`: `boolean`; `vmStatus?`: `string`; \}; \}

###### transitionFact.artifactSha256

`string`

###### transitionFact.contentHash?

`string`

###### transitionFact.contractName

`string`

###### transitionFact.covenantId

`string`

###### transitionFact.draftArtifactId?

`string`

###### transitionFact.entrypoint

`string`

###### transitionFact.hardkasVersion

`string`

###### transitionFact.hashVersion

`string` \| `number`

###### transitionFact.networkId

`"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

###### transitionFact.nextState?

`Record`\<`string`, `unknown`\>

###### transitionFact.planArtifactId

`string`

###### transitionFact.policy?

`string`

###### transitionFact.previousState?

`Record`\<`string`, `unknown`\>

###### transitionFact.schema

`"hardkas.covenantTransitionFact.v1"`

###### transitionFact.spentOutpoint

\{ `index`: `number`; `transactionId`: `string`; \}

###### transitionFact.spentOutpoint.index

`number`

###### transitionFact.spentOutpoint.transactionId

`string`

###### transitionFact.successorAmountSompi?

`string`

###### transitionFact.successorOutpoint?

\{ `index`: `number`; `transactionId`: `string`; \}

###### transitionFact.successorOutpoint.index

`number`

###### transitionFact.successorOutpoint.transactionId

`string`

###### transitionFact.timestamp

`string`

###### transitionFact.txId

`string`

###### transitionFact.validation

\{ `diagnostic?`: `string`; `scriptVmPassed?`: `boolean`; `structuralPassed`: `boolean`; `vmStatus?`: `string`; \}

###### transitionFact.validation.diagnostic?

`string`

###### transitionFact.validation.scriptVmPassed?

`boolean`

###### transitionFact.validation.structuralPassed

`boolean`

###### transitionFact.validation.vmStatus?

`string`

###### txStatus?

`DerivedTxStatus`

#### Returns

[`CovenantStatusResult`](../interfaces/CovenantStatusResult.md)

***

### estimateComputeBudget()

> **estimateComputeBudget**(`input`, `sign?`): `Promise`\<`V1BudgetEstimate`\>

Defined in: [packages/sdk/src/covenants.ts:823](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L823)

The upstream estimate of a contract input's compute budget: rusty-kaspa's estimate_script_units_upper_bound over the
unlock the input will carry (signatures are fixed-size) and the output it spends — a heuristic upper bound, never a
guarantee (a shortfall is the node's final COMPUTE_BUDGET_INSUFFICIENT). What `computeBudget: "estimate"` uses.

#### Parameters

##### input

###### contract

`V1ContractRef`

###### scriptPublicKey?

`string`

##### sign?

`CovenantSignOptions` = `{}`

#### Returns

`Promise`\<`V1BudgetEstimate`\>

***

### finalizeDraft()

> **finalizeDraft**(`draft`, `plan`, `options?`): `Promise`\<\{ `signed`: `any`; `txId`: `string`; \}\>

Defined in: [packages/sdk/src/covenants.ts:885](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L885)

F1.9 · finalizes a fully signed draft into the signed artifact (stored next to its plan, as `sign` stores it): F1.4
again without keys, the slots the ones it derives, every signature verified, the txid the draft's. Send it with `send`.

#### Parameters

##### draft

`V1TxDraft`

##### plan

`any`

##### options?

`Pick`\<`CovenantSignOptions`, `"facts"` \| `"compileRecords"`\> = `{}`

#### Returns

`Promise`\<\{ `signed`: `any`; `txId`: `string`; \}\>

***

### getState()

> **getState**(`covenantId`, `options?`): `Promise`\<[`CovenantStateView`](../interfaces/CovenantStateView.md)\>

Defined in: [packages/sdk/src/covenants.ts:523](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L523)

V1-ENGINE-2 · the current state of a covenant: its outputs the node lists unspent with its covenant id (followed
through the lineage this workspace recorded: the node has no query by covenant id), their value, and the state each
holds — declared by the transaction that created it and checked against its address (`stateCheck`).

#### Parameters

##### covenantId

`string`

##### options?

`Omit`\<[`CovenantLineageOptions`](../interfaces/CovenantLineageOptions.md), `"node"`\> = `{}`

#### Returns

`Promise`\<[`CovenantStateView`](../interfaces/CovenantStateView.md)\>

***

### history()

> **history**(`covenantId`): `Promise`\<[`CovenantHistory`](../interfaces/CovenantHistory.md)\>

Defined in: [packages/sdk/src/covenants.ts:396](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L396)

V1-ENGINE-2 · what this workspace recorded about a covenant, in lineage order (genesis, the transitions of the
chain), then the node's final rejections and the transactions signed but never submitted. Artifacts only: no node.

#### Parameters

##### covenantId

`string`

#### Returns

`Promise`\<[`CovenantHistory`](../interfaces/CovenantHistory.md)\>

***

### inspect()

> **inspect**(`covenantId`, `options?`): `Promise`\<[`CovenantInspection`](../interfaces/CovenantInspection.md)\>

Defined in: [packages/sdk/src/covenants.ts:373](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L373)

V1-ENGINE-2 · a covenant by its 32-byte id: its lineage (genesis anchored by its recomputed covenant id, transitions
linked by outpoints, the node's rejections apart) and where it lives now (the tip, checked against the node's
unspent outputs, with each output's declared state checked against its address). From this workspace's records and
the node's UTXOs by address: the node has no query by covenant id, so a transaction this workspace did not record is
not seen — only its effect (a findings entry). `verified` is the conjunction of the checks it reports, nothing more.

#### Parameters

##### covenantId

`string`

##### options?

[`CovenantLineageOptions`](../interfaces/CovenantLineageOptions.md) = `{}`

#### Returns

`Promise`\<[`CovenantInspection`](../interfaces/CovenantInspection.md)\>

***

### isSupported()

> **isSupported**(): `Promise`\<`boolean`\>

Defined in: [packages/sdk/src/covenants.ts:361](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L361)

Whether covenant transactions can be built and submitted here: the same answer as
`capabilities.get().capabilities.covenants` and `checkCapabilities().fullyOperational`.

#### Returns

`Promise`\<`boolean`\>

***

### lineage()

> **lineage**(`covenantId`, `options?`): `Promise`\<[`CovenantLineage`](../interfaces/CovenantLineage.md)\>

Defined in: [packages/sdk/src/covenants.ts:414](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L414)

V1-ENGINE-2 · the lineage of a covenant, reconstructed and checked: the genesis anchor (consensus covenant_id
recomputed from the genesis transaction), the links (every transition spends outputs of the chain), conflicts (an
outpoint spent twice in the records), the tip at the node (`node: false` skips it), the declared states against the
addresses (`states: false` skips it; a v1 contract's state needs the pinned silverc).

#### Parameters

##### covenantId

`string`

##### options?

[`CovenantLineageOptions`](../interfaces/CovenantLineageOptions.md) = `{}`

#### Returns

`Promise`\<[`CovenantLineage`](../interfaces/CovenantLineage.md)\>

***

### plan()

> **plan**(`input`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/covenants.ts:572](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L572)

A v1 plan body sealed as a TxPlan artifact (its shape checked) and stored in the workspace.

#### Parameters

##### input

###### amountSompi?

`bigint`

###### body

`V1PlanBody`

###### from

\{ `address`: `string`; `input?`: `string`; \}

###### from.address

`string`

###### from.input?

`string`

###### purpose?

`string`

###### to?

\{ `address`: `string`; `input?`: `string`; \}

###### to.address

`string`

###### to.input?

`string`

#### Returns

`Promise`\<`any`\>

***

### planContractDeploy()

> **planContractDeploy**(`options`, `sign?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/covenants.ts:710](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L710)

A contract deployment (no covenant): the funder's coins pay the contract's P2SH output (the record's own state, or
`state`) and the fee; the change goes back to the funder.

#### Parameters

##### options

###### amountSompi

`bigint`

###### contract

`V1CompiledContract` \| `Omit`\<`V1CompiledContract`, `"constructorArgs"`\> & `object`

The compiled contract. With its constructor arguments the facts are the pinned silverc's reproduction; without
them the P2SH is the one of the compile record's own artifact (the record verified as the one named, its artifact
digest checked), as `hardkas silver deploy` always funded it — a payment to that address, no contract input.

###### feeSompi?

`bigint`

###### funder

`string`

###### maxFeeSompi?

`bigint`

###### state?

`Readonly`\<`Record`\<`string`, `V1ArgValue`\>\>

##### sign?

`CovenantSignOptions` = `{}`

#### Returns

`Promise`\<`any`\>

***

### planContractSpend()

> **planContractSpend**(`options`, `sign?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/covenants.ts:755](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L755)

A contract spend (P2SH, no covenant): the input as the node lists it, the entry and its arguments (signer slots
filled at signing), the declared payments; the fee is what the payments leave (at least the node's floor). With
`sweepTo`, that address takes what the payments and the fee leave — the fee then the node's floor measured on this
very transaction, or `feeSompi` if larger — so no value is left to the miner beyond the fee.

#### Parameters

##### options

###### computeBudget?

`number` \| `"estimate"`

Given, certified (F1.8), or "estimate" (rusty-kaspa's heuristic upper bound).

###### contract

`V1ContractRef`

###### feeSompi?

`bigint`

With `sweepTo`: at least the node's floor (the floor when omitted).

###### maxFeeSompi?

`bigint`

###### outpoint

\{ `index`: `number`; `transactionId`: `string`; \}

###### outpoint.index

`number`

###### outpoint.transactionId

`string`

###### payments

readonly `object`[]

###### sequence?

`bigint`

The input's sequence (u64; default 0), for contracts that read it (relative time locks).

###### sweepTo?

`string`

The address that takes the rest (after the payments and the fee).

##### sign?

`CovenantSignOptions` = `{}`

#### Returns

`Promise`\<`any`\>

***

### planDeploy()

> **planDeploy**(`options`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/covenants.ts:494](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L494)

Plan a covenant deployment.

SURFACE-TRUTH-1A (ST-I3): refused until the SDK plans real v1 covenant transactions. The former body planned an
ordinary self-payment and dropped the script, which signed and sent like any payment.

#### Parameters

##### options

`CovenantDeployOptions`

#### Returns

`Promise`\<`any`\>

#### Throws

COVENANT_PLAN_UNSUPPORTED

***

### planGenesis()

> **planGenesis**(`options`, `sign?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/covenants.ts:599](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L599)

A covenant genesis plan: the funder's coins (F1.7: mature, no covenant id, not pending; largest first) pay the
covenant outputs and the fee, the change goes back to it. The fee is the node's floor (F1.2, measured on this very
transaction) unless a larger one is given.

#### Parameters

##### options

`CovenantGenesisOptions`

##### sign?

`CovenantSignOptions` = `{}`

#### Returns

`Promise`\<`any`\>

***

### planSpend()

> **planSpend**(`options`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/covenants.ts:510](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L510)

Plan a covenant spend.

SURFACE-TRUTH-1A (ST-I3): refused until the SDK plans real v1 covenant transactions. The former body planned an
ordinary payment to `to` and dropped the covenant id and the witness data.

#### Parameters

##### options

`CovenantSpendOptions`

#### Returns

`Promise`\<`any`\>

#### Throws

COVENANT_PLAN_UNSUPPORTED

***

### planTransition()

> **planTransition**(`options`, `sign?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/covenants.ts:627](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L627)

A covenant transition plan: its inputs as the node lists them (amount, covenant id), the continuations the
contract's template holding their states (encoded, silverscript-abi), declared payments, and the fee from the funder's
coins (the covenant keeps its value) or from the covenant's value. Compute budgets: given, certified (F1.8), or the
upstream estimate when asked for ("estimate"); else V1_COMPUTE_BUDGET_REQUIRED.

#### Parameters

##### options

`CovenantTransitionOptions`

##### sign?

`CovenantSignOptions` = `{}`

#### Returns

`Promise`\<`any`\>

***

### prepareDraft()

> **prepareDraft**(`plan`, `options?`): `Promise`\<`V1TxDraft`\>

Defined in: [packages/sdk/src/covenants.ts:857](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L857)

F1.9 · a draft of a v1 plan: F1.4 against the node now (each slot's key from the account store, no private key read), its slots unsigned.

#### Parameters

##### plan

`any`

##### options?

`Pick`\<`CovenantSignOptions`, `"facts"` \| `"compileRecords"` \| `"keys"`\> = `{}`

#### Returns

`Promise`\<`V1TxDraft`\>

***

### send()

> **send**(`signed`, `options?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/covenants.ts:892](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L892)

F1.6 · sends a signed v1 artifact: the one send of every HardKAS transaction (sdk.tx.send).

#### Parameters

##### signed

`any`

##### options?

`SendTxOptions` & `Pick`\<`CovenantSignOptions`, `"facts"` \| `"compileRecords"`\> = `{}`

#### Returns

`Promise`\<`any`\>

***

### sign()

> **sign**(`plan`, `options?`): `Promise`\<\{ `feeSompi`: `bigint`; `mass`: `any`; `signed`: `any`; `txId`: `string`; `warnings`: readonly `string`[]; \}\>

Defined in: [packages/sdk/src/covenants.ts:845](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L845)

F1.5 · signs a v1 plan with the engine: F1.4 against the node first (no key read for a plan it refuses), then each
key once. The signed artifact is stored next to its plan.

#### Parameters

##### plan

`any`

##### options?

`CovenantSignOptions` = `{}`

#### Returns

`Promise`\<\{ `feeSompi`: `bigint`; `mass`: `any`; `signed`: `any`; `txId`: `string`; `warnings`: readonly `string`[]; \}\>

***

### signDraft()

> **signDraft**(`draft`, `plan`, `account`, `options?`): `Promise`\<`V1TxDraft`\>

Defined in: [packages/sdk/src/covenants.ts:870](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L870)

F1.9 · signs `account`'s slots (its key checked against each slot; each signature verified before the draft keeps it). The key is read after the draft is checked.

#### Parameters

##### draft

`V1TxDraft`

##### plan

`any`

##### account

`string`

##### options?

`Pick`\<`CovenantSignOptions`, `"keys"` \| `"keystorePassword"`\> = `{}`

#### Returns

`Promise`\<`V1TxDraft`\>
