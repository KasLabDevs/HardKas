# HardKAS v0.7.6-alpha — Release Summary

## Scope of Stabilization

This release marks the transition of the entire HardKAS developer platform from the initial experimental stabilization series into a hardened, secure, local-first development operating runtime. The scope of this milestone encompasses:

- **Deterministic Transaction Canonicalization**: Elimination of volatile planning metadata and strict ordering invariants.
- **Workstation Security Hardening**: Browser-based attack surface mitigation (CSRF, DNS rebinding) for local dev-servers.
- **Replay Integrity Consolidation**: Time-travel BlockDAG state reconstruction and strict lineage verification.
- **Workflow Runtime Maturity**: Sandboxed multi-step orchestrations with Agent-Mode policy checks.
- **Observability and Projection Awareness**: Synchronous generation tracking (SSE + custom REST headers).

---

## Architectural Milestones

1. **Deterministic Planning (P1.12)**: Achieved a mathematical planning invariant where the same wallet state, transaction request, and policy yield an identical plan hash (`contentHash`) across different platforms, times, and RPC response orderings.
2. **Security Sandboxing (P0)**: Secured the local Hono dev-server against cross-site request forgery and DNS rebinding by implementing cryptographically secure bearer session tokens, Host header validation, and custom mutation headers (`X-Hardkas-Request`).
3. **Lineage and Replay (P1)**: Decoupled replay verification and historical state mathematical reconstruction from the CLI, lodging them inside `@hardkas/localnet` and `@hardkas/sdk` to permit fully offline programmatical execution.
4. **Declarative Workflows (P6/P7)**: Developed a declarative multi-step orchestration engine capable of recording execution steps and verifying cryptographic lineage in isolated sandboxes.
5. **Projection Tracking (P3/P4)**: Integrated Server-Sent Events (SSE) and HTTP response generation headers (`X-Hardkas-Generation`) to automatically invalidate cache and warn the user of database update debounces.

---

## Guarantees

- **Canonical UTXO Selection**: UTXOs are sorted canonically (`amountSompi ASC`, `transactionId ASC`, `index ASC`) before coin selection, ensuring stable inputs.
- **Canonical Output Ordering**: Recipient outputs are sorted canonically (`amountSompi ASC`, `address ASC`) in the transaction plan.
- **Invariant Change Placement**: If change is generated, it is kept in an isolated field and physically appended strictly last, ensuring `index = outputs.length`.
- **Stable Content Hashing**: Volatile networking metadata (`rpcHost`, `latencyMs`, `rpcUrl`) and runtime metrics (`createdAt`, `status`, `tracePath`) are semantically excluded from artifact content hashes.
- **Offline Reproducibility**: The simulated transaction execution is isolated from network wRPC fetches, maintaining 100% reproducibility in air-gapped environments.

---

## Known Limitations

- **Command Suspensions**: The `hardkas tx trace` command remains suspended in this alpha release while the query store API stabilizes. Replay verification operates correctly without traces.
- **Database WAL Rebuilds**: Under heavy DAG reorgs or massive script generations, the SQLite query-store WAL cache can drift from disk state, requiring an explicit `hardkas query store rebuild`.
- **Private Key Deprecation**: Support for plaintext private keys as arguments (`--private-key`) is deprecated. Developers are warned to use encrypted keystores.

---

## Maturity Assessment

- **API & Schemas**: Stable. The schemas for snapshots, plan artifacts, signed transactions, and workflows (`hardkas.workflow.v1`) are sealed.
- **Workstation Security**: Complete. Tested against DNS rebinding and cross-site scripting/CSRF with zero auth leakage.
- **Testing Confidence**: Exceptional. The repository boasts a 100% green test suite consisting of 115 unit/E2E CLI tests, 12 SDK contract/agent tests, 31 deterministic reproducibility proofs, and 10 Playwright visual E2E dashboard tests.

---

## Remaining Production Risks

- **Memory Pressure under Massive BlockDAGs**: Long-running simulations with over 10,000 blocks in the virtual DAG memory-store can experience high heap usage.
- **L2 State Sync Latency**: Bridge event syncing under extreme BlockDAG reorgs requires further asynchronous debounce tuning before production Mainnet usage.
