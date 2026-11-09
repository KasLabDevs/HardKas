[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / buildTransactions

# Function: buildTransactions()

> **buildTransactions**(`input`): `AsyncGenerator`\<`any`\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:93](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L93)

Iterates the WASM `Generator` and yields each `PendingTransaction`.
Consumer is responsible for signing (`pt.sign([keys])` or `pt.signInput(...)`)
and submission (`pt.submit(rpc)`).

## Parameters

### input

[`GeneratorSettingsInput`](../interfaces/GeneratorSettingsInput.md)

## Returns

`AsyncGenerator`\<`any`\>
