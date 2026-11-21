[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / assertLockTimeMeetsContractEntry

# Function: assertLockTimeMeetsContractEntry()

> **assertLockTimeMeetsContractEntry**(`lockTime`, `requirements`, `what`): `void`

Defined in: [packages/sdk/src/contract-lock-time.ts:144](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/contract-lock-time.ts#L144)

The spend's lock time (0 when it has none) against an entry's requirements, before anything is signed:
LOCK_TIME_KIND_MISMATCH when it is not of the kind a statement fixes (a time for `tx.daa`; a DAA score, or none, for
`tx.time`), LOCK_TIME_BELOW_ENTRY_REQUIREMENT when it is below an x HardKAS can read. The node would refuse either
transaction whatever its time (OpCheckLockTimeVerify), and with HardKAS's one submission per txId that refusal would be
final for it.

## Parameters

### lockTime

`bigint`

### requirements

readonly [`ContractEntryLockTimeRequirement`](../interfaces/ContractEntryLockTimeRequirement.md)[]

### what

`string`

## Returns

`void`
