# Why HardKAS is Designed This Way

HardKAS breaks away from the traditional, monolithic approach to cryptocurrency wallet architecture. This document explains _why_ the transaction lifecycle is heavily segmented and relies on file-system artifacts.

## The Standard Approach vs HardKAS

### A Normal Wallet Flow

In a typical wallet or SDK, the process is opaque and happens entirely in memory:

1. \`create tx\` (fetches UTXOs, builds payload)
2. \`sign\` (injects keys, hashes, signs)
3. \`send\` (broadcasts to network)

If something goes wrong (e.g., the node rejects it, the signature is invalid, or the memory crashes), you have very little diagnostic information. The state is lost.

### The HardKAS Flow

HardKAS forces the pipeline to halt and checkpoint at every critical boundary:

1. \`plan\`
   ↓
   _artifact checkpoint (txPlan.json)_
   ↓
2. \`verify\`
   ↓
3. \`sign\`
   ↓
   _artifact checkpoint (signedTx.json)_
   ↓
4. \`send\`
   ↓
   _artifact checkpoint (receipt.json)_
   ↓
5. \`lineage verification\`

## The "Why" Behind the Design

### 1. Reproducibility and Debugging

If a transaction fails on a live Kaspa node, you do not have to guess what payload the planner generated. You have the exact \`txPlan.json\` artifact on disk. You can replay the exact UTXO selection logic, share the plan with another developer, or feed it into a simulated provider to debug the semantic structure without risking real funds.

### 2. Auditing (The Signer Does Not Own Planning)

In a standard wallet, the module that holds your private keys also decides which UTXOs to spend and where to send the change.
In HardKAS, **planning and signing are isolated**. The Planner generates a deterministic JSON payload. The Signer _only_ consumes that payload. This allows an independent auditor, a CI/CD pipeline, or a human user to run \`artifact inspect\` and verify the exact financial destination _before_ the private key is ever decrypted.

### 3. Security (WASM Objects Never Cross Boundaries)

Kaspa relies on a WASM module for cryptographic operations. WASM memory management is manual and pointer-based. If a \`PrivateKey\` object is instantiated and passed around your application (e.g., from a background thread to a UI thread), a \`\_\_wbg_ptr\` leak can occur, exposing memory or causing Out-Of-Bounds crashes.
HardKAS ensures that keys only exist as transient string primitives. They are pushed into the WASM context for the exact millisecond of the signature, and then immediately freed.

### 4. Stability (UTXO Selection Happens Before Signing)

Kaspa transactions have a maximum mass. If a mining wallet has 50,000 UTXOs, loading all of them into a signing context will cause a Node.js V8 Out-of-Memory crash. HardKAS's Planner strictly enforces a largest-first selection limit. By the time the payload reaches the Signer, it is guaranteed to be within safe memory and network mass limits.
