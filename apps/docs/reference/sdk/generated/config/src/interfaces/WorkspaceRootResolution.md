[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / WorkspaceRootResolution

# Interface: WorkspaceRootResolution

Defined in: [packages/config/src/workspace-root.ts:34](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/workspace-root.ts#L34)

## Properties

### configPath?

> `optional` **configPath?**: `string`

Defined in: [packages/config/src/workspace-root.ts:38](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/workspace-root.ts#L38)

The `hardkas.config.*` that decided the root, when one did.

***

### explicit?

> `optional` **explicit?**: `string`

Defined in: [packages/config/src/workspace-root.ts:42](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/workspace-root.ts#L42)

The `--workspace` value as given, when one was.

***

### root

> **root**: `string`

Defined in: [packages/config/src/workspace-root.ts:36](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/workspace-root.ts#L36)

The workspace root: the config's directory, or the start directory when no config is up the tree.

***

### startDir

> **startDir**: `string`

Defined in: [packages/config/src/workspace-root.ts:40](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/workspace-root.ts#L40)

Where the walk started: the explicit directory, or the current directory.
