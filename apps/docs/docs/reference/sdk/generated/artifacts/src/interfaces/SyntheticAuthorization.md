[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SyntheticAuthorization

# Interface: SyntheticAuthorization

Defined in: [packages/artifacts/src/signed-tx.ts:28](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/signed-tx.ts#L28)

## Properties

### kind

> `readonly` **kind**: `"synthetic"`

Defined in: [packages/artifacts/src/signed-tx.ts:29](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/signed-tx.ts#L29)

***

### planArtifactId

> `readonly` **planArtifactId**: `string`

Defined in: [packages/artifacts/src/signed-tx.ts:31](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/signed-tx.ts#L31)

The plan this authorization is bound to (IC-6′.1), by artifactId.

***

### signers

> `readonly` **signers**: readonly `string`[]

Defined in: [packages/artifacts/src/signed-tx.ts:33](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/signed-tx.ts#L33)

The account identities that authorized it (IC-6′.3): authenticated, never metadata.
