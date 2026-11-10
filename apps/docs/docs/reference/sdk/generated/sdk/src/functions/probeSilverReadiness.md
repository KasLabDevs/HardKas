[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / probeSilverReadiness

# Function: probeSilverReadiness()

> **probeSilverReadiness**(): `Promise`\<[`SilverReadiness`](../interfaces/SilverReadiness.md)\>

Defined in: [packages/sdk/src/capabilities.ts:186](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/capabilities.ts#L186)

The managed silverc resolves, the managed kaspa-wasm is verified on disk, and the canonical node proves its identity:
what `hardkas silver compile|deploy|spend|covenant` need. Read-only; failures are reported, never thrown.

## Returns

`Promise`\<[`SilverReadiness`](../interfaces/SilverReadiness.md)\>
