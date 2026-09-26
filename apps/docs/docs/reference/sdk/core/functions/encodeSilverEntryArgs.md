[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / encodeSilverEntryArgs

# Function: encodeSilverEntryArgs()

> **encodeSilverEntryArgs**(`call`): `string`

Defined in: [packages/core/src/silverscript-abi.ts:139](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-abi.ts#L139)

The entry-invocation part of the signature script: the arguments, then the
dispatch tag (silverscript-abi `encode_contract_entry_sig_script`). The
redeem script is appended by [silverUnlockScript](silverUnlockScript.md).

## Parameters

### call

[`SilverEntryCall`](../interfaces/SilverEntryCall.md)

## Returns

`string`
