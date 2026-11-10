[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / COMPUTE\_BUDGET\_MAX

# Variable: COMPUTE\_BUDGET\_MAX

> `const` **COMPUTE\_BUDGET\_MAX**: `65535` = `65535`

Defined in: [packages/sdk/src/zk/toccata.ts:55](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L55)

Consensus / mempool constants, cross-checked against rusty-kaspa 2.1.0
(`crypto/txscript/src/zk_precompiles/tags.rs`, `consensus/core/src/mass/mod.rs`) and the
Toccata Script Pricing page:
  allowed script units per input = compute_budget * 10_000 + 9_999
  1 compute_budget unit            = 100 grams of compute mass = 10_000 script units
  Groth16 precompile (tag 0x20)    = 140_000 grams = 14_000_000 script units (+ pushes)
  compute mass                     = tx bytes + 10 * script-public-key bytes + 100 * sum(compute_budget)
