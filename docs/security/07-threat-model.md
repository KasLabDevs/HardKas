# Threat Model

The HardKAS threat model focuses heavily on state mutation vulnerabilities and integrity validation. We assume the host OS is largely trusted, but we do not trust the data being processed.

## 1. Zero-Trust Boundary

The primary attack surface we defend against is corrupted or maliciously tampered JSON files residing on disk or passed through the network.
Our Zero-Trust Artifact Validation mathematically recalculates every `contentHash` in memory. This means if a process external to HardKAS edits an artifact (e.g., changes an `amount`), our core pipeline (`tx.simulate`, `tx.send`, `tx.sign`) will immediately throw a `HASH_MISMATCH` exception.

## 2. Path Traversal & File Sandbox

HardKAS restricts all file reading/writing to the `.hardkas/` workspace directory.
Attempting to create artifacts with `../` sequences or querying external files is strictly blocked by the internal `artifacts.read` layer, mitigating sandbox escape attempts.

## 3. Cryptographic Authorization Bypass

HardKAS strictly validates signature boundaries. If an attacker possesses Alice's key but attempts to sign a transaction originating from Bob, `tx.sign()` throws an explicit error ensuring that only the authorized identity can fulfill the intent.

## 4. Dependencies

HardKAS currently runs in standard Node.js. If a malicious NPM package is installed in your project, it runs with full access to your environment variables and filesystem. HardKAS does not implement kernel-level virtualization; secure your `package.json`.
