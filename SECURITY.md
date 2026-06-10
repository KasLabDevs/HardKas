# Security Policy

## HardKAS 0.9.1-alpha Security Posture

HardKAS 0.9.1-alpha is local-first tooling for the Kaspa/Toccata development
loop. It is currently in **Alpha / Pre-release** staging.

### 1. Developer Workflow Warning

HardKAS is optimized for developer velocity, local simulation, and Toccata v2
simnet certification. It includes deterministic simulated mode and automated
node orchestration intended for local development environments.

### 2. No Production Custody Guarantee

**HardKAS is NOT a production-grade custody solution.**

- Do not use HardKAS as your primary wallet for high-value mainnet funds.
- Do not import mainnet seed phrases into a HardKAS workspace.
- Local accounts are for simnet/dev workflows only.
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

### 5. Mainnet And SilverScript Policy

Mainnet signing and broadcasting are outside the 0.9.1-alpha release claim.
SilverScript mainnet execution is disabled by policy.

- SilverScript mainnet paths must fail with `SILVERSCRIPT_MAINNET_NOT_ENABLED`.
- Mainnet signing/broadcast for SilverScript is not enabled in this release.
- Do not treat testnet or mainnet behavior as certified by the Toccata localnet gauntlet.
- Trustless bridge/security claims are not included in this release.

### 6. Simulator Boundary

The Silver/Toccata simulator is artifact-coherence oriented. It validates local
artifact coherence and replayability, but it is not a consensus validator and it
does not replace `rusty-kaspa`.

- `artifactCoherence`: `READY_MATCH`
- `runtimeOutcome`: `PARTIAL`
- `vmConsensusEquivalence`: `NOT_CLAIMED`
- `mainnet`: `BLOCKED_BY_POLICY`

### 7. Workspace Lock Safety

HardKAS uses a conservative filesystem locking mechanism to prevent concurrent writes to the same workspace.

- **Deadlock Prevention**: Locks are acquired in a strict deterministic order.
- **Recovery Policy**: HardKAS will NEVER silently break a lock held by another process.
- **Manual Intervention**: If a process crashes and leaves a stale lock, use `hardkas lock doctor` to identify it and `hardkas lock clear <name> --if-dead` to release it.
- **Risk**: Clearing a lock while another process is active can lead to **permanent data corruption** in the query store or artifact registry.

### 8. Dev-Server Workstation Containment

The local dev-server is secured against malicious external websites trying to exploit the local loopback through the following measures:

- **Per-Session Security Tokens:** A cryptographically secure 256-bit token is generated on boot and is required on all `/api/*` endpoints.
- **CSRF Mutation Defense:** All mutating methods (POST, PUT, PATCH, DELETE) require the custom header `X-Hardkas-Request: true`.
- **DNS Rebinding Defense:** Host headers are strictly verified against loopback endpoints. Custom malicious hosts are rejected with a `403 Forbidden` response.
- **Strict CORS Loops:** Cross-Origin requests are locked down strictly to same-origin configurations matching the dev-server and Vite development environments.

### 9. Responsible Disclosure

If you discover a security vulnerability within HardKAS, please do not open a public issue. Instead, report it responsibly:

- **Contact**: security@hardkas.org
- Please provide a detailed description of the vulnerability and steps to reproduce.

### 10. External Dependencies

HardKAS relies on official Kaspa WASM/gRPC libraries and local `rusty-kaspa`
nodes for consensus-critical behavior. Vulnerabilities in underlying Kaspa core
libraries should be reported to the official Kaspa security team.
