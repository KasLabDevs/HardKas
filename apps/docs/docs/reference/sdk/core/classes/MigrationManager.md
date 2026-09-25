[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / MigrationManager

# Class: MigrationManager

Defined in: [packages/core/src/migrations.ts:15](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/migrations.ts#L15)

## Constructors

### Constructor

> **new MigrationManager**(): `MigrationManager`

#### Returns

`MigrationManager`

## Methods

### checkVersion()

> `static` **checkVersion**(`rootDir`): [`MigrationStatus`](../interfaces/MigrationStatus.md)

Defined in: [packages/core/src/migrations.ts:16](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/migrations.ts#L16)

#### Parameters

##### rootDir

`string`

#### Returns

[`MigrationStatus`](../interfaces/MigrationStatus.md)

***

### migrate()

> `static` **migrate**(`rootDir`, `dryRun?`): `void`

Defined in: [packages/core/src/migrations.ts:59](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/migrations.ts#L59)

#### Parameters

##### rootDir

`string`

##### dryRun?

`boolean` = `false`

#### Returns

`void`
