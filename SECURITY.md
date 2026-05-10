# Security Policy

## HardKAS 0.1.0 Security Posture

HardKAS is a development tool designed for the Kaspa BlockDAG ecosystem. It is currently in **Alpha / Pre-release** staging.

### 1. Developer Workflow Warning
HardKAS is optimized for developer velocity and local simulation. It includes features like deterministic "Simulated Mode" and automated node orchestration that are intended for testing environments. 

### 2. No Production Custody Guarantee
**HardKAS is NOT a production-grade custody solution.** 
- Do not use HardKAS as your primary wallet for high-value mainnet funds.
- For production assets, always use dedicated, hardware-backed custody solutions or official Kaspa core wallets.

### 3. Encrypted Keystore Limitations
Real development accounts are stored in `.hardkas/keystore/`, encrypted using **Argon2id** and **AES-256-GCM**.
- While robust, this is a "hot wallet" implementation on your local machine.
- Your security is only as strong as your local machine's security and your keystore password.
- **NEVER** commit the `.hardkas/` directory to version control.

### 4. Mainnet Signing Warning
Mainnet signing and broadcasting are disabled by default. 
- Using the `--allow-mainnet-signing` flag bypasses safety checks. 
- Use this flag only if you fully understand the risks of broadcasting live transactions.

### 5. Responsible Disclosure
If you discover a security vulnerability within HardKAS, please do not open a public issue. Instead, report it responsibly:

- **Contact**: [Insert Contact Method, e.g., security@hardkas.org or GitHub DM]
- Please provide a detailed description of the vulnerability and steps to reproduce.

### 6. External Dependencies
HardKAS relies on official Kaspa WASM/gRPC libraries for consensus-critical logic. Vulnerabilities in underlying Kaspa core libraries should be reported to the official Kaspa security team.
