# Node/RPC Coverage Report

**Functional Coverage**: Very Poor. The CLI actively fights against RPC mode by defaulting to deterministic simulated mode for planning transactions. Generating real node accounts is impossible out of the box due to missing dependencies.

---

**App**: `payroll-rpc`

### Commands Covered:
- `hardkas node start` / `hardkas rpc health`: Same behavior as Faucet. Works perfectly to start and probe the gRPC/JSON nodes.
- `hardkas accounts real generate`: **FAILED (Bug)**. The identical `Kaspa SDK key generation dependency is not installed` error occurs.
- `hardkas tx plan`: **FAILED (Bug)**. Attempting batch payments over RPC forcibly reverts to `simulated` mode, preventing any real RPC node transactions from being crafted via CLI.
- `hardkas query events` / `hardkas workflow run`: Cannot be tested over RPC due to `tx plan` and keystore generation blockers. 

**Functional Coverage**: Blocked entirely. The CLI cannot orchestrate real Node transactions because `tx plan` and `accounts real` are functionally broken or misconfigured.
