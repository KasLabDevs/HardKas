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

## Limits
- HardKAS has no local RISC Zero receipt verifier: `verify-local` and `verify-math` report `RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED` / `ZK_VERIFIER_UNSUPPORTED`.
- The receipt's claim is a digest, so the image id and journal hash passed to the builder are **not cross-checked** against the receipt (`ZK_RECEIPT_CLAIM_NOT_CROSSCHECKED`). Only the node decides spendability.
- On-chain acceptance is demonstrated only by the simnet suite (`zk-toccata-l1.simnet.test.ts`) against a node raised by the harness, and only when that suite has been run and its evidence file kept.
