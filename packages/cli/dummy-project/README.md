# dummy-project

Built with [HardKAS](https://github.com/KasLabDevs/HardKas) — Kaspa developer toolkit.

## HardKAS Concepts

HardKAS is a deterministic developer operating environment. Before writing code, it's essential to understand the 5 core concepts of the runtime:

- **Artifact**: The absolute source of truth. An immutable JSON file representing an intent, plan, receipt, or trace, written to `.hardkas/artifacts/`.
- **Projection**: Derived state. HardKAS indexes artifacts into a SQLite query-store for the dashboard to read, but SQLite is _never_ the authority.
- **Replay**: Deterministic execution. If you give HardKAS an artifact, it will replay the exact causal events that generated it.
- **Snapshot**: A portable, local-only backup of your artifacts and indexed state for fast recovery. It is _not_ a consensus proof.
- **Stale**: If a parent artifact is modified or corrupted, all derived artifacts become "stale" because their deterministic causal chain is broken.

## Quick start

Check out the [`FIRST_STEPS.md`](./FIRST_STEPS.md) file for a practical guide on how to see these concepts in action.
