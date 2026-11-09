[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ToccataPrecompileRules

# Interface: ToccataPrecompileRules

Defined in: [packages/sdk/src/zk/toccata.ts:494](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L494)

## Properties

### authorizationModel

> **authorizationModel**: `"IMAGE_ID_ONLY"`

Defined in: [packages/sdk/src/zk/toccata.ts:529](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L529)

The default (proof-only) lock binds the image id only: any holder of a valid receipt of that program can spend
(HK-16). A proof-and-output-bound lock also binds the outputs (IMAGE_ID_AND_OUTPUTS, see buildR0Groth16Scripts).

***

### blockComputeMassLimit

> **blockComputeMassLimit**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:524](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L524)

Consensus block compute-mass limit.

***

### computeBudgetMax

> **computeBudgetMax**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:509](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L509)

***

### consensusActivation

> **consensusActivation**: `"KIP-16 (Toccata Hardfork)"`

Defined in: [packages/sdk/src/zk/toccata.ts:530](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L530)

***

### curve

> **curve**: `"BN254"`

Defined in: [packages/sdk/src/zk/toccata.ts:498](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L498)

***

### freeScriptUnitsPerInput

> **freeScriptUnitsPerInput**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:505](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L505)

***

### gramsPerComputeBudgetUnit

> **gramsPerComputeBudgetUnit**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:503](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L503)

***

### groth16PrecompileCostGrams

> **groth16PrecompileCostGrams**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:501](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L501)

Cost charged by the Groth16 precompile itself (rusty-kaspa tags.rs: Gram(1000 * 140)).

***

### groth16PrecompileCostScriptUnits

> **groth16PrecompileCostScriptUnits**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:502](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L502)

***

### groth16VkElementCostScriptUnits

> **groth16VkElementCostScriptUnits**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:514](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L514)

Price of each gamma_abc_g1 (IC) element of the verifying key, on top of the tag cost.

***

### maximumComputeBudgetForBlockReferenceShape

> **maximumComputeBudgetForBlockReferenceShape**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:522](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L522)

Largest compute budget whose compute mass still fits a block, for the reference spend shape.

***

### maxStandardMass

> **maxStandardMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:512](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L512)

***

### minimumR0Groth16ComputeBudget

> **minimumR0Groth16ComputeBudget**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:520](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L520)

Smallest compute budget that covers the R0 Groth16 spend (overhead + tag + VK elements).

***

### opcode

> **opcode**: `"0xa6"`

Defined in: [packages/sdk/src/zk/toccata.ts:495](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L495)

***

### opcodeName

> **opcodeName**: `"OpZkPrecompile"`

Defined in: [packages/sdk/src/zk/toccata.ts:496](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L496)

***

### proofFormat

> **proofFormat**: `"Arkworks Compressed (128 bytes: G1[32] + G2[64] + G1[32])"`

Defined in: [packages/sdk/src/zk/toccata.ts:499](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L499)

***

### r0Groth16ObservedOverheadScriptUnits

> **r0Groth16ObservedOverheadScriptUnits**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:518](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L518)

Observed script units spent before the precompile by the R0 scripts (simnet evidence).

***

### r0Groth16VkElements

> **r0Groth16VkElements**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:516](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L516)

IC elements of the RISC Zero Groth16 wrapper key.

***

### recommendedComputeBudget

> **recommendedComputeBudget**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:507](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L507)

allowedScriptUnits(computeBudget) = computeBudget * scriptUnitsPerComputeBudgetUnit + freeScriptUnitsPerInput

***

### recommendedComputeBudgetGrams

> **recommendedComputeBudgetGrams**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:508](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L508)

***

### requiredTransactionVersion

> **requiredTransactionVersion**: `1`

Defined in: [packages/sdk/src/zk/toccata.ts:510](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L510)

***

### scriptSource

> **scriptSource**: `"KASPA_WASM_ZK_SCRIPT_BUILDER_2_1_0"`

Defined in: [packages/sdk/src/zk/toccata.ts:531](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L531)

***

### scriptUnitsPerComputeBudgetUnit

> **scriptUnitsPerComputeBudgetUnit**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:504](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L504)

***

### sigOpCountRequirement

> **sigOpCountRequirement**: `0`

Defined in: [packages/sdk/src/zk/toccata.ts:511](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L511)

***

### tag

> **tag**: `"0x20"`

Defined in: [packages/sdk/src/zk/toccata.ts:497](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L497)
