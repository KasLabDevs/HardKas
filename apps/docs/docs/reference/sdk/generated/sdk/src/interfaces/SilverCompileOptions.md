[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / SilverCompileOptions

# Interface: SilverCompileOptions

Defined in: [packages/sdk/src/silver.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/silver.ts#L23)

SilverScript v1 from the SDK.

Compilation is the managed, pinned silverc (kaspanet/silverscript v1.0.0);
the P2SH lock and address come from the Kaspa SDK. Funding and spending are
@hardkas/accounts (buildScriptFunding, buildSilverSweep, prepareSilverSpend)
or `hardkas silver deploy|spend`. There is no simulated path here.

## Properties

### constructorArgs?

> `optional` **constructorArgs?**: readonly `SilArtifactValue`[]

Defined in: [packages/sdk/src/silver.ts:27](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/silver.ts#L27)

***

### file?

> `optional` **file?**: `string`

Defined in: [packages/sdk/src/silver.ts:26](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/silver.ts#L26)

***

### source?

> `optional` **source?**: `string`

Defined in: [packages/sdk/src/silver.ts:25](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/silver.ts#L25)

Source text, or `file` relative to the SDK cwd.
