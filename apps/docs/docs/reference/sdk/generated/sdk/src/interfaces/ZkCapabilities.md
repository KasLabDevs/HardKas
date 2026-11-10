[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkCapabilities

# Interface: ZkCapabilities

Defined in: [packages/sdk/src/zk.ts:218](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L218)

## Properties

### claims

> **claims**: `object`

Defined in: [packages/sdk/src/zk.ts:244](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L244)

#### mainnet

> **mainnet**: `"BLOCKED_BY_POLICY"`

#### vmConsensusEquivalence

> **vmConsensusEquivalence**: `"NOT_CLAIMED"`

#### zkArtifactCoherence

> **zkArtifactCoherence**: `"EXPERIMENTAL"`

#### zkLocalVerification

> **zkLocalVerification**: `"EXPERIMENTAL_FIXTURE_ONLY"`

#### zkMathematicalVerification?

> `optional` **zkMathematicalVerification?**: [`ZkMathVerificationClaim`](../type-aliases/ZkMathVerificationClaim.md)

#### zkOnchainVerification

> **zkOnchainVerification**: `"NOT_CLAIMED"`

#### zkToccataL1ScriptBuilding?

> `optional` **zkToccataL1ScriptBuilding?**: `"KASPA_WASM_ZK_SCRIPT_BUILDER_2_1_0"`

***

### errors

> **errors**: `string`[]

Defined in: [packages/sdk/src/zk.ts:253](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L253)

***

### experimental

> **experimental**: `true`

Defined in: [packages/sdk/src/zk.ts:220](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L220)

***

### proofSystems

> **proofSystems**: `object`

Defined in: [packages/sdk/src/zk.ts:221](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L221)

#### groth16

> **groth16**: `object`

##### groth16.inspect

> **inspect**: `true`

##### groth16.proofGeneration

> **proofGeneration**: `"NOT_CLAIMED"`

##### groth16.trustedSetupProvenance

> **trustedSetupProvenance**: `"NOT_CLAIMED"`

##### groth16.verifyLocal

> **verifyLocal**: `"FIXTURE_COHERENCE_ONLY"`

##### groth16.verifyMath?

> `optional` **verifyMath?**: `"SNARKJS_BN254_PINNED_VK_ONLY"`

Pairing check (snarkjs, BN254). VERIFIED only against a pinned key (caller pin or the in-code
registry); otherwise the result is ZK_GROTH16_MATH_VALID_UNANCHORED_VK.

#### risc0

> **risc0**: `object`

##### risc0.groth16ReceiptVerifyLocal?

> `optional` **groth16ReceiptVerifyLocal?**: `"SNARKJS_BN254_PINNED_RISC0_VK_3_0_4"`

RISC Zero GROTH16 receipts: local snarkjs check against the pinned official RISC Zero key (CA-ZK-03).

##### risc0.inspect

> **inspect**: `true`

##### risc0.proofGeneration

> **proofGeneration**: `"NOT_CLAIMED"`

##### risc0.toccataL1Scripts?

> `optional` **toccataL1Scripts?**: `"KASPA_WASM_ZK_SCRIPT_BUILDER_2_1_0"`

Scripts come from the ZkScriptBuilder shipped in the pinned kaspa-wasm (rusty-kaspa 2.1.0).

##### risc0.verifyLocal

> **verifyLocal**: `"RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED"`

Generic zkVM receipts (succinct/composite) are inspect-only.

***

### schema

> **schema**: `"hardkas.zkCapabilities.v1"`

Defined in: [packages/sdk/src/zk.ts:219](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L219)
