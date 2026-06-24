# HardKAS Capability Matrix

This matrix documents the current capabilities of the HardKAS developer tooling suite, explicitly outlining execution modes, verification evidence, and rigid non-claims. HardKAS is a local-first infrastructure stack and makes **no claims** regarding production, testnet, or mainnet readiness.

| Capability | Command/API | Mode | Status | Evidence | Explicit Non-Claims |
|------------|-------------|------|--------|----------|---------------------|
| **Core** | | | | | |
| Deterministic Hashing | `hardkas verify` | NOT_CLAIMED | READY_LOCAL | `package/build integrity` PASS | No guarantees against cryptographic breaks in underlying SHA-256 implementation. |
| Workspace Locking | `hardkas lock` | NOT_CLAIMED | READY_LOCAL | `pnpm test` PASS | Does not prevent external OS-level process interference or remote file locking. |
| Mainnet Guards | CLI Guard | NOT_CLAIMED | READY_LOCAL | `mainnet guard` PASS | Does not prevent a user from manually signing mainnet txs with a different client. |
| **Artifacts** | | | | | |
| Artifact Lineage | `hardkas artifact verify` | NOT_CLAIMED | READY_LOCAL | `postrelease:break` PASS | Lineage is tracked locally; no decentralized network consensus is provided. |
| Artifact Inspection | `hardkas artifact inspect` | NOT_CLAIMED | READY_LOCAL | CLI E2E PASS | Does not validate semantic payload truth, only structural and syntactic validity. |
| **Accounts** | | | | | |
| Local Simulated Accts | `hardkas accounts generate` | SIMULATED | READY_LOCAL | `localnet-account.e2e` PASS | Keys generated in simulated mode are invalid for mainnet or public testnets. |
| Encrypted Keystore | `hardkas accounts import` | NOT_CLAIMED | READY_LOCAL | `private-key-deprecation.test` PASS | Keystore encryption is meant for local dev use only; not institutional grade custody. |
| **Tx** | | | | | |
| Offline Tx Planning | `hardkas tx plan` | SIMULATED | READY_LOCAL | `tx-batch.e2e.test` PASS | Does not check mempool validity, feerate dynamics, or dynamic network conditions. |
| Offline Tx Signing | `hardkas tx sign` | SIMULATED | READY_LOCAL | `tx-batch.e2e.test` PASS | Signature validity is simulated; does not guarantee network propagation. |
| **Localnet/Toccata** | | | | | |
| Local Docker Node | `hardkas localnet start` | LOCAL_DOCKER | READY_LOCAL | `docker rpc health` PASS | Performance profile is restricted to Docker desktop limits; not representative of Kaspa limits. |
| Toccata Mining | `hardkas localnet fund` | LOCAL_DOCKER | READY_LOCAL | `gauntlet:toccata` PASS | Mined blocks are purely local; no connection to the real Toccata testnet. |
| **Query Store** | | | | | |
| SQLite Read Model | `hardkas query store` | NOT_CLAIMED | READY_LOCAL | `programmability:corpus` PASS | Read models are ephemeral; we do not guarantee data persistence across version migrations. |
| State Verification | `hardkas query verify` | NOT_CLAIMED | READY_LOCAL | `programmability:corpus` PASS | Not suitable for high-frequency or high-throughput production indexing. |
| **ZK** | | | | | |
| ZK Developer Toolkit | `hardkas zk capabilities` | EXPERIMENTAL | FIXTURE_ONLY | `zk:corpus` PASS | NO ONCHAIN VERIFICATION: ZK proofs are only validated against local fixtures. |
| **vProgs** | | | | | |
| vProgs Sandbox | `hardkas vprogs status` | EXPERIMENTAL | INSPECT_ONLY | `vprogs:check` PASS | NO VPROGS RUNTIME: Sandbox is for inspection only, not an active VM. |
| **SilverScript** | | | | | |
| SilverScript Diagnostic | `hardkas silver doctor` | EXPERIMENTAL | DEGRADED_LOCAL | `silver doctor` PASS | COMPILER UNAVAILABLE: SilverScript integration is highly experimental and incomplete. |
| **L2/Based App** | | | | | |
| L2 Prototyping | `hardkas l2 status` | EXPERIMENTAL | DEGRADED_LOCAL | CLI output format tests | NO REAL BRIDGE: App surface is limited to local configuration, inspection, and simulation artifacts. |
| **Stable Asset Simulator** | | | | | |
| Stable Asset Simulation | `hardkas stable-asset` | EXPERIMENTAL | SIMULATION_ONLY | `programmability:corpus` | NO REAL ISSUER: Mints simulated tokens internally, no actual KRC-20 or smart contract is deployed. |
| **Dev Server** | | | | | |
| Local Dashboard API | `hardkas dev doctor` | NOT_CLAIMED | DEGRADED_LOCAL | CLI output format tests | Not intended for public exposure or network listening outside of localhost dev loops. |
