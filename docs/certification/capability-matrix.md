# Certification Capability Matrix

HardKAS undergoes a rigorous 12-Phase No-Regression Gauntlet prior to release. This matrix documents the functional capabilities that are mathematically and practically validated during this certification process. 

This is not a version history. This documents the established, guaranteed capabilities of the current system architecture.

---

### Capability: Real Node Transaction Lifecycle
**Status:** Validated

**Description:** The complete integration between HardKAS and a live Kaspa instance (`rusty-kaspad`).

**Coverage:**
- ✓ **RPC Connection:** Establishes resilient connections to JSON-RPC endpoints.
- ✓ **UTXO Discovery:** Accurate retrieval of spendable outputs.
- ✓ **Transaction Planning:** Deterministic construction of valid `txPlan` artifacts from live UTXOs.
- ✓ **Signing:** WASM-based generation of sighashes and signatures matching node consensus rules.
- ✓ **Broadcast:** Direct hex payload submission via `submitTransaction`.
- ✓ **Confirmation Polling:** Monitoring network state until the node acknowledges block inclusion.
- ✓ **Receipt Generation:** Final extraction of `txId` into an immutable receipt artifact.

---

### Capability: Large Wallet Handling
**Status:** Validated

**Description:** Ensuring stability and predictability for accounts containing thousands of UTXOs (e.g., heavily utilized mining wallets).

**Coverage:**
- ✓ **Thousands of UTXOs:** Successfully discovering and indexing 5,000+ UTXOs without timing out the node connection.
- ✓ **Controlled Input Selection:** Implementing a largest-first search algorithm to ensure a standard transaction does not exceed Kaspa network mass limits, preventing transaction rejection.
- ✓ **Signing Protection:** Passing only the required subset of UTXOs to the WASM signer to prevent Out-Of-Memory (OOM) V8 crashes.
- ✓ **Consolidation:** The `accounts consolidate` engine effectively batches small UTXOs into blocks, paying fees appropriately, and recursively sweeping dust.

---

### Capability: Artifact Security
**Status:** Validated

**Description:** The cryptographic immutability of the artifact chain (`txPlan` -> `signedTx` -> `receipt`).

**Coverage:**
- ✓ **Mutation Detection:** Any manipulation of financial or routing data within an artifact's JSON payload results in a hash mismatch, halting execution.
- ✓ **Hash Validation:** Rigorous verification of SHA-256 constraints across lineage pointers.
- ✓ **Lineage Integrity:** Recursive assertion that the final receipt correctly maps back through the signed payload to the original plan.
- ✓ **Replay Logic:** The ability to replay a historical lineage entirely offline without Kaspa Node interaction.

---

### Capability: Signer Safety
**Status:** Validated

**Description:** Isolating the highly sensitive private key operations from the rest of the ecosystem.

**Coverage:**
- ✓ **Key Validation:** Strict rejection of poorly formatted or unauthorized key material before invoking WASM.
- ✓ **Serialization Boundary:** Ensuring that private keys exist as transient primitive strings during transport and are never leaked as lingering memory references.
- ✓ **Malformed Input Rejection:** Safely rejecting invalid destination addresses, non-existent source accounts, and unsupported transaction formats.

---

### Capability: Full CLI Surface
**Status:** Validated

**Description:** Ensuring that the `@hardkas/cli` acts as a robust, user-friendly orchestrator for the SDK.

**Coverage:**
- ✓ **Dev Environment:** Features like `dev tx generate` and `dev fixture generate` function deterministically.
- ✓ **Telemetry & Health:** The `doctor` and `telemetry` subcommands successfully audit the local environment and index databases.
- ✓ **Safe Command Execution:** Every command properly handles `--help` routing and gracefully outputs errors rather than throwing unhandled exceptions.

---

### Capability: React / Client Boundary
**Status:** Validated

**Description:** Guaranteeing that the core logic can be consumed in modern browser-based frontend contexts.

**Coverage:**
- ✓ **Vite Bundling:** The `@hardkas/sdk` and `@hardkas/client` packages successfully compile via Vite without crashing due to unsupported Node.js native modules (`fs`, `crypto`, etc.).
- ✓ **Provider Injection:** `HardkasProvider` initializes correctly in the DOM.
- ✓ **Isomorphic Execution:** Planning and artifact creation can happen exclusively in the browser context.
