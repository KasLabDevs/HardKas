[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0\_GROTH16\_VERIFICATION\_KEY

# Variable: R0\_GROTH16\_VERIFICATION\_KEY

> `const` **R0\_GROTH16\_VERIFICATION\_KEY**: `Readonly`\<\{ `curve`: `string`; `IC`: \[`string`, `string`, `string`\][]; `nPublic`: `number`; `protocol`: `"groth16"`; `schema`: `"hardkas.zk.groth16.verificationKey.v1"`; `verificationKeyId`: `string`; `vk_alpha_1`: \[`string`, `string`, `string`\]; `vk_beta_2`: \[\[`string`, `string`\], \[`string`, `string`\], \[`string`, `string`\]\]; `vk_delta_2`: \[\[`string`, `string`\], \[`string`, `string`\], \[`string`, `string`\]\]; `vk_gamma_2`: \[\[`string`, `string`\], \[`string`, `string`\], \[`string`, `string`\]\]; \}\>

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:109](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L109)

The pinned RISC Zero Groth16 verifying key in snarkjs JSON form (decoded from the compressed bytes).
