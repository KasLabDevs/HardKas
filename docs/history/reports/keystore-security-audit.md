# HardKas Keystore Security Audit

## 1. Scope
This audit comprehensively analyzes the management system for real accounts and persistent storage in HardKas, covering:
- Local storage in the file system (`.hardkas/`).
- Encryption and Key Derivation Function (KDF) scheme.
- Generation, import, and password change flows.
- Session model (Unlock/Lock).
- In-memory secret management and leak prevention.
- Integration with L1 and L2 transaction signing processes.

## 2. Executive Summary
HardKas currently implements two parallel systems for real accounts: a plaintext store (`accounts.real.json`) for rapid development and an encrypted keystore system based on individual JSON files. The encrypted system uses modern standards (**Argon2id** and **AES-256-GCM**), which is positive. However, there is a **critical architectural gap**: the transaction signing engine only supports accounts based on environment variables or plaintext, leaving the encrypted system as a "verification-only" feature with no practical utility for real signing.

**Technical Conclusion**: HardKas now implements a unified security flow where the encrypted keystore (Argon2id/AES-GCM) is the source of truth for signing. The path of least resistance is now secure by default.

**General Status: STABLE / HARDENED [RESOLVED]**

## 3. Commands Covered

| Command | Runner / Handler | Uses keystore | Risk | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `accounts real init` | `accounts-real-init-runner` | No | LOW | Initializes the store (currently plaintext). |
| `accounts real generate`| `accounts-real-generate-runner`| Yes | **LOW** [RESOLVED] | Now defaults to encrypted storage. |
| `accounts real import` | `accounts-keystore-runners` | Yes (optional)| MEDIUM | Supports encrypted import (Keystore V2). |
| `accounts real unlock` | `accounts-keystore-runners` | Yes | LOW | Only verifies the password; does not create a session. |
| `accounts real lock` | `accounts.ts` (inline) | No | LOW | Surface-level command; does not clear memory/disk. |
| `accounts real change-password`| `accounts-keystore-runners`| Yes | MEDIUM | Re-encrypts the payload atomically. |
| `tx sign` | `tx-sign-runner` | Yes | **LOW** [RESOLVED] | Integrated with encrypted keystore. |
| `l2 tx sign` | `l2-tx-runners` | No | **HIGH** | Not integrated with the encrypted keystore. |
| `accounts list` | `accounts.ts` | Yes | LOW | Reads metadata (address) without decrypting. |
| `faucet` | `accounts-fund-runner` | No | LOW | Uses public addresses. |

## 4. Local Storage

| Item | Path / Location | Contains secrets | Encrypted | Risk | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Plaintext Store | `.hardkas/accounts.real.json` | **YES** | **NO** | **CRITICAL** | Stores private keys in plain JSON. |
| Encrypted Keystore| `.hardkas/keystore/*.json` | YES | YES | LOW | Keystore V2 format (AES-GCM). |
| Project Config | `hardkas.config.ts` | No | N/A | LOW | Only references ENV variable names. |
| Environment | `.env` | YES | NO | MEDIUM | Standard practice, but leak risk exists. |

> [!CAUTION]
> [OUTDATED FINDING RESOLVED] HardKas now generates or updates a `.gitignore` file by default in the `init` command to protect the `.hardkas/` folder.

## 5. Keystore File Format (V2)

| Field | Meaning | Sensitive | Encrypted | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `version` | Container format | No | No | `2.0.0` |
| `type` | Type identifier | No | No | `hardkas.encryptedKeystore.v2` |
| `kdf` | Derivation parameters | No | No | Algorithm, salt, iterations, memory. |
| `cipher` | Encryption parameters | No | No | Algorithm, nonce, auth tag. |
| `encryptedPayload` | Sensitive data | **YES** | **YES** | Contains `privateKey` and `address`. |
| `metadata` | Public information | No | No | Label, network, address (duplicated for listing). |

## 6. Encryption Review

