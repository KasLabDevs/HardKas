[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / KASPA\_WASM\_ZK\_BUILDER\_CLAIM

# Variable: KASPA\_WASM\_ZK\_BUILDER\_CLAIM

> `const` **KASPA\_WASM\_ZK\_BUILDER\_CLAIM**: `"KASPA_WASM_ZK_SCRIPT_BUILDER_2_1_0"`

Defined in: [packages/sdk/src/zk/toccata.ts:44](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L44)

Where the Toccata scripts come from. HardKAS does not assemble ZK scripts itself: it calls the
`ZkScriptBuilder` shipped inside the pinned kaspa-wasm (rusty-kaspa 2.1.0). There is no upstream
package named "kaspa-txscript-zk-sdk"; the earlier claim label was imprecise (audit L-08).
