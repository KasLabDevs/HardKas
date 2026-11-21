[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / spendR0Groth16Lock

# Function: spendR0Groth16Lock()

> **spendR0Groth16Lock**(`sdk`, `params`): `Promise`\<[`ZkSpendResult`](../interfaces/ZkSpendResult.md)\>

Defined in: [packages/sdk/src/zk/spend.ts:135](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L135)

ZK-SEND-1 · plans, records and sends the spend of a RISC Zero Groth16 lock through sdk.tx.send. In order, before anything
is read from a node: mainnet refused (MAINNET_BROADCAST_DISABLED, any spelling, any alias that declares it); a simulator
instance refused (ZK_SPEND_NODE_REQUIRED: no simulator runs the precompile); only simnet and testnet-10
(ZK_SPEND_NETWORK_UNSUPPORTED), testnet-10 only behind the payments' opt-in (experimental: true and
network.allowPublic: true; PUBLIC_NETWORK_BLOCKED); the lock checked (assertSpendableZkLock). Then the UTXO's amount
(from the node when not given), the builder (any issue is ZK_SPEND_BUILD_REFUSED with its codes), the plan, the signed
artifact and the ZK fact written to the store, and the one send. A rejection by the node is the send's recorded result
(`send.rejection`), never retried.

## Parameters

### sdk

[`Hardkas`](../classes/Hardkas.md)

### params

[`ZkSpendParams`](../interfaces/ZkSpendParams.md)

## Returns

`Promise`\<[`ZkSpendResult`](../interfaces/ZkSpendResult.md)\>
