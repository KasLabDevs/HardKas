# Security Policy

## HardKAS 0.4.0-alpha Security Posture

HardKAS is a development tool designed for the Kaspa BlockDAG ecosystem. It is currently in **Alpha / Pre-release** staging.

### 1. Developer Workflow Warning
HardKAS is optimized for developer velocity and local simulation. It includes features like deterministic "Simulated Mode" and automated node orchestration that are intended for testing environments. 

### 2. No Production Custody Guarantee
**HardKAS is NOT a production-grade custody solution.** 
- Do not use HardKAS as your primary wallet for high-value mainnet funds.
- For production assets, always use dedicated, hardware-backed custody solutions or official Kaspa core wallets.

### 3. Encrypted Keystore Limitations
Real development accounts are stored in `.hardkas/keystore/`, encrypted using **Argon2id** and **AES-256-GCM**.
- **Restrictive Permissions**: HardKAS enforces **0600 (owner-only)** filesystem permissions on all keystore writes.
- **Hot Wallet Risk**: While robust, this is a "hot wallet" implementation. Your security is only as strong as your local machine's security and your keystore password.
- **NEVER** commit the `.hardkas/` directory to version control.

### 4. CLI Secret Exposure Risk & Redaction
HardKAS CLI commands that accept secrets (private keys, passwords) via command-line arguments are **deprecated** for safety.
- **Shell History**: Arguments are often stored in plain text in `~/.bash_history` or `~/.zsh_history`.
- **Policy**: Always prefer `--private-key-stdin` or `--password-env`.
- **Automated Redaction**: HardKAS implements **Recursive Secret Redaction**. Known secrets (like private keys or passwords) are automatically masked (e.g., `[REDACTED]`) in all CLI logs, error messages, and telemetry to prevent accidental exposure in CI logs.

### 5. Mainnet Signing Warning
Mainnet signing and broadcasting are disabled by default. 
- Using the `--allow-mainnet-signing` flag bypasses safety checks. 
- Use this flag only if you fully understand the risks of broadcasting live transactions.

### 6. Workspace Lock Safety
HardKAS uses a conservative filesystem locking mechanism to prevent concurrent writes to the same workspace.
- **Deadlock Prevention**: Locks are acquired in a strict deterministic order.
- **Recovery Policy**: HardKAS will NEVER silently break a lock held by another process.
- **Manual Intervention**: If a process crashes and leaves a stale lock, use `hardkas lock doctor` to identify it and `hardkas lock clear <name> --if-dead` to release it.
- **Risk**: Clearing a lock while another process is active can lead to **permanent data corruption** in the query store or artifact registry.

### 7. Responsible Disclosure
If you discover a security vulnerability within HardKAS, please do not open a public issue. Instead, report it responsibly:

- **Contact**: security@hardkas.org
- Please provide a detailed description of the vulnerability and steps to reproduce.

### 8. External Dependencies
HardKAS relies on official Kaspa WASM/gRPC libraries for consensus-critical logic. Vulnerabilities in underlying Kaspa core libraries should be reported to the official Kaspa security team.
