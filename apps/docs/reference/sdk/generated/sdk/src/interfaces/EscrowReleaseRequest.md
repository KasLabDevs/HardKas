[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / EscrowReleaseRequest

# Interface: EscrowReleaseRequest

Defined in: [packages/sdk/src/escrow.ts:649](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L649)

A prepared escrow release as a file: what each signer checks and signs in their own workspace.

## Properties

### branch

> `readonly` **branch**: `string`

Defined in: [packages/sdk/src/escrow.ts:664](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L664)

***

### createdAt

> `readonly` **createdAt**: `string`

Defined in: [packages/sdk/src/escrow.ts:652](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L652)

***

### draft

> `readonly` **draft**: `any`

Defined in: [packages/sdk/src/escrow.ts:670](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L670)

***

### escrow

> `readonly` **escrow**: `object`

Defined in: [packages/sdk/src/escrow.ts:655](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L655)

#### address

> `readonly` **address**: `string`

#### artifactSha256?

> `readonly` `optional` **artifactSha256?**: `string`

#### config

> `readonly` **config**: `Record`\<`string`, `unknown`\>

The escrow's terms (its nonce included): a signer recompiles the contract from them. Amounts in sompi, decimal.

#### contractName

> `readonly` **contractName**: `string`

#### lockingScriptHex

> `readonly` **lockingScriptHex**: `string`

***

### escrowId

> `readonly` **escrowId**: `string`

Defined in: [packages/sdk/src/escrow.ts:654](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L654)

***

### expectedOutputsHash

> `readonly` **expectedOutputsHash**: `string`

Defined in: [packages/sdk/src/escrow.ts:671](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L671)

***

### feeSompi

> `readonly` **feeSompi**: `string`

Defined in: [packages/sdk/src/escrow.ts:669](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L669)

***

### funding

> `readonly` **funding**: `object`

Defined in: [packages/sdk/src/escrow.ts:663](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L663)

#### amountSompi

> `readonly` **amountSompi**: `string`

#### outpoint

> `readonly` **outpoint**: `string`

***

### hardkasVersion

> `readonly` **hardkasVersion**: `string`

Defined in: [packages/sdk/src/escrow.ts:651](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L651)

***

### mutualSplit?

> `readonly` `optional` **mutualSplit?**: `object`

Defined in: [packages/sdk/src/escrow.ts:665](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L665)

#### buyerSompi

> `readonly` **buyerSompi**: `string`

#### sellerSompi

> `readonly` **sellerSompi**: `string`

***

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/sdk/src/escrow.ts:653](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L653)

***

### outputs

> `readonly` **outputs**: readonly `object`[]

Defined in: [packages/sdk/src/escrow.ts:668](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L668)

What the release pays (from the draft): address, amount, script.

***

### policyHash

> `readonly` **policyHash**: `string`

Defined in: [packages/sdk/src/escrow.ts:672](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L672)

***

### requiredSigners

> `readonly` **requiredSigners**: readonly `string`[]

Defined in: [packages/sdk/src/escrow.ts:666](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L666)

***

### schema

> `readonly` **schema**: `string`

Defined in: [packages/sdk/src/escrow.ts:650](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L650)

***

### signatures

> `readonly` **signatures**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: [packages/sdk/src/escrow.ts:674](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L674)

65-byte signatures (hex) by role, as each signer added them.
