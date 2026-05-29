# HardKAS v0.7.4-alpha: The Operational Resilience Release

**Date**: May 26, 2026

We are thrilled to announce HardKAS v0.7.4-alpha. This release marks a philosophical shift for the project: moving from standard developer tooling to a mathematically deterministic, event-sourced infrastructure runtime.

**HardKAS was built to bring deterministic operational tooling to the Kaspa ecosystem.** As the ecosystem scales, developers need infrastructure that assumes failure is inevitable and degrades gracefully instead of collapsing.

Crucially, this release codifies our exact boundary of domain: **HardKAS is an operational runtime around Kaspa workflows.** It is not a wallet, not a consensus implementation, and not a replacement for `rusty-kaspa`. It provides deterministic local transaction artifact semantics, while delegating live consensus and mempool behavior to the network.

For this release, we deployed autonomous chaos agents to relentlessly attack the filesystem, memory, and concurrent execution pipelines of HardKAS. **HardKAS has demonstrated operational resilience across thousands of adversarial chaos runs**, establishing a rock-solid foundation for future Kaspa developers.

## 🚀 Key Features

### The Chaos Engine Natively Integrated

We have formalized our fuzzing suite directly into the CLI. Operators can now run deterministic, destructive chaos campaigns to validate their own environments.

- Run `hardkas chaos --runs 300 --profile smoke` to stress-test your file system throughput and concurrent SQLite locking.
- Every failure generates a cryptographically reproducible bash script (`repro/run-XXXX.sh`) based on a PRNG seed.

### Formalized Event Ledger (`events.jsonl`)

HardKAS is now truly event-sourced. The `coreEvents` bus is canonically linked to the `events.jsonl` file via an atomic `AppendCoordinator`. Every operation, from signing a transaction artifact to an RPC disconnect, emits a formalized `EventEnvelope` with strict causality tracing (`causationId`).

### Advanced Stream Validation

The `hardkas doctor` command no longer just checks if files exist; it scans the JSONL streams line by line, detecting trailing byte corruption, missing newlines, and schema violations, guiding the operator to safe recovery.

## 🛡️ Hardening & Bug Fixes

- **TOCTOU Race Condition Mitigated**: Resolved a highly elusive Time-Of-Check to Time-Of-Use vulnerability in the locking mechanism. Newly acquired locks are granted a 2000ms grace period to write metadata before being evaluated.
- **Cross-Platform Liveness Checks**: Fixed aggressive false-positive lock deletion on Windows systems by correctly interpreting `EPERM` OS codes during `process.kill(pid, 0)` checks.
- **Boot Sequence Safety**: `hardkas up` now rigidly adheres to resource reservation. It will bind the HTTP port _before_ attempting the heavy SQLite projection rebuild, preventing database corruption if the port is already in use.
- **Dashboard Semantic Strictness**: The UI will no longer display `GREEN` if the underlying streams or Kaspa RPC API are disconnected. Offline states correctly show as `GREY`, and corrupted streams show as `RED`.

## 📚 Documentation

We have published the formal [RUNTIME_CONTRACT.md](./RUNTIME_CONTRACT.md) detailing our invariant guarantees, alongside a comprehensive [OPERATOR_GUIDE.md](./OPERATOR_GUIDE.md) for dealing with real-world infrastructure incidents.

_With v0.7.4-alpha, HardKAS assumes the user, the filesystem, and the runtime environment will eventually fail—and it is ready to handle it._
