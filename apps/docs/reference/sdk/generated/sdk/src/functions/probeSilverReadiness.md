[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / probeSilverReadiness

# Function: probeSilverReadiness()

> **probeSilverReadiness**(`options?`): `Promise`\<[`SilverReadiness`](../interfaces/SilverReadiness.md)\>

Defined in: [packages/sdk/src/capabilities.ts:309](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L309)

The managed silverc resolves, the managed kaspa-wasm is verified on disk, and the node the Silver on-chain commands
would use proves its identity (the canonical localnet by default; `options.endpoint` for another node): what
`hardkas silver compile|deploy|spend|covenant` need. Read-only; failures are reported, never thrown.

## Parameters

### options?

[`SilverReadinessOptions`](../interfaces/SilverReadinessOptions.md) = `{}`

## Returns

`Promise`\<[`SilverReadiness`](../interfaces/SilverReadiness.md)\>
