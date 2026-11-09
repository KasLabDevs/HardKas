[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / SilverCompileOptions

# Interface: SilverCompileOptions

Defined in: [packages/sdk/src/silver.ts:27](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/silver.ts#L27)

SilverScript v1 from the SDK.

Compilation is the managed, pinned silverc (kaspanet/silverscript v1.0.0);
the P2SH lock and address come from the Kaspa SDK. Covenants, and contract
deploys and spends in transaction v1, are the v1 engine: `sdk.covenants`
(planGenesis, planTransition, planContractDeploy, planContractSpend, sign,
send), which `hardkas silver covenant`, `hardkas silver engine` and
`hardkas silver deploy|spend --tx-version 1` run too. Transaction v0 deploys
and spends are @hardkas/accounts (buildScriptFunding, buildSilverSweep) and
`hardkas silver deploy|spend` by default. There is no simulated path here.

## Properties

### constructorArgs?

> `optional` **constructorArgs?**: readonly `SilArtifactValue`[]

Defined in: [packages/sdk/src/silver.ts:31](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/silver.ts#L31)

***

### file?

> `optional` **file?**: `string`

Defined in: [packages/sdk/src/silver.ts:30](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/silver.ts#L30)

***

### source?

> `optional` **source?**: `string`

Defined in: [packages/sdk/src/silver.ts:29](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/silver.ts#L29)

Source text, or `file` relative to the SDK cwd.
