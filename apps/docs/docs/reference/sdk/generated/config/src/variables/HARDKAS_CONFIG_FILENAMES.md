[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / HARDKAS\_CONFIG\_FILENAMES

# Variable: HARDKAS\_CONFIG\_FILENAMES

> `const` **HARDKAS\_CONFIG\_FILENAMES**: readonly \[`"hardkas.config.ts"`, `"hardkas.config.mts"`, `"hardkas.config.js"`, `"hardkas.config.mjs"`\]

Defined in: [packages/config/src/workspace-root.ts:11](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/workspace-root.ts#L11)

WORKSPACE-AUTHORITY-1 (WA-I0) · the one rule that says which directory is a HardKAS workspace's root: the directory of
the nearest `hardkas.config.*` at or above the start directory; with none up the tree, the start directory itself.
The start is the explicitly supplied directory (`--workspace`) or, without one, the current directory. A `.hardkas/`
directory is never a marker for this walk: a stray one (a subdirectory's) would otherwise capture the project.
`loadHardkasConfig` and the SDK walk with this same list, so the CLI and the SDK agree on the root.
