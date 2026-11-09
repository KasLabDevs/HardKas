[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0\_GROTH16\_OBSERVED\_SCRIPT\_OVERHEAD\_SCRIPT\_UNITS

# Variable: R0\_GROTH16\_OBSERVED\_SCRIPT\_OVERHEAD\_SCRIPT\_UNITS

> `const` **R0\_GROTH16\_OBSERVED\_SCRIPT\_OVERHEAD\_SCRIPT\_UNITS**: `2811n` = `2811n`

Defined in: [packages/sdk/src/zk/toccata.ts:74](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L74)

Script units the R0 redeem/signature scripts spend BEFORE the precompile (pushes and the claim-digest
logic). OBSERVED, not derived: rusty-kaspad 2.1.0 simnet reported "used=14002811" when the 14,000,000 SU
tag cost was charged (fixtures/toccata-v2/zk/r0-groth16-official/evidence.json).
