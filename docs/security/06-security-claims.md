# Security Claims Matrix

HardKAS enforces **Zero-Trust Artifact Validation** at its core. If you pass a JSON payload to `tx.simulate()`, `tx.send()`, `tx.sign()`, or `replay.verify()`, the SDK dynamically recalculates the canonical hash and compares it against the self-declared `contentHash`.

This means HardKAS mathematically protects against various vectors, but explicitly does NOT protect against operational security failures outside the SDK.

## What is Protected?

| Scenario | Protected? | Explanation |
| :--- | :--- | :--- |
| **Modify signed amount** | ✅ YES | Any change to the amount alters the canonical serialization, causing a hash mismatch (`HASH_MISMATCH` error) during SDK validation. |
| **Modify recipient** | ✅ YES | Any change to the recipient address alters the canonical hash and immediately invalidates the object. |
| **Mutate artifact JSON** | ✅ YES | Adding, removing, or reordering JSON keys maliciously is protected by deterministic sorting and normalization. |
| **Replay inconsistency** | ✅ YES | The Replay Engine verifies that a previously emitted receipt mathematically perfectly matches current execution semantics. |
| **Unicode poison** | ✅ YES | The SDK enforces strict UTF-8 normalization before hashing, preventing visually identical but byte-different strings from creating hash collisions. |
| **Prototype pollution** | ✅ YES | Core logic parses raw objects safely, discarding prototype chains when validating artifacts. |

## What is NOT Protected?

| Scenario | Protected? | Explanation |
| :--- | :--- | :--- |
| **Stolen private key** | ❌ NO | If an attacker steals your keystore or private key, they can sign valid artifacts. HardKAS cannot detect compromised keys. |
| **Malicious NPM dependency** | ❌ NO | If your codebase imports a malicious package that exfiltrates keys or patches `Math.random`, HardKAS cannot sandbox Node.js. |
| **User signing bad inputs** | ❌ NO | If you programmatically tell the SDK to plan and sign a transaction to an attacker's address, HardKAS will dutifully execute it. |
| **Consensus failure** | ❌ NO | HardKAS simulates execution locally. If the real Kaspa network undergoes a 51% attack or consensus failure, local determinism is unaffected but the network state is compromised. |
