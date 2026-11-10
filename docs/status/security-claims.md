# Security Claims Matrix

HardKAS re-verifies every artifact it is handed. When you pass a JSON payload to `tx.simulate()`, `tx.send()`, `tx.sign()` or `replay.verify()`, the SDK recomputes the canonical hash and compares it with the artifact's own `contentHash`.

That hash is **integrity, not authentication**. It is a SHA-256 of the canonical serialization, with no key and no signature (TX-08). It catches an artifact that was changed without recomputing its hash: a corrupted file, a careless edit, a copy that drifted. Anyone who can write the file can also recompute the hash. A forged artifact with a fresh, correct hash passes this check. What stops a forged *transaction* is the signature, which the node verifies, and the binding of a signed transaction to its plan (below). HardKAS does not protect against operational security failures outside the SDK.

## What is Protected?

| Scenario | Protected? | Explanation |
| :-- | :-- | :-- |
| **Edit an artifact without recomputing its hash** | ✅ YES | Any change to a covered field (amount, recipient, inputs…) changes the canonical serialization: `HASH_MISMATCH` during SDK validation. |
| **Edit an artifact AND recompute its hash** | ⚠️ PARTLY | The hash check passes (the hash has no key). The forgery is caught elsewhere, or not at all. A changed signed transaction no longer matches its signatures, and the node rejects it. A signed transaction that diverges from its plan is refused (`SIGNED_PLAN_MISMATCH`). A real send requires that plan by default (`SEND_PLAN_UNRESOLVED`; see [send routes](send-routes-security.md)). An artifact whose hash version predates the lineage being hashed (v1–v3) is refused by strict verification (`MIGRATION_REQUIRED`). |
| **Mutate artifact JSON (key order, whitespace)** | ✅ YES | The canonical serialization sorts keys and normalizes strings, so equivalent JSON hashes the same. A real change changes the hash. |
| **Replay inconsistency** | ✅ YES (deterministic re-execution) | The Replay Engine re-runs a recorded execution and compares the result with the receipt it emitted. It checks determinism; it proves nothing about the network. |
| **Unicode look-alikes** | ✅ YES | Strings are normalized (NFC, `\r\n` → `\n`) before hashing (canonical hash v3+). Byte-different but canonically equal strings hash the same. |
| **Prototype pollution** | ✅ YES | Only plain objects are serialized: prototype chains are not followed when artifacts are validated. |
| **Path traversal escape** | ✅ YES | Artifact reads, writes and verification paths stay inside the project directory. |

What each public send route checks before a broadcast is listed in [Send routes: what each one checks before a broadcast](send-routes-security.md). This covers the SDK, the CLI, `escrow rescue-v1`, the dev-server and the toolkit wallet.

## What is NOT Protected?

| Scenario | Protected? | Explanation |
| :-- | :-- | :-- |
| **Stolen private key** | ❌ NO | Whoever holds your keystore or private key can sign valid transactions. HardKAS cannot detect compromised keys. |
| **Write access to the workspace** | ❌ NO | `contentHash` has no key, so whoever can write the artifact store can write artifacts that verify. Keystores (format 2.1.0) do authenticate their own metadata with AES-GCM. Artifacts are not signed. |
| **Malicious NPM dependency** | ❌ NO | If your codebase imports a malicious package that exfiltrates keys or patches `Math.random`, HardKAS cannot sandbox Node.js. |
| **User signing bad inputs** | ❌ NO | If you programmatically tell the SDK to plan and sign a transaction to an attacker's address, HardKAS executes it. |
| **Consensus failure** | ❌ NO | HardKAS simulates execution locally. A 51% attack or a consensus failure on the real network is outside what local determinism can see. |
