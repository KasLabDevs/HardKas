# HardKAS Security & Safety Model

## Overview

HardKAS is a developer-centric operating environment for the Kaspa BlockDAG. Its security model is optimized for **developer velocity** and **local simulation**, rather than high-value production custody.

> [!WARNING]
> HardKAS is **NOT** production custody software. High-value mainnet assets should always be managed using hardware-backed core wallets.

## Local Development Safety

### 1. Network-Aware Constraints
To prevent accidental mainnet loss, certain destructive or state-modifying operations are strictly restricted by network type:

| Command | simnet/localnet/dev | testnet-1x | mainnet |
|:---|:---:|:---:|:---:|
| `hardkas faucet` | ✅ Allowed | ❌ Refused | ❌ Refused |
| `hardkas accounts fund` | ✅ Allowed | ❌ Refused | ❌ Refused |
| `hardkas node reset` | ✅ Allowed | ✅ Allowed | ✅ Allowed (Local Data) |
| `hardkas tx sign` | ✅ Allowed | ✅ Allowed | ⚠️ Requires --allow-mainnet-signing |

### 2. The Funding Guard
The `hardkas faucet` and `hardkas accounts fund` commands are hard-coded to only operate on local/simulated networks. They will explicitly refuse to execute if the configured network is `mainnet` or any public `testnet`.

### 3. Mainnet Signing Guard
By default, `hardkas tx sign` will refuse to sign transactions targeting `mainnet` unless the explicit flag `--allow-mainnet-signing` is provided. This acts as a manual circuit breaker for developers.

## Key Management

### Local Encrypted Keystore
HardKAS includes a local encrypted keystore for developer convenience:
- **Encryption**: Argon2id for key derivation and AES-256-GCM for storage.
- **Scope**: Designed for storing local developer keys and testnet keys used during development.
- **Risk**: While encrypted, the keys reside on your local filesystem. This is appropriate for development but not for production-grade security.

### Private Key Exposure
HardKAS runners and CLI commands are designed to minimize the time private keys are held in memory. However, users should be aware that standard OS-level memory protections apply.

## Node Management (Docker)

HardKAS manages local `kaspad` instances via Docker:
- **Isolation**: Nodes run in isolated containers.
- **Data Persistence**: Chain data is stored in local volumes (typically `.hardkas/data`).
- **Reset Logic**: `hardkas node reset` performs a graceful shutdown and total data wipe to ensure a clean state for testing.

## Artifact Integrity

All HardKAS artifacts (Plans, SignedTx, Receipts) include:
- **Content Hashing**: Deterministic hashing of all operational fields.
- **Schema Versioning**: Mandatory versioning to prevent cross-version incompatibilities.
- **Integrity Checks**: `hardkas artifact verify` performs structural and cryptographic validation.

---

## Safety Recommendations

1. **Use Separate Accounts**: Never use your primary mainnet seed phrase with HardKAS.
2. **Audit Before Signing**: Always use `hardkas tx profile` and `hardkas artifact verify` to audit transaction plans before signing them for mainnet.
3. **Keep Docker Updated**: Ensure your Docker engine is patched to the latest version.
4. **Report Vulnerabilities**: If you discover a security issue, please report it via the [HardKAS Security Policy](https://github.com/KasLabDevs/HardKas/security/policy).
