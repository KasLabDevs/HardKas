[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1\_CERTIFIED\_COMPUTE\_BUDGETS

# Variable: V1\_CERTIFIED\_COMPUTE\_BUDGETS

> `const` **V1\_CERTIFIED\_COMPUTE\_BUDGETS**: readonly [`V1CertifiedBudget`](../interfaces/V1CertifiedBudget.md)[]

Defined in: [packages/tx-builder/src/v1-budgets.ts:50](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-budgets.ts#L50)

Values certified against rusty-kaspad 2.1.0 simnet (the Silver corpus, fixtures/toccata-v2/silver). A P2PK input's
Schnorr check uses 100,000 units: budget 9 (allowance 99,999) is refused, 10 accepted. The Counter's covenant entry
ran within budget 0.
