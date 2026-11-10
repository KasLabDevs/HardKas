[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / CovenantStateCheck

# Interface: CovenantStateCheck

Defined in: [packages/sdk/src/covenants.ts:169](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L169)

The declared state of an output, checked against its address (the P2SH commits to the script that holds it).

## Properties

### detail?

> `readonly` `optional` **detail?**: `string`

Defined in: [packages/sdk/src/covenants.ts:173](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L173)

***

### state?

> `readonly` `optional` **state?**: `Readonly`\<`Record`\<`string`, `V1ArgValue`\>\>

Defined in: [packages/sdk/src/covenants.ts:172](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L172)

The state the checked script holds (decoded canonically), field → value.

***

### status

> `readonly` **status**: `"mismatch"` \| `"address-commits"` \| `"unverified"`

Defined in: [packages/sdk/src/covenants.ts:170](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L170)
