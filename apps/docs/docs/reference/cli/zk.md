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

**Purpose:** Groth16 pairing check (snarkjs, BN254) of a fixture, bound to its content hashes by default; reports the key, inputs and proof digests it used (No on-chain claims) alpha

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON
- `--timeout &lt;ms&gt;` (Default: `10000`): Verification timeout in milliseconds (integer, 1..600000)
- `--expect-vk-hash &lt;sha256&gt;`: Reject unless the verification key's domain digest equals this value
- `--math-only` (Default: `false`): Skip the fixture-coherence binding; the result is labelled MATH_ONLY
- `--allow-weak-vk` (Default: `false`): Accept a verification key with a known trapdoor (toy fixtures only; proofs against such keys prove nothing)

---

## `hardkas zk corpus verify`

### Synopsis (Generated)

**Purpose:** Verify a local ZK corpus (coherence of every listed fixture; pairing check where a fixture claims it)

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

**Purpose:** Build P2SH redeem and signature scripts for a RISC Zero Groth16 proof set (imageId/journalHash are not cross-checked against the receipt)

#### Options

- `--image-id &lt;hex&gt;`: 32-byte hex Image ID
- `--journal-hash &lt;hex&gt;`: 32-byte hex Journal Hash
- `--receipt &lt;pathOrHex&gt;`: Path to receipt file (.hex) or raw receipt hex string
- `--json` (Default: `false`): Output as JSON

---

