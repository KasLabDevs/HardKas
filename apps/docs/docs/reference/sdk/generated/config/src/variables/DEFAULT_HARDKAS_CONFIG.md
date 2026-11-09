[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / DEFAULT\_HARDKAS\_CONFIG

# Variable: DEFAULT\_HARDKAS\_CONFIG

> `const` **DEFAULT\_HARDKAS\_CONFIG**: [`HardkasConfig`](../interfaces/HardkasConfig.md)

Defined in: [packages/config/src/defaults.ts:15](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/defaults.ts#L15)

The built-in configuration: what a workspace without hardkas.config.ts runs with, and what fills
the fields a hardkas.config.ts leaves out (see load.ts).

PAPERCUTS #37: the built-in default target is declared through the `execution` contract (the
simulator, with the canonical localnet as a named target), never through the deprecated
`defaultNetwork`. The `defaultNetwork` below is only the mirror of that default for the SDK and
CLI paths that still read the legacy key (`config.defaultNetwork || …`): it is not a declaration,
the resolver never warns about it (an execution target is always present), and it goes away once
those readers follow the resolved execution target.
