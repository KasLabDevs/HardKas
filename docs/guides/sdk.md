# SDK Guide

The `@hardkas/sdk` package is the programmatic interface to a HardKAS workspace.

## Create A Local SDK

```typescript
import { Hardkas } from "@hardkas/sdk";

const sdk = await Hardkas.create({
  cwd: process.cwd(),
  network: "simulated",
  autoBootstrap: true
});
```

`simulated` is the recommended development mode. It uses local state and does
not require a Kaspa node.

Without `network` (and without `target`) the SDK runs on the workspace's
`execution` contract — the same resolution the CLI applies — so `Hardkas.open(".")`
in a project whose `execution.default` is `localnet` talks to the node, never to
the simulator. `target` selects a named target of `execution.targets` (as
`--target` does in the CLI); `network` must be a network id of `networks`
(`simulated`, `simnet`, `devnet`, `testnet-10`, `mainnet`, …), never a target
name, and when both are given they must agree. Unknown names and disagreements
are typed errors (`UNKNOWN_NETWORK`, `EXECUTION_TARGET_NOT_FOUND`,
`EXECUTION_NETWORK_MISMATCH`); nothing falls back to the simulator. The resolved
target is `sdk.execution`. An instance is never re-pointed by one call: the
per-call `network` of `sdk.tx.createConsolidationPlan(...)` and the `target` of
`sdk.observe.address(...)` must name the instance's own network — another world
needs another instance — and a consolidation spends only the account's own UTXOs.

## Transaction Lifecycle

```typescript
const plan = await sdk.tx.plan({
  from: "alice",
  to: "bob",
  amount: "10"
});

await sdk.artifacts.write(plan);

const signed = await sdk.tx.sign(plan, "alice");
await sdk.artifacts.write(signed);

const { receipt } = await sdk.tx.simulate(signed);
await sdk.artifacts.write(receipt);
```

Use `sdk.tx.simulate(...)` for local execution. `sdk.tx.send(...)` delegates to
simulation when the active network is `simulated`, and uses RPC for real network
contexts.

## Core Services

### `sdk.tx`

- `plan(...)`: create a deterministic transaction plan.
- `sign(...)`: create a signed transaction artifact.
- `simulate(...)`: apply a signed transaction to local simulated state.
- `send(...)`: execute according to the active provider.
- `status(...)`: inspect transaction status.

### `sdk.artifacts`

- `write(...)`: write artifacts into `.hardkas/artifacts`.
- `read(...)`: resolve an artifact by path or ID.
- `list()`: list workspace artifacts.
- `verify(...)`: recalculate canonical hashes and validate semantics.

### `sdk.accounts`

- `list()`: list configured account names.
- `resolve(...)`: resolve account definitions.
- `balance(...)`: get balance.
- `fund(...)`: fund local simulated accounts through an available simulated
  funding account.

### `sdk.query`, `sdk.lineage`, `sdk.replay`

- `sdk.query.sync()`: synchronize the SQLite projection.
- `sdk.query.events(...)`: read indexed events.
- `sdk.lineage.trace(...)`: trace artifact ancestry or descendants.
- `sdk.replay.verify(...)`: verify deterministic replay.

## Error Handling

HardKAS throws normal `Error` objects and typed HardKAS errors depending on the
layer. Check `error.code` when present, and always treat artifact verification
failures as hard stops.
