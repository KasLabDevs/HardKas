# Error Recovery and Diagnostics

HardKAS enforces strict boundaries. When a boundary is violated, it will throw a highly specific error code. This document explains what these errors mean, what causes them, and how to resolve them.

---

## Disaster Recovery Cases

These are historical "war stories" from the HardKAS certification gauntlet that highlight deeper architectural issues.

### Disaster: Kaspa WASM Memory Access Out of Bounds

**Symptom:**
During high-volume signing, Node.js or the browser crashes with a cryptic WebAssembly error: `memory access out of bounds`.

**Wrong Assumption:**
"The `kaspa-wasm` module is broken and cannot sign."

**Actual Historical Cause:**
A corrupted serialized `PrivateKey` object was passed across execution boundaries. A developer attempted to pass the raw Javascript object wrapping the WASM pointer (`__wbg_ptr`) instead of serializing the key into a primitive hex string. Because the WASM memory space was recycled or didn't exist in the target thread, the pointer referenced garbage memory, causing an out-of-bounds crash.

**Detection:**
Inspect the payload being passed to the Signer. If the `privateKey` contains a `__wbg_ptr` property instead of being a plain 64-character string, you are leaking WASM references.

**Resolution:**
Immediately audit your keystore integration. Do not use `JSON.stringify` on raw Kaspa classes. Only extract the primitive hex string before crossing the React/Node boundary, and re-instantiate it on the other side. If the account is permanently corrupted in your local database, regenerate the account from the seed phrase.

---

## Common Errors

### `NETWORK_ADDRESS_MISMATCH`

**Meaning:** 
A transaction artifact is attempting to interact with an address or a provider that belongs to a different Kaspa subnetwork.

**Cause:** 
You generated a `txPlan` while configured for `simulated` or `testnet-10`, and are attempting to broadcast it to a node running `mainnet` (or vice-versa). The Kaspa signature algorithm commits to the subnetwork ID. HardKAS catches this mismatch locally before hitting the RPC endpoint.

**Example:**
Trying to run `hardkas tx send my-testnet-plan.json` when your `hardkas.config.ts` has `network: 'mainnet'`.

**Resolution (User/Environment Bug):**
Ensure that the artifact's serialized `networkId` matches the network context of your active Provider. Re-run `hardkas tx plan` in the correct environment to generate a valid artifact.

---

### `INVALID_PRIVATE_KEY_MATERIAL`

**Meaning:** 
The material provided to the signer cannot be parsed into a valid cryptographic seed or key.

**Cause:** 
The key string provided to `sdk.tx.sign()` or the password provided to the encrypted keystore resulted in malformed bytes. HardKAS validates the shape of the data before ever attempting to instantiate the internal WASM PrivateKey object.

**Example:**
Passing a standard string `"my-secret-password"` instead of a valid hex-encoded Kaspa private key to the signer.

**Resolution (User Bug):**
Verify that you are passing a 64-character hex string or correctly decrypting your keystore file. 

---

### `CORRUPTED_PRIVATE_KEY_SERIALIZATION`

**Meaning:** 
The key material crossed a boundary incorrectly, typically leaking as an opaque WASM memory pointer instead of primitive data.

**Cause:** 
A background process or a previous SDK call attempted to return the actual `kaspa-wasm` PrivateKey object (which contains a `__wbg_ptr` to process-local memory) rather than serializing the primitive string. When the active process attempts to use it, the memory pointer is invalid.

**Example:**
Using a naive JSON serialization to pass key objects between a Node.js daemon and a React frontend.

**Resolution (Environment/Integration Bug):**
Never pass WASM runtime objects across execution boundaries. Ensure that your key management layer only exports encrypted JSON keystores or plaintext primitive hex strings.

---

### `TOO_MANY_INPUTS_FOR_SINGLE_TX`

**Meaning:** 
The transaction requires more UTXOs to fulfill the `amountSompi` than Kaspa's maximum transaction mass allows.

**Cause:** 
The source wallet contains highly fragmented "dust" UTXOs. To send a standard transaction, the Planner must collect thousands of UTXOs to reach the target amount. Constructing this transaction would exceed the byte limit of a Kaspa network block or standard relay rule.

**Example:**
A mining wallet attempting to send 1,000 KAS, but the balance is made up of 10,000 separate 0.1 KAS mining rewards.

**Resolution (User Bug):**
You must consolidate your wallet before sending this transaction. Run `hardkas accounts consolidate --execute --yes` to batch the dust into larger UTXOs. See the [Large Wallet Consolidation](../guides/large-wallet-consolidation.md) guide.

---

### `DEV_ACCOUNT_KEY_UNAVAILABLE`

**Meaning:** 
The system attempted to sign a transaction on behalf of a simulated dev account, but the associated key could not be found in the local configuration.

**Cause:** 
You executed a command like `tx sign` targeting `kaspa:sim_alice`, but your `.hardkas/localnet.json` or `hardkas.config.ts` does not contain the deterministic seed mapping for that account.

**Resolution (Environment Bug):**
Ensure your project has been properly bootstrapped. Run `hardkas dev doctor` or `hardkas dev fixture generate` to populate the default simulated accounts.

---

### `[MALFORMED_ARTIFACT]`

**Meaning:** 
The cryptographic hash of the JSON artifact does not match its `id`, or required structural metadata is missing.

**Cause:** 
The artifact file was manually edited (e.g., someone changed `amountSompi` in a text editor), or the artifact was generated by a buggy mock generator that failed to include the `id` field.

**Resolution (User/Tooling Bug):**
If this is a real transaction: It has been tampered with and the signature is void. Discard it and re-run `tx plan`.
If this occurs during `hardkas doctor` on simulated test data: It is a known technical debt item where mock receipts lack IDs. You can ignore or quarantine the files.
