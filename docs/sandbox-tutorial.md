# Sandbox Tutorial

The HardKAS Sandbox is a safe, ephemeral workspace designed for destructive experimentation. It allows you to simulate network degradations, corrupted projections, and replay failures without touching your primary project directory.

## What is a Sandbox?

A sandbox is a temporary directory created with a specific marker (`.hardkas-sandbox-target`). HardKAS guarantees that all destructive actions are strictly contained within this directory.

## Entering the Sandbox

```bash
hardkas sandbox --with-node
```

This starts the developer node and launches the Dashboard. Leave this running in one terminal.

## Recipe: Transfer

In another terminal, execute the transfer recipe:

```bash
hardkas sandbox --recipe transfer
```

This generates a healthy, complete workflow. Check the Dashboard to see the artifacts appear.

## Recipe: Replay Failure

HardKAS enforces determinism. What happens if a transaction fails determinism checks? Let's inject a failure:

```bash
hardkas sandbox --recipe replay-failure
```

This recipe doesn't create fake artifacts. It executes a real transaction, then deliberately mutates a field in the sandbox copy, breaking the lineage signature. When the system attempts a deterministic replay, it will catch the tampering and mark the artifact as `QUARANTINED`.

You will see this immediately in the Dashboard's **Lineage Graph** and **Activity Timeline**.

## Recipe: Projection Rebuild

HardKAS separates canonical truth (artifacts) from derived state (projections like the database). 

```bash
hardkas sandbox --recipe projection-rebuild
```

This recipe simulates a corrupted database. The Dashboard will instantly show a `Degraded` projection warning. However, because your local artifacts remain the ultimate source of truth, you can effortlessly rebuild the database:

```bash
hardkas rebuild
```

The projection is restored from the local canonical artifact lattice, proving that you never lose data as long as your artifacts are safe.