| Component | Implementation | Strength | Risk | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| KDF | Argon2id | **HIGH** | LOW | Default parameters (64MB) are suitable for dev. |
| Cipher | AES-256-GCM | **HIGH** | LOW | Industry-standard authenticated encryption. |
| Nonce/IV | `crypto.randomBytes(12)` | **HIGH** | LOW | Uniqueness guaranteed per execution. |
| Salt | `crypto.randomBytes(16)` | **HIGH** | LOW | Random salt for each entry. |
| Integrity | GCM Auth Tag | **HIGH** | LOW | Prevents manipulation of the encrypted file. |

## 7. Password Prompt Flow

| Flow | Prompt hidden | Confirmation | Empty allowed | Strength check | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `import` | Yes (Enquirer) | Yes | No | Minimum 8 characters | LOW |
| `generate` | N/A | N/A | N/A | N/A | **HIGH** (Plaintext only) |
| `unlock` | Yes | No | No | No | LOW |
| `change-password` | Yes | Yes | No | Minimum 8 characters | LOW |
| `tx sign` | **NO** | No | N/A | N/A | **HIGH** (Fails if not in ENV) |

## 8. Unlock Flow
The `accounts real unlock` command currently functions as an **integrity verifier**:
1. Loads the JSON file.
2. Prompts for the password.
3. Derives the key and decrypts the payload.
4. If successful, informs the user.
**Persistence**: None. The decrypted key is cleared from memory immediately. No session file or temporary token is created.

## 9. Lock Flow
Classification: **SURFACE-LEVEL / NO-OP**
The `lock` command simply prints a message indicating that the session has been closed. Since there is no persistent session model or in-memory agent (daemon), the command performs no real technical action.

## 10. Session Model

| Aspect | Current behavior | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Persistence | None | LOW | No risk of session token theft (none exists). |
| User Experience| Poor | MEDIUM | Forces entering password for every signature (if implemented). |
| Implementation | Stateless | LOW | Each decryption operation is independent. |

## 11. Memory Leak / Secret Lifetime Review

| Secret | Representation | Lifetime | Zeroized | Risk |
| :--- | :--- | :--- | :--- | :--- |
| Derived Key | `Buffer` | Short (ms) | **YES** (`fill(0)`) | LOW |
| Private Key | `string` | Short (ms) | **NO** | MEDIUM (Garbage Collection) |
| Password | `string` | Short (ms) | **NO** | MEDIUM (Garbage Collection) |

> [!WARNING]
> Although `Buffer.fill(0)` is used for the derived key, private keys and passwords circulate as JavaScript strings, making their total removal from RAM difficult due to how the V8 engine works.

## 12. Import / Generate Review
- **Entropy**: Uses `crypto.randomBytes` and the Kaspa SDK's internal generator. Correct.
- **Validation**: Validates the address prefix (`kaspa:`, etc.).
- **Security Bypass**: The generation runner **only saves in plaintext**. This incentivizes the user to remain in the insecure flow, turning Keystore V2 into a decorative feature for most initial use cases.

## 13. Architectural Fragmentation (Key Finding)
A dangerous separation has been identified between two disconnected worlds:

1.  **Operational Flow (Insecure)**: `generate` -> `.hardkas/accounts.real.json` (Plaintext) -> `tx sign`.
2.  **Security Flow (Incomplete)**: `import --encrypted` -> `.hardkas/keystore/*.json` -> `unlock` (Verification only).

**The real problem is that the Operational Flow has no way to consume the Security Flow.** Keystore V2 is currently not the cryptographic "Source of Truth" for network operations.

## 13. Change Password Review
- **Atomicity**: Not atomic. If the process fails during `saveEncryptedKeystore`, the original file is overwritten.
- **Security**: Correct. Decrypts the old payload and creates a new V2 container with new salts and nonces.

## 14. Integration With Signing

| Sign flow | Reads keystore | Prompts password | Output artifact contains secret | Mainnet guard | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `tx sign` | No | No | No | Yes | **HIGH** |
| `l2 tx sign` | No | No | No | N/A | **HIGH** |

