[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ToccataPrecompileRules

# Interface: ToccataPrecompileRules

Defined in: [packages/sdk/src/zk/toccata.ts:571](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L571)

## Properties

### authorizationModel

> **authorizationModel**: `"IMAGE_ID_ONLY"`

Defined in: [packages/sdk/src/zk/toccata.ts:606](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L606)

The default (proof-only) lock binds the image id only: any holder of a valid receipt of that program can spend
(HK-16). A proof-and-output-bound lock also binds the outputs (IMAGE_ID_AND_OUTPUTS, see buildR0Groth16Scripts).

***

### blockComputeMassLimit

> **blockComputeMassLimit**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:601](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L601)

Consensus block compute-mass limit.

***

### computeBudgetMax

> **computeBudgetMax**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:586](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L586)

***

### consensusActivation

> **consensusActivation**: `"KIP-16 (Toccata Hardfork)"`

Defined in: [packages/sdk/src/zk/toccata.ts:607](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L607)

***

### curve

> **curve**: `"BN254"`

Defined in: [packages/sdk/src/zk/toccata.ts:575](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L575)

***

### freeScriptUnitsPerInput

> **freeScriptUnitsPerInput**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:582](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L582)

***

### gramsPerComputeBudgetUnit

> **gramsPerComputeBudgetUnit**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:580](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L580)

***

### groth16PrecompileCostGrams

> **groth16PrecompileCostGrams**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:578](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L578)

Cost charged by the Groth16 precompile itself (rusty-kaspa tags.rs: Gram(1000 * 140)).

***

### groth16PrecompileCostScriptUnits

> **groth16PrecompileCostScriptUnits**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:579](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L579)

***

### groth16VkElementCostScriptUnits

> **groth16VkElementCostScriptUnits**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:591](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L591)

Price of each gamma_abc_g1 (IC) element of the verifying key, on top of the tag cost.

***

### maximumComputeBudgetForBlockReferenceShape

> **maximumComputeBudgetForBlockReferenceShape**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:599](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L599)

Largest compute budget whose compute mass still fits a block, for the reference spend shape.

***

### maxStandardMass

> **maxStandardMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:589](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L589)

***

### minimumR0Groth16ComputeBudget

> **minimumR0Groth16ComputeBudget**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:597](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L597)

Smallest compute budget that covers the R0 Groth16 spend (overhead + tag + VK elements).

***

### opcode

> **opcode**: `"0xa6"`

Defined in: [packages/sdk/src/zk/toccata.ts:572](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L572)

***

### opcodeName

> **opcodeName**: `"OpZkPrecompile"`

Defined in: [packages/sdk/src/zk/toccata.ts:573](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L573)

***

### proofFormat

> **proofFormat**: `"Arkworks Compressed (128 bytes: G1[32] + G2[64] + G1[32])"`

Defined in: [packages/sdk/src/zk/toccata.ts:576](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L576)

***

### r0Groth16ObservedOverheadScriptUnits

> **r0Groth16ObservedOverheadScriptUnits**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:595](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L595)

Observed script units spent before the precompile by the R0 scripts (simnet evidence).

***

### r0Groth16VkElements

> **r0Groth16VkElements**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:593](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L593)

IC elements of the RISC Zero Groth16 wrapper key.

***

### recommendedComputeBudget

> **recommendedComputeBudget**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:584](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L584)

allowedScriptUnits(computeBudget) = computeBudget * scriptUnitsPerComputeBudgetUnit + freeScriptUnitsPerInput

***

### recommendedComputeBudgetGrams

> **recommendedComputeBudgetGrams**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:585](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L585)

***

### requiredTransactionVersion

> **requiredTransactionVersion**: `1`

Defined in: [packages/sdk/src/zk/toccata.ts:587](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L587)

***

### scriptSource

> **scriptSource**: `"KASPA_WASM_ZK_SCRIPT_BUILDER_2_1_0"`

Defined in: [packages/sdk/src/zk/toccata.ts:608](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L608)

***

### scriptUnitsPerComputeBudgetUnit

> **scriptUnitsPerComputeBudgetUnit**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:581](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L581)

***

### sigOpCountRequirement

> **sigOpCountRequirement**: `0`

Defined in: [packages/sdk/src/zk/toccata.ts:588](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L588)

***

### tag

> **tag**: `"0x20"`

Defined in: [packages/sdk/src/zk/toccata.ts:574](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L574)
