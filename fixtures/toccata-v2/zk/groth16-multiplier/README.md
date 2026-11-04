# Groth16 Multiplier Fixture — TOY / INSECURE / KNOWN TRAPDOOR

**Read this first.** This fixture exercises HardKAS's Groth16 pairing check (snarkjs over BN254). It is NOT evidence that anyone knows factors of 33, and it must never be cited as an "authentic" or "secure" proof. Its verification key has a publicly known trapdoor.

## 1. What the fixture is
- **Protocol:** Groth16 zk-SNARK over BN254 / alt_bn128.
- **Relation:** the Circom multiplier `c <== a * b` with `c` public (`a = 3`, `b = 11`, `c = 33`).
- **Toolchain that produced the files:** circom 2.1.6 + snarkjs 0.7.6 (`groth16 setup`, `zkey export verificationkey`, `groth16 prove`).

## 2. Why the key is insecure
The verification key shows the signature of an **uncontributed powers of tau** (`tau = alpha = beta = 1`):
- `vk_alpha_1` is the G1 generator `(1, 2)`;
- `vk_beta_2` equals `vk_gamma_2`, both the G2 generator;
- `IC[0]` is the point at infinity and `IC[1] = -G1`.

Only `delta` was randomised (`zkey contribute`). With `alpha`, `beta`, `gamma` and `IC` of known discrete logarithm, **anyone can forge a proof for any public input** without a witness, e.g. `A = (1 - c)·G1`, `B = G2`, `C = ∞` verifies for every `c`. The independent audit of 2026-11-01 built such forgeries for `c = 34` and `c = 123456789` and snarkjs accepted both (`ZK_GROTH16_MATH_VERIFIED`).

An earlier version of this README claimed a contributed ceremony. That claim was false and has been removed.

## 3. How HardKAS treats it
- `hardkas zk proof verify-math <this dir>` → `ZK_GROTH16_MATH_REJECTED` with `ZK_VERIFICATION_KEY_WEAK_TRAPDOOR` by default.
- `--allow-weak-vk` runs the pairing anyway (status `ZK_GROTH16_MATH_VERIFIED`, `summary.verificationKeyStrength = WEAK_TRAPDOOR_SUSPECTED`). This is the only legitimate use: testing that the verifier computes the pairing and rejects tampered inputs.
- The corpus (`fixtures/toccata-v2/zk/manifest.json`) lists it with `allowWeakVerificationKey: true` and `expectedMathStatus: ZK_GROTH16_MATH_VERIFIED`; `claims.cryptographicVerification` is `TOY_KNOWN_TRAPDOOR`.

## 4. What it still tests
- Pairing rejects an altered public signal (`34`), tampered coordinates, a swapped key (`ZK_GROTH16_PAIRING_FAILED`).
- Coherence (`verify-local`) and fixture-bound math (`verify-math`) agree on the manifest's content hashes.
- Canonical encodings, arity and range checks.

## 5. Replacement
A Groth16 vector with a published verification key and verifiable provenance is still wanted (see the Phase 3 remediation report, H-01). Candidates: a RISC Zero Groth16 receipt verified against RISC Zero's published verifying key (the same key kaspa-wasm embeds in the Toccata redeem script), once its public inputs (claim digest) are derived with a reviewed procedure. Until then this directory stays a TOY.
