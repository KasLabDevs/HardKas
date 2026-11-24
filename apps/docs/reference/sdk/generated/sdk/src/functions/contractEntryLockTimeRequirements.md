[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / contractEntryLockTimeRequirements

# Function: contractEntryLockTimeRequirements()

> **contractEntryLockTimeRequirements**(`input`): [`ContractEntryLockTimeRequirement`](../interfaces/ContractEntryLockTimeRequirement.md)[]

Defined in: [packages/sdk/src/contract-lock-time.ts:83](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/contract-lock-time.ts#L83)

The lock-time requirements of `entry` (a function of the contract's AST, `silverc --ast-only`): one per top-level
`require(tx.daa >= x)` / `require(tx.time >= x)` statement. `constructorArgs` and `entryArgs` are the values in the
order of the contract's and the entry's parameters, as far as the caller has them (missing ones leave x unknown).
An entry the AST does not have (a covenant's generated entry) has no requirements HardKAS reads.

## Parameters

### input

#### ast

`unknown`

#### constructorArgs?

readonly `unknown`[]

#### entry

`string`

#### entryArgs?

readonly `unknown`[]

#### policy?

`string`

A covenant transition: the policy (a `#[covenant…]` function) whose generated entry `entry` is. Its top-level
statements are read instead; its parameters are never bound to the entry's arguments (an x that is one is unknown).

## Returns

[`ContractEntryLockTimeRequirement`](../interfaces/ContractEntryLockTimeRequirement.md)[]
