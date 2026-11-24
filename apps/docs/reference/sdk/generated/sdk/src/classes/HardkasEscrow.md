[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasEscrow

# Class: HardkasEscrow

Defined in: [packages/sdk/src/escrow.ts:717](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L717)

`sdk.escrow` · the escrow lifecycle on this instance's node network, with the rules of the dev server's escrow (the
functions above): create → fund → prepare → sign (each required signer, here or in their own workspace with the
release request) → release → reconcile. Records live in `.hardkas/escrows/<id>.json`.

## Constructors

### Constructor

> **new HardkasEscrow**(`sdk`): `HardkasEscrow`

Defined in: [packages/sdk/src/escrow.ts:718](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L718)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasEscrow`

## Accessors

### networkId

#### Get Signature

> **get** **networkId**(): `string`

Defined in: [packages/sdk/src/escrow.ts:721](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L721)

The network records of this instance are for: the one its config entry declares, else its name.

##### Returns

`string`

## Methods

### addSignatures()

> **addSignatures**(`id`, `request`): `Promise`\<[`EscrowRecord`](../interfaces/EscrowRecord.md)\>

Defined in: [packages/sdk/src/escrow.ts:1167](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L1167)

Adds the signatures a release request carries to escrow `id`'s prepared release: the request must be of that very
draft, and each signature of a required role valid (BIP340, SIGHASH_ALL) by the key the escrow names for it
(ESCROW_SIGNATURE_INVALID: nothing is added). READY_TO_RELEASE once every required signer signed.

#### Parameters

##### id

`string`

##### request

[`EscrowReleaseRequest`](../interfaces/EscrowReleaseRequest.md)

#### Returns

`Promise`\<[`EscrowRecord`](../interfaces/EscrowRecord.md)\>

***

### create()

> **create**(`config`): `Promise`\<[`EscrowRecord`](../interfaces/EscrowRecord.md)\>

Defined in: [packages/sdk/src/escrow.ts:871](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L871)

Compiles the escrow for `config` (the pinned silverc; EscrowFull, EscrowSplit, or a legacy v1 with version "v1") on
this instance's network and records it CREATED. An active escrow at the same address is refused (409 in the dev
server: ESCROW_ADDRESS_ALREADY_ACTIVE). Nothing is sent.

#### Parameters

##### config

[`EscrowConfig`](../interfaces/EscrowConfig.md)

#### Returns

`Promise`\<[`EscrowRecord`](../interfaces/EscrowRecord.md)\>

***

### destinationOf()

> **destinationOf**(`addressOrSpk`): `string`

Defined in: [packages/sdk/src/escrow.ts:849](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L849)

A destination: an address of this network (its script, without the version) or a script public key in hex.

#### Parameters

##### addressOrSpk

`string`

#### Returns

`string`

***

### fund()

> **fund**(`id`, `options`): `Promise`\<[`EscrowSendResult`](../interfaces/EscrowSendResult.md)\>

Defined in: [packages/sdk/src/escrow.ts:908](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L908)

Funds escrow `id` from the buyer's account (its key must be the buyer's of the escrow): one payment of the escrow's
funding amount (principal + fee budget) to its address, planned, signed and sent by the SDK's payment path (mature
coins, never a covenant's, none the mempool is spending; the fee limit; one submission per txId). The G3 check
comes first: a fee budget under the node's minimum for any release is refused before anything is read or signed.
An unknown outcome is recorded with its txId (never funded again before reconcile).

#### Parameters

##### id

`string`

##### options

###### account

`string`

###### keystorePassword?

`string`

###### waitMs?

`number`

#### Returns

`Promise`\<[`EscrowSendResult`](../interfaces/EscrowSendResult.md)\>

***

### list()

> **list**(): `Promise`\<[`EscrowRecord`](../interfaces/EscrowRecord.md)[]\>

Defined in: [packages/sdk/src/escrow.ts:896](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L896)

Every escrow recorded in this workspace.

#### Returns

`Promise`\<[`EscrowRecord`](../interfaces/EscrowRecord.md)[]\>

***

### partyOf()

> **partyOf**(`nameAddressOrKey`): `Promise`\<\{ `address?`: `string`; `destinationSpk`: `string`; `publicKeyHex`: `string`; \}\>

Defined in: [packages/sdk/src/escrow.ts:825](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L825)

An escrow party from what a caller names: a 32-byte x-only key (hex; destination its own P2PK), a Schnorr P2PK
address of this network, or an account of this workspace (its address). No key is read.

#### Parameters

##### nameAddressOrKey

`string`

#### Returns

`Promise`\<\{ `address?`: `string`; `destinationSpk`: `string`; `publicKeyHex`: `string`; \}\>

***

### prepare()

> **prepare**(`id`, `options`): `Promise`\<[`EscrowReleaseRequest`](../interfaces/EscrowReleaseRequest.md)\>

Defined in: [packages/sdk/src/escrow.ts:981](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L981)

Prepares the release of `branch` over the recorded funding (the rules of prepareEscrowRelease) and returns its
release request: the file each required signer checks and signs. Signatures of an earlier preparation are dropped.

#### Parameters

##### id

`string`

##### options

###### branch

`string`

###### mutualSplit?

\{ `buyerSompi`: `string` \| `bigint`; `sellerSompi`: `string` \| `bigint`; \}

###### mutualSplit.buyerSompi

`string` \| `bigint`

###### mutualSplit.sellerSompi

`string` \| `bigint`

#### Returns

`Promise`\<[`EscrowReleaseRequest`](../interfaces/EscrowReleaseRequest.md)\>

***

### reconcile()

> **reconcile**(`id`): `Promise`\<\{ `observations`: `Record`\<`string`, \{ `error?`: `string`; `finding`: `string`; `state`: `string`; \}\>; `record`: [`EscrowRecord`](../interfaces/EscrowRecord.md); \}\>

Defined in: [packages/sdk/src/escrow.ts:1254](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L1254)

One look at the node about escrow `id`'s pending funding and release (sdk.tx.observe: its mempool, then its virtual
chain from the submission's point), and the state that moves the record to: a chain block accepted it → confirmed
(FUNDED / RELEASED); the mempool holds an unknown outcome → broadcast. Never back.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `observations`: `Record`\<`string`, \{ `error?`: `string`; `finding`: `string`; `state`: `string`; \}\>; `record`: [`EscrowRecord`](../interfaces/EscrowRecord.md); \}\>

***

### release()

> **release**(`id`, `options?`): `Promise`\<[`EscrowSendResult`](../interfaces/EscrowSendResult.md)\>

Defined in: [packages/sdk/src/escrow.ts:1205](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L1205)

Sends escrow `id`'s release once every required signer signed (checkEscrowRelease: every signature verified before
anything is sent), through sdk.tx.send: a plan of this workspace (the funding outpoint in, the contract's outputs
out, the fee limit the escrow's fee ceiling) and its signed transaction. An unknown outcome is recorded with its txId
and never sent again before reconcile. With `waitMs`, waits for a chain block to accept it (RELEASED).

#### Parameters

##### id

`string`

##### options?

###### waitMs?

`number`

#### Returns

`Promise`\<[`EscrowSendResult`](../interfaces/EscrowSendResult.md)\>

***

### releaseRequest()

> **releaseRequest**(`id`): `Promise`\<[`EscrowReleaseRequest`](../interfaces/EscrowReleaseRequest.md)\>

Defined in: [packages/sdk/src/escrow.ts:998](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L998)

The release request of escrow `id`'s prepared release, with the signatures recorded so far.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`EscrowReleaseRequest`](../interfaces/EscrowReleaseRequest.md)\>

***

### sign()

> **sign**(`id`, `options`): `Promise`\<\{ `id`: `string`; `record`: [`EscrowRecord`](../interfaces/EscrowRecord.md); `role`: `string`; `signature`: `string`; \}\>

Defined in: [packages/sdk/src/escrow.ts:1048](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L1048)

Signs the prepared release of escrow `id` (recorded here) as `role` with `account`, whose key must be the one the
escrow names for that role (ESCROW_SIGNER_NOT_FOUND before any key is read otherwise).

#### Parameters

##### id

`string`

##### options

[`EscrowSignOptions`](../interfaces/EscrowSignOptions.md)

#### Returns

`Promise`\<\{ `id`: `string`; `record`: [`EscrowRecord`](../interfaces/EscrowRecord.md); `role`: `string`; `signature`: `string`; \}\>

***

### signRequest()

> **signRequest**(`request`, `options`): `Promise`\<\{ `request`: [`EscrowReleaseRequest`](../interfaces/EscrowReleaseRequest.md); `role`: `string`; `signature`: `string`; \}\>

Defined in: [packages/sdk/src/escrow.ts:1150](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L1150)

Signs a release request in this workspace (a signer that does not hold the escrow): verifyRequest first, then the
signature of `role` by `account` (its key must be the role's). Returns the request with the signature added.

#### Parameters

##### request

[`EscrowReleaseRequest`](../interfaces/EscrowReleaseRequest.md)

##### options

[`EscrowSignOptions`](../interfaces/EscrowSignOptions.md)

#### Returns

`Promise`\<\{ `request`: [`EscrowReleaseRequest`](../interfaces/EscrowReleaseRequest.md); `role`: `string`; `signature`: `string`; \}\>

***

### status()

> **status**(`id`): `Promise`\<[`EscrowRecord`](../interfaces/EscrowRecord.md)\>

Defined in: [packages/sdk/src/escrow.ts:890](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L890)

The record of escrow `id` in this workspace (no node is contacted).

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`EscrowRecord`](../interfaces/EscrowRecord.md)\>

***

### verifyRequest()

> **verifyRequest**(`request`): `Promise`\<\{ `feeSompi`: `string`; `outputs`: readonly `object`[]; `record`: [`EscrowRecord`](../interfaces/EscrowRecord.md); `requiredSigners`: `string`[]; \}\>

Defined in: [packages/sdk/src/escrow.ts:1084](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L1084)

Checks a release request in a workspace that does not hold the escrow (a signer's own): the contract recompiled
from the terms it carries (the pinned silverc) is at its address and lock; the draft is the one those terms, the
branch and the funding give (prepared again here, with the same fee ceiling and node floor, and compared field by
field); the policy and outputs hashes are its own. ESCROW_REQUEST_INVALID / ESCROW_REQUEST_MISMATCH otherwise.
Returns what the request pays, for the signer to see.

#### Parameters

##### request

[`EscrowReleaseRequest`](../interfaces/EscrowReleaseRequest.md)

#### Returns

`Promise`\<\{ `feeSompi`: `string`; `outputs`: readonly `object`[]; `record`: [`EscrowRecord`](../interfaces/EscrowRecord.md); `requiredSigners`: `string`[]; \}\>
