[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / DUST\_THRESHOLD\_SOMPI

# Variable: DUST\_THRESHOLD\_SOMPI

> `const` **DUST\_THRESHOLD\_SOMPI**: `600n` = `600n`

Defined in: [packages/tx-builder/src/verify.ts:11](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/verify.ts#L11)

HardKAS's dust threshold in sompi: a HardKAS plan-verification heuristic, NOT a rusty-kaspa node rule.
L1-06: the v2.1.0 mempool does not reject dust outputs by a threshold ("Mempool does not reject dust outputs by
threshold", wallet/core/src/tx/mass.rs); the wallet's own dust heuristic, with MINIMUM_RELAY_TRANSACTION_FEE =
100,000 sompi/kg, gives ~60,300 sompi, and what really bounds small outputs is the storage mass (KIP-9: a single
output needs ≥ 2,000,000 sompi to stay within 500,000 g). The value 600 is kept for compatibility of the check.
