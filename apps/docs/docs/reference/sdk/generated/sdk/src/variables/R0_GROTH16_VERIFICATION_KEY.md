[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0\_GROTH16\_VERIFICATION\_KEY

# Variable: R0\_GROTH16\_VERIFICATION\_KEY

> `const` **R0\_GROTH16\_VERIFICATION\_KEY**: `Readonly`\<\{ `curve`: `string`; `IC`: \[`string`, `string`, `string`\][]; `nPublic`: `number`; `protocol`: `"groth16"`; `schema`: `"hardkas.zk.groth16.verificationKey.v1"`; `verificationKeyId`: `string`; `vk_alpha_1`: \[`string`, `string`, `string`\]; `vk_beta_2`: \[\[`string`, `string`\], \[`string`, `string`\], \[`string`, `string`\]\]; `vk_delta_2`: \[\[`string`, `string`\], \[`string`, `string`\], \[`string`, `string`\]\]; `vk_gamma_2`: \[\[`string`, `string`\], \[`string`, `string`\], \[`string`, `string`\]\]; \}\>

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:85](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L85)

The pinned RISC Zero Groth16 verifying key in snarkjs JSON form (decoded from the compressed bytes).
