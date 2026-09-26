[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / buildTransactions

# Function: buildTransactions()

> **buildTransactions**(`input`): `AsyncGenerator`\<`any`\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:63](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L63)

Iterates the WASM `Generator` and yields each `PendingTransaction`.
Consumer is responsible for signing (`pt.sign([keys])` or `pt.signInput(...)`)
and submission (`pt.submit(rpc)`).

## Parameters

### input

[`GeneratorSettingsInput`](../interfaces/GeneratorSettingsInput.md)

## Returns

`AsyncGenerator`\<`any`\>
