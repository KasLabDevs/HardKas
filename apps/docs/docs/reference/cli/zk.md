---
title: hardkas zk
---

# `hardkas zk`

## `hardkas zk capabilities`

### Synopsis (Generated)

**Purpose:** Show experimental ZK lab capabilities

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas zk proof inspect`

### Synopsis (Generated)

**Purpose:** Inspect a local proof fixture or artifact

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas zk proof verify`

### Synopsis (Generated)

**Purpose:** Verify local fixture coherence for a proof artifact (No cryptographic proof or on-chain claims) alpha

**Aliases:** `verify-local`

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas zk proof verify-math`

### Synopsis (Generated)

**Purpose:** Groth16 pairing check (snarkjs, BN254; snarkjs is an optional peer of @hardkas/sdk, without it ZK_ENGINE_UNAVAILABLE) of a fixture; VERIFIED only for a pinned verification key (--expect-vk-hash or the in-code registry), otherwise VALID_UNANCHORED_VK; fixture coherence is self-attested (No on-chain claims) alpha

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON
- `--timeout &lt;ms&gt;` (Default: `10000`): Verification timeout in milliseconds (integer, 1..600000)
- `--expect-vk-hash &lt;sha256&gt;`: Pin the verification key: its fingerprint (summary.verificationKeyFingerprint) or legacy digest, obtained from a source you trust
- `--math-only` (Default: `false`): Skip the self-attested fixture-coherence check; the result is labelled MATH_ONLY
- `--allow-weak-vk` (Default: `false`): Accept a verification key with a known trapdoor (toy fixtures only; proofs against such keys prove nothing)

---

## `hardkas zk corpus verify`

### Synopsis (Generated)

**Purpose:** Verify a local ZK corpus (coherence of every listed fixture; pairing check where a fixture claims it, which needs the optional peer snarkjs)

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas zk toccata rules`

### Synopsis (Generated)

**Purpose:** Show the Kaspa Toccata L1 Groth16 precompile facts HardKAS relies on (opcode, tag, costs, compute budget)

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas zk toccata build-scripts`

### Synopsis (Generated)

**Purpose:** Build P2SH redeem and signature scripts for a RISC Zero Groth16 receipt (the receipt's claim is cross-checked against imageId/journalHash). Modes: proof-only (default; the lock binds the image id only: any holder of a valid receipt spends) or proof-and-output-bound (the redeem script also enforces the payout/change outputs by introspection). Simnet address only unless public networks are requested (proof-only also needs the acknowledgement)

#### Options

- `--image-id &lt;hex&gt;`: 32-byte hex Image ID
- `--journal-hash &lt;hex&gt;`: 32-byte hex Journal Hash
- `--receipt &lt;pathOrHex&gt;`: Path to receipt file (.hex) or raw receipt hex string
- `--mode &lt;mode&gt;` (Default: `proof-only`): Binding mode: 'proof-only' (unbound outputs) or 'proof-and-output-bound' (consensus output introspection)
- `--payout-address &lt;address&gt;`: Consensus-bound recipient address (required if mode is proof-and-output-bound)
- `--payout-amount &lt;sompi&gt;`: Consensus-bound payout amount in sompi (required if mode is proof-and-output-bound)
- `--change-address &lt;address&gt;`: Optional consensus-bound change address
- `--change-amount &lt;sompi&gt;`: Optional consensus-bound change amount in sompi
- `--max-fee &lt;sompi&gt;`: proof-and-output-bound: the most the lock may pay as fee; a UTXO above the bound outputs plus this stays locked (default 50000000)
- `--address-network &lt;networks&gt;`: Also return the P2SH address for testnet-10; proof-only needs --ack-image-id-only-lock; never for a public test vector. mainnet (any spelling) is refused while mainnet is locked down (MAINNET_SIGNING_DISABLED): nothing is built
- `--ack-image-id-only-lock` (Default: `false`): Acknowledge that a proof-only lock binds only the image id (anyone with a valid receipt can spend, replay or front-run)
- `--json` (Default: `false`): Output as JSON

### Semantic Contract (Curated)

- **Environments:** Local (kaspa-wasm ZkScriptBuilder); simnet address always, testnet-10/mainnet only on request
- **Reads:** RISC Zero Groth16 receipt (file or hex)
- **Evidence Semantics:** Scripts built and parsed, and the receipt's claim matches (imageId, journalHash). Nothing is signed or broadcast; on-chain acceptance is shown only by the simnet suites.

#### Known Limitations
- proof-only (default) is IMAGE_ID_ONLY: any holder of a valid receipt of the program spends every UTXO at the address, to any outputs, on any network (replay and front-running by design).
- proof-and-output-bound is IMAGE_ID_AND_OUTPUTS: output count, payout/change script public key and amount by introspection, exactly one input, and an input of at most the bound outputs plus --max-fee. Fund it with requiredFundingSompi.
- Neither mode binds the spent outpoint (circular: the funding transaction's id commits to the P2SH; refused as ZK_UTXO_BINDING_UNSATISFIABLE) or the journal (supplied by the unlocking script; the HKZ1 layout is an off-chain convention).

#### Related
- Concept: /concepts/toccata/zk-and-sequencing.md
- Guide: /guides/zk-l1-verification-and-settlement.md

---

## `hardkas zk toccata verify-receipt`

### Synopsis (Generated)

**Purpose:** Verify a RISC Zero Groth16 receipt locally (snarkjs, BN254; without the optional peer snarkjs, ZK_ENGINE_UNAVAILABLE) against the pinned official RISC Zero verifying key, control root and BN254 control id, for the claim of (imageId, journalHash) (No on-chain claims) alpha

#### Options

- `--image-id &lt;hex&gt;`: 32-byte hex Image ID
- `--journal-hash &lt;hex&gt;`: 32-byte hex Journal Hash
- `--receipt &lt;pathOrHex&gt;`: Path to receipt file (.hex) or raw receipt hex string
- `--timeout &lt;ms&gt;` (Default: `10000`): Verification timeout in milliseconds (integer, 1..600000)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas zk toccata verify-scripts`

