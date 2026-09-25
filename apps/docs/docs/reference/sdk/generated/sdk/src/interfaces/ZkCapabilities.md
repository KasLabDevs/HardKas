[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkCapabilities

# Interface: ZkCapabilities

Defined in: [packages/sdk/src/zk.ts:15](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L15)

## Properties

### claims

> **claims**: `object`

Defined in: [packages/sdk/src/zk.ts:30](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L30)

#### mainnet

> **mainnet**: `"BLOCKED_BY_POLICY"`

#### vmConsensusEquivalence

> **vmConsensusEquivalence**: `"NOT_CLAIMED"`

#### zkArtifactCoherence

> **zkArtifactCoherence**: `"EXPERIMENTAL"`

#### zkLocalVerification

> **zkLocalVerification**: `"EXPERIMENTAL_FIXTURE_ONLY"`

#### zkOnchainVerification

> **zkOnchainVerification**: `"NOT_CLAIMED"`

***

### errors

> **errors**: `string`[]

Defined in: [packages/sdk/src/zk.ts:37](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L37)

***

### experimental

> **experimental**: `true`

Defined in: [packages/sdk/src/zk.ts:17](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L17)

***

### proofSystems

> **proofSystems**: `object`

Defined in: [packages/sdk/src/zk.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L18)

#### groth16

> **groth16**: `object`

##### groth16.inspect

> **inspect**: `true`

##### groth16.proofGeneration

> **proofGeneration**: `"NOT_CLAIMED"`

##### groth16.verifyLocal

> **verifyLocal**: `"FIXTURE_COHERENCE_ONLY"`

#### risc0

> **risc0**: `object`

##### risc0.inspect

> **inspect**: `true`

##### risc0.proofGeneration

> **proofGeneration**: `"NOT_CLAIMED"`

##### risc0.verifyLocal

> **verifyLocal**: `"RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED"`

***

### schema

> **schema**: `"hardkas.zkCapabilities.v1"`

Defined in: [packages/sdk/src/zk.ts:16](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L16)
