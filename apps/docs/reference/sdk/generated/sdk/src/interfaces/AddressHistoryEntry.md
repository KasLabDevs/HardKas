[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / AddressHistoryEntry

# Interface: AddressHistoryEntry

Defined in: packages/query/dist/index.d.ts:917

## Properties

### acceptance?

> `readonly` `optional` **acceptance?**: [`AddressHistoryAcceptance`](AddressHistoryAcceptance.md)

Defined in: packages/query/dist/index.d.ts:935

***

### coinbase

> `readonly` **coinbase**: `boolean`

Defined in: packages/query/dist/index.d.ts:932

***

### covenantBound

> `readonly` **covenantBound**: `boolean`

Defined in: packages/query/dist/index.d.ts:934

An output or a spent entry of this transaction at the address is bound to a covenant.

***

### covenantBoundReceivedSompi

> `readonly` **covenantBoundReceivedSompi**: `string`

Defined in: packages/query/dist/index.d.ts:925

***

### direction

> `readonly` **direction**: `"out"` \| `"in"` \| `"self"`

Defined in: packages/query/dist/index.d.ts:922

in: pays the address and spends nothing of it; out: spends and pays nothing back; self: both.

***

### netSompi?

> `readonly` `optional` **netSompi?**: `string`

Defined in: packages/query/dist/index.d.ts:929

received (plain and covenant-bound) − spent, when both are known.

***

### outputs

> `readonly` **outputs**: readonly `AddressHistoryOutput`[]

Defined in: packages/query/dist/index.d.ts:930

***

### outsideWindow?

> `readonly` `optional` **outsideWindow?**: `string`

Defined in: packages/query/dist/index.d.ts:938

For a `workspace` entry: why the window does not show it.

***

### receivedSompi

> `readonly` **receivedSompi**: `string`

Defined in: packages/query/dist/index.d.ts:924

Plain KAS paid to the address (covenant-bound outputs are in covenantBoundReceivedSompi).

***

### source

> `readonly` **source**: `"node"` \| `"node+workspace"` \| `"workspace"`

Defined in: packages/query/dist/index.d.ts:920

`node`: read in the window; `node+workspace`: read in the window and recorded here; `workspace`: a record only.

***

### spends

> `readonly` **spends**: readonly `AddressHistorySpend`[]

Defined in: packages/query/dist/index.d.ts:931

***

### spentSompi?

> `readonly` `optional` **spentSompi?**: `string`

Defined in: packages/query/dist/index.d.ts:927

What it spent of the address; absent when an amount is unknown (see `spends`).

***

### txId

> `readonly` **txId**: `string`

Defined in: packages/query/dist/index.d.ts:918

***

### workspace?

> `readonly` `optional` **workspace?**: `AddressHistoryWorkspaceRecord`

Defined in: packages/query/dist/index.d.ts:936