### Synopsis (Generated)

**Purpose:** Verify Toccata P2SH scripts: the pinned RISC Zero verifying key, control root and control id, and a redeem script byte-identical to the one HardKAS builds for the parameters it carries; consensusEnforced only for such an output-bound lock (payout, change, one input, input limit), never from the presence of opcodes

#### Options

- `--redeem-script &lt;hex&gt;`: Redeem script hex
- `--sig-script &lt;hex&gt;`: Signature script hex
- `--image-id &lt;hex&gt;`: Expected 32-byte hex Image ID
- `--journal-hash &lt;hex&gt;`: Expected 32-byte hex Journal Hash
- `--expected-mode &lt;mode&gt;`: Expected binding mode ('proof-only' or 'proof-and-output-bound')
- `--expected-payout-address &lt;address&gt;`: Expected consensus-bound payout address
- `--expected-payout-amount &lt;sompi&gt;`: Expected consensus-bound payout amount in sompi
- `--expected-change-address &lt;address&gt;`: Expected consensus-bound change address (output 1)
- `--expected-change-amount &lt;sompi&gt;`: Expected consensus-bound change amount in sompi
- `--json` (Default: `false`): Output as JSON

### Semantic Contract (Curated)

- **Environments:** Local (kaspa-wasm ZkScriptBuilder, to rebuild the lock); no node is contacted
- **Reads:** Redeem and signature scripts (hex)
- **Evidence Semantics:** The lock uses the pinned RISC Zero verifying key, control root and control id, and its redeem script is byte-identical to the one build-scripts makes for the parameters it carries. consensusEnforced: true only for such an output-bound lock. The scripts are not executed; on-chain acceptance is shown only by the simnet suites.

#### Known Limitations
- A lock HardKAS cannot rebuild byte for byte (another builder, other opcodes, another encoding) is ZK_REDEEM_SCRIPT_NOT_CANONICAL: no claim is made about it, even when it may be sound.
- Expected outputs asked of a lock that binds none (proof-only) are ZK_EXPECTED_BINDING_NOT_ENFORCED, never satisfied vacuously.

#### Related
- Concept: /concepts/toccata/zk-and-sequencing.md
- Guide: /guides/zk-l1-verification-and-settlement.md

---

