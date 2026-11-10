[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1NextState

# Type Alias: V1NextState

> **V1NextState** = \{ `covenantId`: `string`; `input`: `number`; `outputs`: readonly `number`[]; `successor`: \{ `artifactSha256`: `string`; `constructorArgs`: readonly [`V1ArgValue`](V1ArgValue.md)[]; `state`: `Readonly`\<`Record`\<`string`, [`V1ArgValue`](V1ArgValue.md)\>\>; `stateToConstructorArg`: `Readonly`\<`Record`\<`string`, `number`\>\>; \}; \} \| \{ `covenantId`: `string`; `input`: `number`; `outputs`: readonly `number`[]; `states`: readonly `Readonly`\<`Record`\<`string`, [`V1ArgValue`](V1ArgValue.md)\>\>[]; \}

Defined in: [packages/tx-builder/src/v1-plan.ts:122](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L122)

The state(s) a transition moves a covenant to, as declared in the plan (F1.4 checks each continuation is the P2SH of the
contract's template with that state). Two forms:
 - `successor` (phase 1, 1:1): the successor silverc compiles from the declared state, each State field initialized
   directly by one constructor parameter;
 - `states` (phase 2): one State per continuation, in output order (output `outputs[k]` ↔ new state `k`), encoded into
   the current template by silverscript-abi's codec: any state the ABI encodes, any number of continuations (zero:
   termination, where the declaration allows it).
`input` is the covenant input the continuations belong to: the authorizing input (auth) or the group's leader (cov).
