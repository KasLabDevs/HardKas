# Security Model & Key Persistence

HardKAS is designed as a developer framework, **not** a production Hardware Security Module (HSM) or custody solution.

Understanding how HardKAS handles cryptographic keys is critical to safely operating on Testnet and Mainnet.

## The Absolute Rules

1. **Never use Deterministic Development Accounts on Mainnet.** 
   Accounts like `alice` and `bob` (generated automatically without entropy) are designed for local testing. Their private keys are predictable. Any funds sent to them on Mainnet will be stolen instantly.
2. **Possessing an address does not imply possessing its key.** 
   HardKAS can track "External Wallets" purely by their public address.
3. **Never commit keystores or plaintext keys to version control.** 
   HardKAS stores development state in `.hardkas/`, which should be strictly gitignored.

---

## Key Persistence & Storage

When HardKAS generates or imports a real Kaspa account (via `hardkas accounts real generate`), where does the key go?

By default, HardKAS encrypts the private key using an industry-standard KDF (Argon2id/Scrypt) and AES-256-GCM. 
* The encrypted envelope is saved as a `.json` file in `.hardkas/keystore/`.
* The `accounts.real.json` file stores a *reference* (`keystoreRef`) to the encrypted file.
* HardKAS prompts for a password to unlock the key during signing.

### The `--unsafe-plaintext` Flag

For rapid Localnet or CI testing, typing passwords is unviable. HardKAS provides an `--unsafe-plaintext` flag during account generation.

**What it does:**
It skips keystore encryption entirely. The raw 64-character hex private key is written directly into `.hardkas/accounts.real.json` in plain text.

**Security Implication:**
Anyone with file-system read access to your workspace can steal these keys. HardKAS emits prominent `[SECURITY WARNING]` logs whenever it detects plaintext keys loaded into memory. This mode is strictly for disposable `simnet` accounts.

## Private Key Exposure in the CLI/SDK

A recurring question is whether HardKAS CLI commands returning private keys constitute a security vulnerability.

**Classification:** `INTENTIONAL_EXPORT` / `DEVELOPMENT_ONLY`.

HardKAS intentionally allows extracting the raw private keys of development accounts (e.g., via `hardkas accounts real export` or programmatic SDK methods) because developers often need to import these disposable keys into third-party wallets (like Kaspium or KasWare) to test DApp integrations locally.

This is expected behavior. The security boundary is enforced by policy: developers are instructed to never import production Mainnet keys into a local HardKAS workspace. While HardKAS theoretically allows encrypted keystores for Mainnet, production deployments should defer signing authority to a true custody system via PSKT to maintain strict key isolation.
