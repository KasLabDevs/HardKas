# HardKAS 0.10.x Roadmap: Builder Framework Layer

The 0.9.x series established the foundation: a hardened, reproducible local-first runtime (`rusty-kaspa` + `Toccata` + CLI isolation).

The goal of the 0.10.x series is to transition HardKAS from "a set of isolated CLI commands" to **"The definitive framework to build, simulate, and verify Kaspa applications."**

**Core Philosophy:**
- *Artifacts are not logs; they are Portable Evidence.*
- *HardKAS does not hide Kaspa (UTXOs, fees, DAG); it provides a safe, reproducible environment to master it.*

---

## The 0.10.x - 0.12.x Journey

### 0.10.x: Builder Framework
The transition from commands to a cohesive project system.

- **P10 — Project System**
  - CLI: `hardkas init <project>`
  - Constitution: `hardkas.config.ts` defining boundaries (network, evidence strictness, experimental flags).
  - Standardized structure: `src/scenarios/`, `.hardkas/artifacts/`, etc.

- **P11 — Scenario Engine**
  - Deprecating raw "scripts" in favor of `hardkas.scenario()`.
  - Scenarios automatically orchestrate accounts, localnet funding, tx execution, and artifact verification.

- **P12 — Artifact Protocol**
  - Elevating JSON artifacts to verifiable units of evidence.
  - Mandatory schemas, hashes, lineage chains, and replay commands per artifact.

- **P13 — Query Store → Projection Engine**
  - Re-architecting the Query Store as a deterministic read-model derived strictly from the Artifact Protocol.
  - It is not a database; it is a reproducible projection.

### 0.11.x: Developer Ecosystem
Once the builder framework is solid, we scale usability.

- **P14 — Templates**
  - `hardkas create app payment-flow`
  - Real templates with working tests, scenarios, and expected artifacts.
- **Plugins & Examples**
  - Extensibility hooks.

### 0.12.x: Network Readiness
- Guarded testnet interactions.
- RPC parity adapters.

---

## Architectural Map

```
             HardKAS

              SDK
               |
        Scenario Engine
               |
        Evidence Layer (Artifact Protocol)
               |
 ┌─────────────┼─────────────┐
 |             |             |
Localnet    Simulator    Query Projection
 |
rusty-kaspa

────── Extensions (Boundary Controlled) ──────
ZK | vProgs | Igra/L2 | Silver
```
