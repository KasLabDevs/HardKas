[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0\_GROTH16\_VERIFIER\_PARAMETERS\_DIGEST

# Variable: R0\_GROTH16\_VERIFIER\_PARAMETERS\_DIGEST

> `const` **R0\_GROTH16\_VERIFIER\_PARAMETERS\_DIGEST**: `"73c457ba541936f0d907daf0c7253a39a9c5c427c225ba7709e44702d3c6eedc"` = `"73c457ba541936f0d907daf0c7253a39a9c5c427c225ba7709e44702d3c6eedc"`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:54](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L54)

H7 · the digest of RISC Zero's default Groth16ReceiptVerifierParameters, which every receipt of this verifier carries
(the last 32 bytes of a pruned-claim receipt). Upstream definition: risc0-zkvm `src/receipt/groth16.rs` (`impl Default`
and `impl Digestible`: tagged_struct("risc0.Groth16ReceiptVerifierParameters", [control_root, bn254_control_id,
verifying_key.digest()], [])), identical in risc0-zkvm 3.0.4 and 3.0.5. Computed with that code on 2026-11-13 from the
control root and BN254 control id pinned above and the verifying-key digest 21c5fdd9…11ab; the public kaspa-python-sdk
vector and HardKAS's own receipt carry the same value. A receipt with another value was made for another verifier
(another risc0 release): its proof does not verify against the key and control root this lock pins.
