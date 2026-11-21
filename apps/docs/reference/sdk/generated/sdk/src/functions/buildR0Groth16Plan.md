[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / buildR0Groth16Plan

# Function: buildR0Groth16Plan()

> **buildR0Groth16Plan**(`params`): [`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)

Defined in: [packages/sdk/src/zk/toccata.ts:1542](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L1542)

Builds a TxPlanArtifact (hardkas.txPlan.v1) for a Toccata ZK Groth16 spend.
Integrates ZK transactions directly into HardKAS's deterministic plan pipeline. The estimated mass is
measured for the real shape with kaspa-wasm (ZK-08), never the 1602 reference constant. Throws
`ZK_P2SH_ADDRESS_UNAVAILABLE` when the scripts carry no address for the plan's network (no placeholder), and
`MAINNET_SIGNING_DISABLED` for mainnet, before anything is read (see buildR0Groth16Transaction).

## Parameters

### params

[`BuildR0Groth16TxParams`](../interfaces/BuildR0Groth16TxParams.md)

## Returns

[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)
