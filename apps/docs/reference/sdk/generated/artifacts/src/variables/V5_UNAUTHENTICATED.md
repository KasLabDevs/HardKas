[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / V5\_UNAUTHENTICATED

# Variable: V5\_UNAUTHENTICATED

> `const` **V5\_UNAUTHENTICATED**: `ReadonlySet`\<`string`\>

Defined in: [packages/artifacts/src/canonical.ts:87](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/canonical.ts#L87)

Hash version 5 (Closure Pack IC-1′.1b): the CLOSED list of operational
fields that are never authenticated, matched ONLY at the top level of the
artifact. Everything nested is authenticated. Adding a name here widens what
an adversary may change without detection: it is a contract change, and the
schema-introspection test must be updated with it.
