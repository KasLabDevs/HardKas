[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / kcc20ProgramFacts

# Function: kcc20ProgramFacts()

> **kcc20ProgramFacts**(`f`, `config?`): `V1ContractFacts`

Defined in: [packages/sdk/src/kcc20.ts:223](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L223)

The engine's facts for a KCC-20 program: the contract as silverc reproduced it, with the covenant shape KCC-20 and its
KCC-20 artifact give it (cov binding; leader `transfer`, delegate `transfer_delegator`; the artifact's bounds). Refused
for a contract that is not one: other entries or dispatch tags, no KCC20State fields, or declarations of its own.

## Parameters

### f

`V1ContractFacts`

### config?

`Kcc20Config` = `KCC20_DEFAULT_CONFIG`

## Returns

`V1ContractFacts`
