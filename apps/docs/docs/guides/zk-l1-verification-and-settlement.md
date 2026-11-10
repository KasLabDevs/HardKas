---
title: ZK L1 Proof Verification & Toccata Script Building
description: Practical guide to checking Groth16 proofs against an anchored verification key, verifying RISC Zero receipts locally, and building Kaspa Toccata OpZkPrecompile scripts with HardKAS.
sidebar_label: ZK L1 Verification & Scripts
sidebar_position: 4
---

# ZK L1 Proof Verification & Toccata Script Building

HardKAS provides experimental, local-only CLI and SDK tooling for Zero-Knowledge proofs that target Kaspa Layer 1 (`OpZkPrecompile`, `0xa6`). Nothing here signs or broadcasts a transaction, and nothing here is an on-chain claim: a local result never predicts what a node will accept. On-chain acceptance is shown only by the simnet suites against a real rusty-kaspad v2.1.0.

HardKAS keeps three things apart: **fixture coherence** (self-attested digests), the **Groth16 pairing check** (snarkjs over BN254, trusted only for an anchored key), and **Toccata script construction** (kaspa-wasm `ZkScriptBuilder`).

---

## 1. Groth16 Pairing Check (`verify-math`)

The path is a fixture directory with `manifest.json`, `proof.json`, `public-inputs.json` and `verification-key.json` (see `fixtures/toccata-v2/zk/groth16-multiplier`):

```bash
hardkas zk proof verify-math fixtures/toccata-v2/zk/groth16-multiplier --json
```

That fixture is a **toy with a known trapdoor**: by default it is refused (`ZK_GROTH16_MATH_REJECTED`, `ZK_VERIFICATION_KEY_WEAK_TRAPDOOR`). `--allow-weak-vk` runs the pairing anyway, for testing the verifier only; a proof against such a key proves nothing.

### Anchor the verification key

