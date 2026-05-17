# HardKAS Documentation

Welcome to the HardKAS developer infrastructure documentation. HardKAS is a Kaspa-native developer operating environment designed for high-confidence simulation, deterministic replay, and artifact-first auditability.

## 🧠 Concepts
Understand the core principles that drive HardKAS.
- [Artifact Model](./artifact-model.md)
- [Replay Invariants](./concepts/replay.md)
- [DAG Simulation (Light-Model)](./concepts/dag-simulation.md)
- [L1 (Kaspa) vs L2 (Igra)](./concepts/l1-vs-l2.md)
- [Security Model](./security-model.md)
- [Current Status (What Actually Works)](./what-actually-works.md)
- [Local Igra Onboarding](./onboarding-local-igra.md)
- [React Integration](./react-local-integration.md)
- [Getting Started (Local Golden Path)](./getting-started-local.md)
- [HardKas Dev Server (Local)](./dev-server-local.md)

## 🏗️ Architecture
Deep dives into the technical boundaries and lifecycles.
- [Transaction Lifecycle](./architecture/transaction-lifecycle.md)
- [Modular Boundaries](./architecture/boundaries.md)

## 👨‍🍳 Cookbook
Practical guides for common developer workflows.
- [Debugging Failed Transactions](./cookbook/replay-debugging.md)

## 🚫 Anti-Patterns
Learn what to avoid to build secure and scalable infrastructure.
- [Implicit Send](./anti-patterns/implicit-send.md)
- [L1/L2 Confusion](./anti-patterns/l1-l2-confusion.md)

## 📚 Reference
Technical specifications and data models.
- [Artifact Schemas](./reference/artifact-schemas.md)
- [CLI Reference](./reference/cli.md)

## 🛠️ Developer Tooling

The CLI documentation is auto-generated from the command tree definition to prevent drift.

- **Generate docs**: `pnpm docs:generate-cli`
- **Verify integrity**: `pnpm docs:check-cli`

*Narrative docs can be written by humans or AI, but CLI flags must come from code.*

---

HardKAS is currently in **v0.3.0-alpha (HARDENED ALPHA)**. APIs and schemas are evolving.
For getting started instructions, see the main [README.md](../README.md).
