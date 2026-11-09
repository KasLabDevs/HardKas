# RISC Zero Groth16 Test Vector for Kaspa Toccata (official provenance)

## Provenance
- `kaspanet/kaspa-python-sdk`: `examples/zk/groth16_onchain.py` (image id, journal hash, `TX_VERSION = 1`, `ZK_COMPUTE_BUDGET = 1600`).
- `kaspanet/kaspa-python-sdk`: `examples/zk/data/groth.rcpt.hex` — `receipt.hex` here is byte-identical (650 hex chars; SHA-256 of the text `be2ad59c1f13bd996740cea0369f7429c174598c45978dd74e1686c9666f3b05`, re-verified 2026-11-01).
- Scripts are produced by the `ZkScriptBuilder` of kaspa-wasm (rusty-kaspa 2.1.0, the pinned toolchain). There is no upstream package called "kaspa-txscript-zk-sdk"; earlier text used that name by mistake.

## Vector values
- **Image ID**: `75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0`
- **Journal hash**: `5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456`
- **Receipt**: 325 bytes, Borsh-serialised `Groth16Receipt<ReceiptClaim>`.

## Script properties (as built by kaspa-wasm)
- **Redeem script (locking)**: 801 bytes. Pushes the image id, the embedded RISC Zero verifying key and the claim-digest logic, and ends with `OP_DATA_1 0x20` (Groth16 tag) + `0xa6` (`OpZkPrecompile`).
- **Signature script (unlocking)**: 967 bytes, push-only: journal hash (32 B), compressed Groth16 proof (128 B), redeem script.
- `hardkas zk toccata build-scripts` verifies this shape by parsing opcodes (`verifyR0Groth16Scripts`); it does not execute the script.

## Authorization model (read before funding anything)
- The lock built by the upstream `ZkScriptBuilder` minimal flow (`commitToGroth16(imageId)` + `finalizeWithGroth16Proof`) binds **only the image id**. The journal hash is supplied by the unlocking script; outputs, outpoint, transaction and network are not bound.
- Consequence: **whoever holds a valid receipt of that program spends**, every UTXO at that address, to outputs of their choosing, on any network; a spend seen in the mempool can be copied (replay / front-running). Security is whatever the guest program enforces through its journal. This is upstream design (kaspa-python-sdk: "the zk proof is the authorization"), not a HardKAS bug.
- This receipt is **public** (here and in kaspa-python-sdk), so its P2SH is anyone-can-spend. HardKAS returns only the simnet address for it (`PUBLIC_R0_TEST_VECTORS`) and refuses testnet/mainnet addresses and spends even with `--ack-image-id-only-lock`. For other receipts, testnet/mainnet addresses need `--address-network` + `--ack-image-id-only-lock` (SDK: `addressNetworks` + `acknowledgeImageIdOnlyLock`). Every result carries the warning `ZK_LOCK_BINDS_IMAGE_ID_ONLY`.
- HardKAS's proof-and-output-bound mode binds the OUTPUTS by Toccata introspection (see Limits). Binding the journal or the transaction itself (e.g. a key committed in the journal and a signature over the sighash) is not provided and requires external cryptographic review; binding the spent outpoint is impossible (the funding txid commits to the P2SH).

## Checks HardKAS performs
- **Receipt claim cross-check:** the receipt carries its `ReceiptClaim` pruned to a digest (`a95ac0b3…9dde`). `build-scripts` recomputes it from (imageId, journalHash) (rusty-kaspa 2.1.0 `receipt_claim.rs`, `tagged_struct`) and refuses a mismatch (`ZK_RECEIPT_CLAIM_MISMATCH`): a wrong image id would lock funds to a program with no such receipt; a wrong journal would make the unlocking script fail.
- **Local Groth16 verification:** `hardkas zk toccata verify-receipt` (SDK `verifyR0Groth16ReceiptLocal`) checks the seal with snarkjs against the PINNED RISC Zero verifying key (risc0 v3.0.4 `groth16/src/verifier.rs`; the same key, compressed, is `R0_SERIALIZED_COMPRESSED_VK` of rusty-kaspa v2.1.0 and the 424-byte push of the redeem script), with the pinned control root `a54dc85a…1f56` and BN254 control id `c07a6514…4404` (risc0 v3.0.4 `circuit/recursion/src/control_id.rs`). Only that result sets a ZK fact's `verifiedOffChain`.
- **Compute budget:** the precompile charges 14,000,000 SU for the tag plus 250,000 SU per verifying-key element (6 here); with the ~2,811 SU observed before the precompile the minimum budget is 1550 (1600 leaves ~3 %). Budgets whose compute mass exceeds the block limit (500,000) are refused.

## Limits
- Off-chain (snarkjs) and on-chain (arkworks) verifiers are different implementations; a local VERIFIED does not replace node acceptance.
- `verifier_parameters` (`73c457ba…eedc`) is not compared with a published value (no official source pinned for it).
- `verify-local` / `verify-math` on this directory still report `RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED` / `ZK_VERIFIER_UNSUPPORTED` (generic zkVM receipts); use `toccata verify-receipt`.
- On-chain acceptance is demonstrated only by the simnet suites against a node raised by the harness, and only when they have been run: `zk-toccata-l1.simnet.test.ts` (its own transaction, negative cases, evidence file) and `zk-output-bound-l1.simnet.test.ts` (the SDK's own `buildR0Groth16Scripts` / `buildR0Groth16Transaction`, proof-only and proof-and-output-bound; wrong outputs, two inputs and an oversized input rejected by the node).
- proof-and-output-bound locks (`--mode proof-and-output-bound`) also bind the payout/change outputs by introspection, allow one input and at most the bound outputs plus the fee cap; fund them with `requiredFundingSompi`. The journal is still not checked on-chain.