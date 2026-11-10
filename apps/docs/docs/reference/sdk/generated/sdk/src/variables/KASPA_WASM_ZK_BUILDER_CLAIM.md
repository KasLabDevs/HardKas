[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / KASPA\_WASM\_ZK\_BUILDER\_CLAIM

# Variable: KASPA\_WASM\_ZK\_BUILDER\_CLAIM

> `const` **KASPA\_WASM\_ZK\_BUILDER\_CLAIM**: `"KASPA_WASM_ZK_SCRIPT_BUILDER_2_1_0"`

Defined in: [packages/sdk/src/zk/toccata.ts:44](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L44)

Where the Toccata scripts come from. HardKAS does not assemble the RISC Zero Groth16 verifier itself: it calls the
`ZkScriptBuilder` shipped inside the pinned kaspa-wasm (rusty-kaspa 2.1.0). Upstream also publishes that builder as
the Rust crate `kaspa-txscript-zk-sdk` 2.1.0 (crates.io, 2026-10-04; rusty-kaspa v2.1.0 crypto/txscript/zk-sdk).
HardKAS does not use that crate: it uses the same builder compiled into kaspa-wasm. Only the output-bound
introspection that follows the verifier in proof-and-output-bound mode is HardKAS's own (r0BoundRedeemScript).
(Audit L-08 corrected the claim label; the crypto review's H3 corrected this comment, which said the crate did not exist.)
