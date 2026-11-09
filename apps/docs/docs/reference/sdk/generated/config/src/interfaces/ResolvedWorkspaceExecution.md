[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / ResolvedWorkspaceExecution

# Interface: ResolvedWorkspaceExecution

Defined in: [packages/config/src/resolve.ts:187](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/resolve.ts#L187)

## Properties

### execution

> **execution**: `object`

Defined in: [packages/config/src/resolve.ts:189](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/resolve.ts#L189)

The execution target the workspace runs on: mode, domain and network.

#### domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

#### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

#### network

> **network**: `string`

***

### networkId

> **networkId**: `string`

Defined in: [packages/config/src/resolve.ts:191](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/resolve.ts#L191)

`execution.network` after the alias of a `simnet` the config declares simulated (the simulator is "simulated").

***

### networkTarget

> **networkTarget**: [`HardkasNetworkTarget`](../type-aliases/HardkasNetworkTarget.md)

Defined in: [packages/config/src/resolve.ts:193](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/resolve.ts#L193)

The network's declaration (built-ins merged with the config's); absent only for the simulator.

***

### rpcUrl?

> `optional` **rpcUrl?**: `string`

Defined in: [packages/config/src/resolve.ts:203](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/resolve.ts#L203)

The endpoint the resolved network declares (`networks[networkId].rpcUrl`), when it declares one: the end of the
chain target → network → mode → endpoint, the same for the SDK and the CLI. Absent for the simulator and for a
network without a declared URL (the callers' documented default applies then: the canonical localnet for the
localnet mode).

***

### source

> **source**: [`WorkspaceExecutionSource`](../type-aliases/WorkspaceExecutionSource.md)

Defined in: [packages/config/src/resolve.ts:195](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/resolve.ts#L195)

What decided: an explicit target, an explicit network, the `execution` contract, or the legacy `defaultNetwork`.

***

### targetName?

> `optional` **targetName?**: `string`

Defined in: [packages/config/src/resolve.ts:196](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/resolve.ts#L196)
