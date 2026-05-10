# HardKAS Documentation

Welcome to the HardKAS developer infrastructure documentation. HardKAS is a Kaspa-native developer operating environment designed for high-confidence simulation, deterministic replay, and artifact-first auditability.

## 🧠 Concepts
Understand the core principles that drive HardKAS.
- [Deterministic Artifacts](./concepts/artifacts.md)
- [Replay Invariants](./concepts/replay.md)
- [DAG Simulation (Light-Model)](./concepts/dag-simulation.md)
- [L1 (Kaspa) vs L2 (Igra)](./concepts/l1-vs-l2.md)

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

---

HardKAS is currently in **v0.2-alpha**. APIs and schemas are evolving.
For getting started instructions, see the main [README.md](../README.md).
