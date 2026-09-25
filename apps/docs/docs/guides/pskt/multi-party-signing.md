# Multi-Party Signing (Combine)

PSKT enables decentralized, multi-party coordination. 

For example, if a transaction spends from a 2-of-3 Multisig address, or spends two different inputs owned by two different people, the signing process is distributed.

## 1. Distribution

The Coordinator creates a single initial PSKT:
```bash
hardkas pskt export --plan plan.json --out base_session.json
```

The Coordinator sends `base_session.json` to both Alice and Bob.

## 2. Independent Signing

Alice and Bob independently inspect and sign their copies of the PSKT.

**Alice's Machine:**
```bash
hardkas pskt sign base_session.json --account alice --out alice_signed.json
```

**Bob's Machine:**
```bash
hardkas pskt sign base_session.json --account bob --out bob_signed.json
```

## 3. Merge (Combine)

Alice and Bob send their partially signed PSKTs back to the Coordinator. The Coordinator must merge them into a single PSKT containing both signatures.

```bash
hardkas pskt merge alice_signed.json bob_signed.json --out merged_session.json
```

**Merge Semantics:**
* HardKAS delegates to the upstream native Kaspa Combiner.
* The Combiner verifies that both PSKTs represent the *exact same underlying transaction*. If Alice and Bob signed PSKTs with different outputs or inputs, the merge will strictly fail.
* The Combiner aggregates the partial signatures from both files.

## 4. Finalize & Extract

The `merged_session.json` now contains both signatures. The Coordinator can finalize and extract it exactly as in a single-signer workflow:

```bash
hardkas pskt finalize merged_session.json --out final.json
hardkas pskt extract final.json --network simnet --out tx.json
```
