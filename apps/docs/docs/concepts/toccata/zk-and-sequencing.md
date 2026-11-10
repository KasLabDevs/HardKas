# ZK Primitives & Sequencing

> **L1:** Toccata (rusty-kaspa v2.1.0) adds `OpZkPrecompile` and `OpChainblockSeqCommit` to Kaspa Script. **HardKAS tooling (experimental, local-only):** Groth16 pairing checks, local RISC Zero receipt verification, and Toccata script/transaction builders. HardKAS never signs or broadcasts a ZK spend; on-chain acceptance is shown only by its simnet suites against a real rusty-kaspad v2.1.0.

While Covenants allow L1 state machines, computationally intensive applications (such as privacy pools, batch rollups, or order books) require off-chain execution paired with Layer 1 verification and settlement.

Toccata introduces the script primitives a node uses to verify Zero-Knowledge proofs and to read sequencing commitments during UTXO script validation.

---

## 1. `OpZkPrecompile` (`0xa6`)

`OpZkPrecompile` (`0xa6`) is a Kaspa Script opcode that verifies a tagged ZK proof from the script stack. The facts below are the ones HardKAS relies on, cross-checked against rusty-kaspa v2.1.0 (`crypto/txscript/src/opcodes/mod.rs`, `zk_precompiles/tags.rs`, `zk_precompiles/groth16/mod.rs`).

| Parameter | Value | Notes |
| :--- | :--- | :--- |
| **Opcode** | `0xa6` (`OpZkPrecompile`) | Right after a 1-byte push of the tag; the last opcode of a proof-only R0 redeem script |
| **Tag `0x20`** | Groth16 (BN254) | The tag HardKAS uses, for the RISC Zero Groth16 wrapper. `0x21` (R0 Succinct) exists upstream; HardKAS does not build it |
| **Groth16 tag cost** | `140,000` grams = `14,000,000` script units | Charged by the precompile itself |
| **Verifying-key cost** | `250,000` script units per `gamma_abc_g1` (IC) element | On top of the tag cost; the RISC Zero wrapper key has 6 elements |
| **Compute budget** | per version-1 input, `0..65535`; allowance = budget × 10,000 + 9,999 script units | 1 budget unit = 100 grams of compute mass |
| **Minimum budget (R0)** | `1550` | Tag + 6 key elements + the ~2,811 script units the R0 scripts spend before the precompile (observed on simnet). HardKAS defaults to `1600` |
| **Block limit** | `500,000` grams of compute mass | A budget whose compute mass exceeds it is refused |
| **Transaction version** | `1` | Compute budgets are a version-1 input field |
| **Sig-op count** | `0` | The precompile is priced in script units, not sig-ops |

Inspect these values at any time:

```bash
hardkas zk toccata rules --json
```

The command returns `opcode` (`"0xa6"`), `tag` (`"0x20"`), `groth16PrecompileCostGrams` (`140000`), `groth16PrecompileCostScriptUnits`, `groth16VkElementCostScriptUnits` (`250000`), `r0Groth16VkElements` (`6`), `minimumR0Groth16ComputeBudget` (`1550`), `recommendedComputeBudget` (`1600`), `blockComputeMassLimit`, `requiredTransactionVersion`, `sigOpCountRequirement` and `authorizationModel`, among others.

---

## 2. Sequencing commitments (`OpChainblockSeqCommit`, `0xd4`)

Toccata also adds `OpChainblockSeqCommit` (`0xd4`): given a chain block hash, a script reads that block's sequencing commitment from the node's chain index (the block must be a selected-chain ancestor within the allowed depth). This is the L1 hook an off-chain application uses to order its state transitions against Kaspa's chain.

HardKAS has **no tooling** for sequencing commitments. The simulator does not model the node's chain index: a script that executes `OpChainblockSeqCommit` (or `OpZkPrecompile`) fails closed there (`SCRIPT_UNSUPPORTED_OPCODE`). Test such scripts on a real node (`hardkas localnet`).

---

## 3. HardKAS ZK Tooling (`hardkas zk` & `@hardkas/sdk`)

All of it is experimental, makes no on-chain claim, and keeps mainnet broadcast blocked by policy.

1. **Fixture coherence (`hardkas zk proof inspect` / `verify` / `corpus verify`):**
   checks that manifests, content hashes, public inputs and key metadata of a local corpus (`fixtures/toccata-v2/zk`) agree. The digests live in the same directory, so this coherence is **self-attested**: it catches accidents and swapped files, never provenance.
2. **Groth16 pairing check (`hardkas zk proof verify-math`):**
   snarkjs over BN254. `ZK_GROTH16_MATH_VERIFIED` only for an **anchored** verification key: pinned by you (`--expect-vk-hash <fingerprint>` from a source you trust) or pinned in code. A passing pairing against any other key is `ZK_GROTH16_MATH_VALID_UNANCHORED_VK` (exit 1). Keys with a known trapdoor (an uncontributed setup) are refused unless `--allow-weak-vk` is passed for toy fixtures; that check detects accidents and is not a security boundary.
3. **RISC Zero receipts (`hardkas zk toccata verify-receipt`):**
   local snarkjs check of a RISC Zero Groth16 receipt against the pinned official RISC Zero verifying key, control root and BN254 control id, for the claim of `(imageId, journalHash)`.
4. **Toccata scripts (`hardkas zk toccata build-scripts` / `verify-scripts`):**
   kaspa-wasm's `ZkScriptBuilder` builds the P2SH redeem script and signature script for a RISC Zero Groth16 receipt; the receipt's claim is cross-checked against `(imageId, journalHash)`. Two authorization models:
   - **`IMAGE_ID_ONLY`** (`--mode proof-only`, the default): the lock binds the image id only. Anyone holding a valid receipt of that program spends every UTXO at the address, to any outputs, on any network; replay and front-running are properties of this upstream design.
   - **`IMAGE_ID_AND_OUTPUTS`** (`--mode proof-and-output-bound`): after the Groth16 verifier, the redeem script checks by output introspection the output count and the payout's (and change's) script public key and amount, requires exactly one input, and refuses an input larger than the bound outputs plus `maxFeeSompi`. Anyone with a valid receipt can trigger the spend, but only to those outputs. Fund the lock with the returned `requiredFundingSompi`.

   Neither model binds the spent outpoint: a redeem script cannot name it, because the funding transaction's id commits to the P2SH itself (HardKAS refuses such a binding). The journal is supplied by the unlocking script and is not checked on-chain; the `HKZ1` journal layout of `createZkOutputBindingJournal` is an off-chain convention that only the guest program can enforce.

   `verify-scripts` accepts a lock only over the pinned RISC Zero verifying key, control root and control id, rebuilds its redeem script from the parameters it carries with the same builders and compares the bytes: `consensusEnforced: true` only for an identical output-bound lock, never from the presence of opcodes. A ZK spend needs no signature, so HardKAS never builds one for mainnet (`MAINNET_SIGNING_DISABLED`).

See the step-by-step walkthrough: **[ZK L1 Verification & Covenant Scripts Guide](../../guides/zk-l1-verification-and-settlement.md)** and the boundaries in `docs/status/limitations.md` §6.
