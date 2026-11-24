[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / verifyR0Groth16Scripts

# Function: verifyR0Groth16Scripts()

> **verifyR0Groth16Scripts**(`params`): [`R0Groth16VerifyScriptsResult`](../interfaces/R0Groth16VerifyScriptsResult.md)

Defined in: [packages/sdk/src/zk/toccata.ts:2083](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L2083)

Verification of RISC Zero Groth16 redeem and signature scripts. It proves what the scripts ARE, not that they spend:
only the node runs the precompile.
 - Pinned verifier (crypto review H1): the verifying key handed to OpZkPrecompile (the push right before the Groth16
   tag) must be R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX, and the script must push the pinned control root (split
   into its two 16-byte halves) and BN254 control id (risc0 v3.0.4). Any other key is refused even when the script
   pushes the right image id: whoever knows its trapdoor forges receipts (ZK_VERIFYING_KEY_NOT_PINNED,
   ZK_CONTROL_ROOT_NOT_PINNED, ZK_CONTROL_ID_NOT_PINNED).
 - Byte-exact reconstruction (H2): the image id is read from the script's first push and, in output-bound mode, the
   outputs and the input limit from what follows the verifier; the script is then rebuilt with the builders
   buildR0Groth16Scripts uses (kaspa-wasm's verifier fragment, r0BoundRedeemScript) and compared byte for byte. Only
   an identical script is `redeemScriptCanonical`; only a canonical output-bound lock over the pinned verifier, with
   no issue, is `consensusEnforced` and gets its `enforces*` / `bound*` fields. Anything else is
   ZK_REDEEM_SCRIPT_NOT_CANONICAL: nothing is inferred from the presence of opcodes.
 - Expected outputs (payout, change) are compared with what a canonical output-bound lock binds; asked of any other
   script they are ZK_EXPECTED_BINDING_NOT_ENFORCED, never satisfied vacuously.
 - G1 · a canonical output-bound lock whose cheapest spend (one input of the bound outputs plus the node's relay floor at
   the smallest compute budget that covers the verifier) has a storage mass above BLOCK_STORAGE_MASS_LIMIT can never be
   included by any node: ZK_BOUND_OUTPUT_STORAGE_MASS_ABOVE_LIMIT (not consensus-enforced, do not fund it).

## Parameters

### params

[`R0Groth16VerifyScriptsParams`](../interfaces/R0Groth16VerifyScriptsParams.md)

## Returns

[`R0Groth16VerifyScriptsResult`](../interfaces/R0Groth16VerifyScriptsResult.md)