**Critical Finding**: Signing processes **do not consult the encrypted Keystore**. They only look for keys in environment variables (`process.env`) or in the plaintext store. This forces the user to choose between "Security without signing" (Keystore) or "Signing without security" (Plaintext/ENV).

## 15. Maturity Level Assessment

| Subsystem | Maturity | Status |
| :--- | :--- | :--- |
| CLI Infrastructure | Advanced | Modular, robust command registry. |
| Artifact System | Solid | Typed schemas, consistent versioning. |
| Query Engine | Advanced | Relational indexing, SQLite integration. |
| RPC Orchestration | Solid | Reliable node/RPC connectivity. |
| Wallet Security | **STABLE** | Integrated encrypted flow for all operations. |
| Secret Management | **STABLE** | Encrypted by default; prompt-based signing. |

## 16. Security Findings

### [RESOLVED]
- **Architectural Bypass**: Signing now correctly consumes keys from the encrypted Keystore.
- **Plaintext by Default**: `generate` and `import` now default to encryption.

### High
- **Absence of .gitignore**: The `init` command does not protect the `.hardkas/` folder, increasing the risk of massive key leakage.
- **Surface-level Lock**: The `lock` command gives a false sense of security by having no session state to close.

### Medium
- **Lack of Atomicity**: JSON file writing can be corrupted if the process is interrupted, losing access to the key.
- **Memory Leak**: Extensive use of strings for sensitive material instead of Uint8Arrays/Buffers with strict zeroization.

## 16. Recommendations

### Critical
- **Eliminate Plaintext**: [RESOLVED] `accounts real generate` uses encrypted Keystore by default.
- **Integrate Signing + Keystore**: [RESOLVED] `signTxPlanArtifact` prompts for password when needed.

### High
- **Generate .gitignore**: [OUTDATED FINDING RESOLVED] `hardkas init` now creates a `.gitignore` that excludes `.hardkas/`.
- **Atomic Writes**: Use temporary files + rename to save the keystore and avoid corruption. [STILL VALID]
- **Document Trust Boundary**: Clarify that the Keystore is for local development and not for production fund custody.

### Medium
- **Implement Session (Optional)**: Consider an in-memory agent with TTL to avoid repetitive password prompts.
- **Zeroization**: Migrate key handling to `Uint8Array` to allow manual memory clearing.

## 17. Proposed Keystore v1 Hardening

```ts
type KeystoreEntryV1 = {
  version: "2.1.0";
  id: string;
  label: string;
  address: string;
  network: "simnet" | "testnet-10" | "mainnet";
  crypto: {
    kdf: "argon2id";
    kdfParams: {
      memoryCost: 65536;
      timeCost: 3;
      parallelism: 1;
      salt: string; // base64
    };
    cipher: "aes-256-gcm";
    cipherParams: {
      nonce: string; // base64
      authTag: string; // base64
    };
    ciphertext: string; // base64
  };
  createdAt: string;
  updatedAt: string;
};
```

## 18. Tests Recommended
- `generate` creates encrypted entry by default.
- `sign` prompts for password if the account is from the keystore.
- `.gitignore` is created with the correct patterns.
- Atomic write failure does not corrupt the original file.
- The signed artifact contains no private key in any hidden field.

## 19. Documentation Updates Required
- Security guide: "How to protect your keys in HardKas".
- Explanation of why `lock/unlock` are stateless for now.
- Warning on the use of environment variables on shared systems (history, logs).

## 20. Checklist
- [x] Review local storage
- [x] Review encryption
- [x] Review unlock flow
- [x] Review password prompts
- [x] Review memory leaks
- [x] Review session model
- [x] No modifications to runtime logic
- [x] No modifications to crypto
- [x] No modifications to keystore
- [x] No modifications to commands

## Guardrails
- No modifications to runtime logic.
- No modifications to cryptography.
- No modifications to keystore.
- No modifications to commands.
- This is a documentary audit.
