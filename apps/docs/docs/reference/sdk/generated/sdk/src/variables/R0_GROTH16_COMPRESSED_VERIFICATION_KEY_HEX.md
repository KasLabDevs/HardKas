[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0\_GROTH16\_COMPRESSED\_VERIFICATION\_KEY\_HEX

# Variable: R0\_GROTH16\_COMPRESSED\_VERIFICATION\_KEY\_HEX

> `const` **R0\_GROTH16\_COMPRESSED\_VERIFICATION\_KEY\_HEX**: `"e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2dabb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036789edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1933033e7fea1f40604eaacf699d4be9aacc577054a0db22d9129a1728ff85a01a1c3af829b62bf4914c0bcf2c81a4bd577190eff5f194ee9bac95faefd53cb0030600000000000000e43bdc655d0f9d730535554d9caa611ddd152c081a06a932a8e1d5dc259aac123f42a188f683d869873ccc4c119442e57b056e03e2fa92f2028c97bc20b9078747c30f85444697fdf436e348711c011115963f855197243e4b39e6cbe236ca8ba7f2042e11f9255afbb6c6e2c3accb88e401f2aac21c097c92b3fbdb99f98a9b0dcd6c075ada6ed0ddfece1d4a2d005f61a7d5df0b75c18a5b2374d64e495fab93d4c4b1200394d5253cce2f25a59b862ee8e4cd43686603faa09d5d0d3c1c8f"` = `"e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2dabb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036789edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1933033e7fea1f40604eaacf699d4be9aacc577054a0db22d9129a1728ff85a01a1c3af829b62bf4914c0bcf2c81a4bd577190eff5f194ee9bac95faefd53cb0030600000000000000e43bdc655d0f9d730535554d9caa611ddd152c081a06a932a8e1d5dc259aac123f42a188f683d869873ccc4c119442e57b056e03e2fa92f2028c97bc20b9078747c30f85444697fdf436e348711c011115963f855197243e4b39e6cbe236ca8ba7f2042e11f9255afbb6c6e2c3accb88e401f2aac21c097c92b3fbdb99f98a9b0dcd6c075ada6ed0ddfece1d4a2d005f61a7d5df0b75c18a5b2374d64e495fab93d4c4b1200394d5253cce2f25a59b862ee8e4cd43686603faa09d5d0d3c1c8f"`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:37](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L37)

RISC Zero Groth16 receipts (the "Groth16 wrapper" of a zkVM execution) as Kaspa Toccata verifies them
with OpZkPrecompile tag 0x20. This module (a) recomputes the ReceiptClaim digest from (imageId,
journalHash) to cross-check a receipt (HK-19) and (b) verifies the receipt's Groth16 proof locally with
snarkjs against the PINNED official RISC Zero verifying key (CA-ZK-03).

Pinned constants and their sources (all official releases):
  - verifying key: risc0 v3.0.4, risc0/groth16/src/verifier.rs (ALPHA_X … IC5_Y, decimal); compressed by
    arkworks it is R0_SERIALIZED_COMPRESSED_VK of rusty-kaspa v2.1.0
    crypto/txscript/zk-sdk/src/zk_to_script/fragments/groth16.rs (whose test verify_upstream_vk_roundtrip
    compares it with risc0_groth16::verifying_key()) and the 424-byte key the kaspa-wasm 2.1.0
    ZkScriptBuilder embeds in the redeem script;
  - control root and BN254 control id: risc0 v3.0.4, risc0/circuit/recursion/src/control_id.rs
    (ALLOWED_CONTROL_ROOT, BN254_IDENTITY_CONTROL_ID), the defaults of Groth16ReceiptVerifierParameters
    that rusty-kaspa 2.1.0 (risc0-groth16 =3.0.4, risc0-circuit-recursion =4.0.4) pushes in the script.
The public inputs are [a0, a1, c0, c1, id] exactly as risc0-groth16 Verifier::new builds them:
(a0, a1) = split_digest(control_root), (c0, c1) = split_digest(claim_digest), id = bn254_control_id
byte-reversed, i.e. each 16-byte half / the id read as a little-endian integer.
