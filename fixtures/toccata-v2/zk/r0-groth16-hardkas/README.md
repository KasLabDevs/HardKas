# RISC Zero Groth16 receipt made by HardKAS (second, independent vector)

The second RISC Zero Groth16 receipt of the repository, made by HardKAS itself, so that the ZK checks no longer rest on one receipt (crypto review H4). Unlike [`r0-groth16-official`](../r0-groth16-official/README.md) it was **not public** until it was spent on Testnet-10 on 2026-11-13; it is public now (every spend reveals its proof), so it is a test vector like the other one. Its image id is listed in `PUBLIC_R0_TEST_VECTORS`: HardKAS builds no proof-only Testnet-10 lock for it (anyone could spend it), and builds proof-and-output-bound locks with the warning `ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE`.

## Provenance
- **Guest program:** [`guest/main.rs`](guest/main.rs). It reads a private 32-byte input and commits the journal `"hardkas-r0-probe-v1" || SHA-256(input)` (51 bytes). The input never leaves the zkVM.
- **Prover:** the risc0 v3.0.5 crate set — risc0-zkvm 3.0.5 with risc0-groth16 3.0.4 and risc0-circuit-recursion 4.0.4, the versions rusty-kaspa v2.1.0 pins (risc0-zkvm 3.0.4 itself does not build in prove mode against recursion 4.0.4). The files that define the control root, the BN254 control id, the verifying key and the verifier parameters are byte-identical in risc0 v3.0.4 and v3.0.5.
- **Groth16 wrap:** the official image `risczero/risc0-groth16-prover:v2025-04-03.1` (the one risc0-groth16 3.0.4 uses), CPU proving in Docker.
- **Format:** `receipt.hex` is the Borsh `Groth16Receipt<ReceiptClaim>` with the claim pruned to its digest, 325 bytes — the rusty-kaspa v2.1.0 zk-sdk format, as in the official vector.

## Values
- **Image ID:** `04c1cd7cafedbda5f993500071da6b4a1b1193799c0d6dd1e02174857a5dd826`
- **Journal hash:** `19c4db53d64ab877a70009036c906ae3d8c1b9fb7925f32c9bf039a5c52e5592`
- **Claim digest:** `003fd63976c4b49b8ad7458fd7945d0c5535665f4e0b269f2e8bbd77bb7b5ff9`
- **Verifier parameters:** `73c457ba541936f0d907daf0c7253a39a9c5c427c225ba7709e44702d3c6eedc` (the pinned `R0_GROTH16_VERIFIER_PARAMETERS_DIGEST`, H7)
- **SHA-256 of the 325 receipt bytes:** `cf74db6228d5ee9b4e2036f9a256ae093d9ff7a2b2a6d527681c36fbcf7d121d`

## What has been checked with it
- **risc0 itself:** `Receipt::verify(image_id)` on the full Groth16 receipt, and `verify_integrity` of the pruned one after a Borsh round trip.
- **Kaspa's script engine, offline:** kaspa-txscript 2.1.0 with zk-sdk 2.1.0 accepted the spend; a changed image id, journal hash or seal byte was refused. HardKAS's redeem script, signature script and compressed proof are byte-identical to the ones zk-sdk builds.
- **HardKAS, offline:** `hardkas zk toccata verify-receipt` → `ZK_R0_GROTH16_RECEIPT_VERIFIED`; `build-scripts` → `receiptClaimCrossCheck: MATCH`; the hermetic suite `packages/sdk/test/zk-second-receipt-h4.test.ts`.
- **Testnet-10 (public rusty-kaspad 2.1.0 node), 2026-11-13, with the 0.13.0-rc.2 candidate tarballs:** a proof-and-output-bound lock (`kaspatest:prn9an3tkl9yfmhwyy4epe4gtgwx57q0q3t5vevafcfjhw7567wgz2rzjg5fd`, payout bound to the funder) funded twice with test funds:
  - funding `4b14e00964452aa9319827719e993b1d818b9bbac4696f378b737304b0c882b2`, spent by `4e8715ba4e3bd1a2a27520e35b28b6a0b68d0b66f4bb266c7b0e83235ba3ea38` (payout 3 TKAS, fee 0.19398720 TKAS);
  - funding `cf2346bed7da370f66d4aaab1d8866ee2f132d1ce0db5135cd1fbf4d6cf6fbbd`, spent by `a62894a26726372b5037076a7761005a74c1dfb143066c6eca43abd3869b1355`;
  - rejected by the node before each valid spend: the payout one sompi short and another payee (`script ran, but verification failed`), one flipped proof byte (`ZK Integrity: ARK serialization error`), a valid proof of another program and this proof with another journal hash (`ZK Integrity: Groth16 verification failed`). A rejected spend and the valid one share a txid: a Kaspa txid does not cover the signature script.

## Not here
- The private input (it only made the journal; it is not needed to verify anything).
- An entry in the corpus manifest (`../manifest.json`): this directory is read by its own tests, not by `zk corpus verify`.
