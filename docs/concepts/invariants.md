# HardKAS Architectural Invariants

Invariants are absolute rules that govern the internal operation of HardKAS. These rules define the boundaries of the system. Future code modifications, extensions, or optimizations **must never break these invariants**. If an invariant is broken, the security or deterministic execution of HardKAS is compromised.

## 1. Artifact Invariant

**Rule:** Changing any meaningful transaction field after creation must invalidate verification.

### Explanation
An artifact is the source of truth for a stage in the transaction lifecycle.
- When `sdk.tx.plan` creates a `txPlan` artifact, its cryptographic ID is generated based on its precise data structure.
- When a signer signs the artifact, it outputs a `signedTx` artifact that embeds a hash of the original plan (`sourcePlanId`).
- The `artifact verify` process ensures that the hash matches the file contents exactly.
- Modifications to core fields (e.g., `amountSompi`, `to.address`, `networkId`, `signedTransaction.payload`) alter the canonical hash and thus invalidate the lineage.

> [!CAUTION]
> Metadata fields such as `hardkasVersion` and `schemaVersion` are excluded from the hash to allow forward-compatibility when tools are updated. Developers must never exclude domain/financial data from the hashing algorithm.

## 2. Signer Invariant

**Rule:** Only validated, portable key material can enter the signer. Private keys never cross serialization boundaries as runtime WASM objects.

### Explanation
The Kaspa WebAssembly module (`kaspa-wasm`) instantiates memory buffers for Private Key objects. Passing raw WASM memory pointers (`__wbg_ptr`) across process boundaries (like from a background wallet daemon to an active React thread) is catastrophic and insecure.

HardKAS isolates this. Keys are decrypted into a strictly typed Javascript `String` or `Buffer` (the "portable material"). The signer validates this string format *before* instantiating the WASM `PrivateKey` object locally, securely signing the deterministic artifact, and then immediately clearing the WASM object from memory.

## 3. Provider Invariant

**Rule:** The system must strictly distinguish between Mock (Simulated) execution and Real network execution. 

### Explanation
Providers fetch UTXOs and broadcast transactions.
- A simulated provider pulls from `.hardkas/localnet.json`.
- A real provider pulls from an RPC endpoint.
If a simulated artifact is submitted to a real node, the Node will reject it, but more importantly, HardKAS strictly validates the `networkId` on the artifact before the RPC layer is even invoked. This prevents accidental execution of mainnet transactions on testnets or vice versa.

## 4. Network Invariant

**Rule:** A transaction artifact must belong to exactly one network context, and that context cannot be mutated post-planning.

### Explanation
Kaspa's sighash (Signature Hash) algorithm is heavily dependent on the subnetwork and network context (e.g., `kaspa-mainnet` vs `kaspa-testnet-10`). HardKAS bakes the `networkId` into the root of the `txPlan` artifact. A client cannot generate a plan on testnet, change the `networkId` string, and expect the signature to be valid on mainnet. The network is permanently bound to the artifact lineage.

## 5. UTXO Invariant

**Rule:** Wallet size and signing payload size are separate concerns.

### Explanation
A wallet may contain 50,000 UTXOs (e.g., a mining wallet). However, Kaspa transactions have a maximum mass (size in bytes). HardKAS must never load 50,000 UTXOs into memory during the signing phase. 

The **Planner** queries the provider, implements largest-first selection, and constructs a deterministic `txPlan` containing *only* the specific UTXOs required for the transaction. The **Signer** only receives this minimal payload. This strict separation protects the execution layer from Out-of-Memory (OOM) errors and keeps signing mathematically predictable.

## 6. RPC Invariant

**Rule:** Local validation happens before asking the node whenever possible.

### Explanation
RPC calls are expensive and potentially flaky. HardKAS performs semantic validation, address format checks, artifact mutation checks, and signature formatting verification entirely on the client side *before* executing the `submitTransaction` RPC command. 

If a transaction fails local `verify-semantics`, it must not touch the network. This minimizes unnecessary load on `rusty-kaspad` and provides the user with deterministic, high-quality error messages rather than opaque JSON-RPC timeouts.