`ZK_GROTH16_MATH_VERIFIED` is returned only when the key is **anchored**: pinned by you with `--expect-vk-hash` (the key's `summary.verificationKeyFingerprint`, or its legacy digest, obtained from a source you trust) or pinned in code (`PINNED_GROTH16_VERIFICATION_KEYS`). A passing pairing against any other key is `ZK_GROTH16_MATH_VALID_UNANCHORED_VK` with `ok: false` and exit 1: the proof is consistent with that key, whose maker may know its trapdoor.

```bash
hardkas zk proof verify-math ./my-fixture --expect-vk-hash <64-hex fingerprint> --timeout 10000 --json
```

Non-canonical encodings, off-curve points and G2 points outside the subgroup are rejected before snarkjs. The weak-key check recognises an uncontributed setup (and keys pinned as toys); it detects accidents and is **not** a security boundary. The fixture-coherence binding is self-attested (`FIXTURE_COHERENCE_SELF_ATTESTED`); `--math-only` skips it and labels the result `MATH_ONLY`.

### Using the TypeScript SDK (`@hardkas/sdk`)

```typescript
import { verifyZkProofMath, inspectZkProof } from '@hardkas/sdk';

// 1. Inspect proof metadata and canonical digests
const inspection = await inspectZkProof('./fixtures/toccata-v2/zk/groth16-multiplier', process.cwd());

// 2. Pairing check, bound to the fixture's (self-attested) content hashes, against an anchored key
const verification = await verifyZkProofMath('./my-fixture', process.cwd(), {
  timeoutMs: 10_000,
  expectedVerificationKeyHash: '<64-hex fingerprint from a trusted source>',
  mathOnly: false,
  allowWeakVerificationKey: false,
});

if (verification.status !== 'ZK_GROTH16_MATH_VERIFIED') {
  throw new Error(`ZK verification failed: ${verification.status} ${JSON.stringify(verification.issues)}`);
}
```

---

## 2. Verifying a RISC Zero Groth16 Receipt (`verify-receipt`)

```bash
hardkas zk toccata verify-receipt \
  --image-id 75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0 \
  --journal-hash 5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456 \
  --receipt fixtures/toccata-v2/zk/r0-groth16-official/receipt.hex \
  --json
```

The receipt is checked with snarkjs against the pinned official RISC Zero verifying key, control root and BN254 control id, for the claim of `(imageId, journalHash)`. SDK: `verifyR0Groth16ReceiptLocal({ imageId, journalHash, receiptHex, timeoutMs })` returns `status: "ZK_R0_GROTH16_RECEIPT_VERIFIED"` on success. Only that result sets a ZK fact's `verifiedOffChain`. The vector above is the public one from kaspa-python-sdk: anyone can spend a lock built for it, so HardKAS returns only its simnet address.

---

## 3. Inspecting the Toccata `OpZkPrecompile` Rules

```bash
hardkas zk toccata rules --json
```

Or programmatically:

```typescript
import { getToccataPrecompileRules } from '@hardkas/sdk';

const rules = getToccataPrecompileRules();
console.log(rules.opcode);                          // "0xa6" (OpZkPrecompile)
console.log(rules.tag);                             // "0x20" (Groth16)
console.log(rules.groth16PrecompileCostGrams);      // 140000 (= 14,000,000 script units)
console.log(rules.groth16VkElementCostScriptUnits); // 250000 per verifying-key element
console.log(rules.minimumR0Groth16ComputeBudget);   // 1550 (RISC Zero wrapper, 6 key elements)
console.log(rules.recommendedComputeBudget);        // 1600
console.log(rules.authorizationModel);              // "IMAGE_ID_ONLY" (the default lock)
```

A compute budget below the minimum makes the node reject the spend; one whose compute mass exceeds the 500,000 block limit is refused by HardKAS.

---

## 4. Building Toccata L1 ZK Scripts (`build-scripts`)

`build-scripts` calls kaspa-wasm's `ZkScriptBuilder` and returns the P2SH redeem script, the signature script and the simnet address. The receipt's claim is cross-checked against `(imageId, journalHash)` (`receiptClaimCrossCheck: "MATCH"`); a mismatch is refused. Choose the lock's authorization model with `--mode`.

### `proof-only` (default): `IMAGE_ID_ONLY`

```bash
hardkas zk toccata build-scripts \
  --image-id 75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0 \
  --journal-hash 5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456 \
  --receipt fixtures/toccata-v2/zk/r0-groth16-official/receipt.hex \
  --json
```

The lock binds the image id only: **anyone holding a valid receipt of that program spends** every UTXO at the address, to outputs of their choosing, on any network; a spend seen in the mempool can be replayed or front-run. Every result carries the warning `ZK_LOCK_BINDS_IMAGE_ID_ONLY`. A testnet-10 address needs `--address-network testnet-10` plus `--ack-image-id-only-lock`, and is never returned for a public test vector. Mainnet, in any spelling (or a bound payout or change address of mainnet), is refused while mainnet is locked down: `MAINNET_SIGNING_DISABLED`, with no address and no signature script, because the signature script is the authorization of the spend.

### `proof-and-output-bound`: `IMAGE_ID_AND_OUTPUTS`

```bash
hardkas zk toccata build-scripts \
  --image-id <64-hex image id> --journal-hash <64-hex journal hash> --receipt ./receipt.hex \
  --mode proof-and-output-bound \
  --payout-address <kaspasim:...> --payout-amount 100000000 \
  --max-fee 50000000 \
  --json
```

After the Groth16 verifier, the redeem script checks by output introspection:

- the output count, and the payout's script public key (as `OpTxOutputSpk` pushes it: version, then script) and amount; the same for the change output when `--change-address`/`--change-amount` are given;
- exactly **one input** (`OpTxInputCount`), so several UTXOs of the lock cannot be merged into one spend and burnt as fee;
- an input of **at most** the bound outputs plus `maxFeeSompi` (`OpTxInputAmount`); a larger deposit stays locked.

Anyone with a valid receipt can trigger the spend, but only to those outputs; whatever the UTXO holds beyond them is the fee. Fund the lock with the returned `requiredFundingSompi` (bound outputs plus the recommended fee); `maxInputSompi` is the largest UTXO the script accepts. Results carry `ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS` and `consensusEnforced: true` (only for a successful bound build).

What neither mode binds:

- **The spent outpoint.** A redeem script cannot name it: the funding transaction's id commits to its outputs, this P2SH among them. HardKAS refuses such a binding (`ZK_UTXO_BINDING_UNSATISFIABLE`).
- **The journal.** The unlocking script supplies the journal hash and nothing checks it on-chain. `createZkOutputBindingJournal` (the `HKZ1` layout: script public key digest, amount, outpoint digest, nonce) is an **off-chain convention**; its fields mean something only if the guest program enforces them.

### Programmatic Script Construction in TypeScript

```typescript
import { buildR0Groth16Scripts } from '@hardkas/sdk';

const scripts = buildR0Groth16Scripts({
  imageId: '<64-hex image id>',
  journalHash: '<64-hex journal hash>',
  receiptHex: '<r0-groth16-receipt-hex>',
  bindingPolicy: {
    mode: 'proof-and-output-bound',
    payout: { address: '<kaspasim:...>', amountSompi: 100_000_000n },
    maxFeeSompi: 50_000_000n,
  },
});

if (scripts.ok) {
  console.log('Authorization:', scripts.authorizationModel);    // "IMAGE_ID_AND_OUTPUTS"
  console.log('Redeem script:', scripts.redeemScript);
  console.log('P2SH script public key:', scripts.p2shScriptPublicKey.script);
  console.log('Signature script:', scripts.sigScript);
  console.log('P2SH address (simnet):', scripts.p2shAddresses.simnet);
  console.log('Fund with (sompi):', scripts.requiredFundingSompi);
} else {
  console.error(scripts.issues);
}
```

`buildR0Groth16Transaction({ scripts, utxo, destinationAddress, networkId })` builds the version-1 spend (compute budget 1600 by default, fee capped by `feeOptions.maxFeeSompi`). A ZK spend needs no signature: the signature script is its authorization, so the built transaction is complete. For that reason `buildR0Groth16Transaction` and `buildR0Groth16Plan` refuse mainnet (any spelling) with `MAINNET_SIGNING_DISABLED`, before anything is read (MAINNET TOTAL LOCKDOWN).

### Checking a lock before funding it (`verify-scripts`)

```bash
hardkas zk toccata verify-scripts --redeem-script <hex> --sig-script <hex> \
  --image-id <64-hex image id> --expected-mode proof-and-output-bound \
  --expected-payout-address <kaspasim:...> --expected-payout-amount 100000000 \
  --expected-change-address <kaspasim:...> --expected-change-amount 15000000 \
  --json
```

`verify-scripts` does not trust what the script appears to contain:

- **Pinned verifier.** The verifying key handed to `OpZkPrecompile` must be the pinned RISC Zero key (`verifyingKeyPinned`), and the script must push the pinned control root and BN254 control id (`controlRootPinned`, `controlIdPinned`). A lock over another key is refused (`ZK_VERIFYING_KEY_NOT_PINNED`) even when it pushes the right image id: whoever knows that key's trapdoor forges receipts.
- **Byte-exact reconstruction.** The image id, and in output-bound mode the payout, the change and the input limit, are read back from the script, which is then rebuilt with the same builders as `build-scripts` and compared byte for byte (`redeemScriptCanonical`). Only an identical output-bound lock gets `consensusEnforced: true` and the `enforces*` / `bound*` fields (`boundPayoutSpk`, `boundChangeSpk`, `boundMaxInputSompi`, …). Anything else is `ZK_REDEEM_SCRIPT_NOT_CANONICAL`, and nothing is inferred from the presence of introspection opcodes.
- **Expected outputs** are compared with what the lock binds (`ZK_BOUND_PAYOUT_*`, `ZK_BOUND_CHANGE_*`); asked of a lock that binds none, they are `ZK_EXPECTED_BINDING_NOT_ENFORCED`.

---

## 5. Verifying a Complete ZK Corpus in CI

To check every positive and adversarial ZK fixture of a corpus:

```bash
hardkas zk corpus verify fixtures/toccata-v2/zk --json
```

---

## Related Documentation

- [ZK Primitives & Sequencing](../concepts/toccata/zk-and-sequencing.md)
- [Testing Kaspa Covenants with HardKAS](./testing-kaspa-covenants.md)
- [`hardkas zk` CLI Reference](../reference/cli/zk.md)
