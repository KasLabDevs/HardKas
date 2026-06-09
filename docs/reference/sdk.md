# SDK Reference

The `@hardkas/sdk` package is the programmatic entry point for local-first
HardKAS workflows.

## `Hardkas.create(options)`

Initializes a HardKAS SDK instance.

```typescript
const sdk = await Hardkas.create({
  cwd: process.cwd(),
  network: "simulated",
  autoBootstrap: true
});
```

Common options:

- `cwd`: workspace directory.
- `network`: active network name, normally `simulated` for the local loop.
- `autoBootstrap`: creates `.hardkas/` and local simulated state when possible.
- `mode`: `developer` or `agent`.
- `policy`: optional execution restrictions.

## `sdk.tx`

- `sdk.tx.plan({ from, to, amount, feeRate })`: returns a deterministic
  `TxPlanArtifact`.
- `sdk.tx.sign(plan, account)`: returns a `SignedTxArtifact`.
- `sdk.tx.simulate(signed)`: executes against local simulated state and returns a
  receipt.
- `sdk.tx.send(signed)`: sends according to the active network. In `simulated`
  mode it delegates to local simulation.
- `sdk.tx.status(txId)`: returns basic transaction status.

## `sdk.accounts`

- `sdk.accounts.list()`: list configured account names.
- `sdk.accounts.resolve(nameOrAddress)`: resolve an account definition.
- `sdk.accounts.balance(nameOrAddress)`: get balance.
- `sdk.accounts.fund(nameOrAddress, options)`: fund through a configured local
  funding account in simulated mode.

## `sdk.artifacts`

- `sdk.artifacts.write(artifact)`: write a valid artifact.
- `sdk.artifacts.read(idOrPath)`: read by path, ID, hash, plan ID, signed ID, or
  tx ID.
- `sdk.artifacts.list()`: list workspace artifacts.
- `sdk.artifacts.verify(target)`: recalculate hashes and validate semantics.

## `sdk.query`, `sdk.lineage`, And `sdk.replay`

- `sdk.query.sync()`: synchronize the query store projection.
- `sdk.query.events(filter)`: read indexed events.
- `sdk.lineage.trace(target)`: trace artifact lineage.
- `sdk.replay.verify(targetOrOptions)`: verify deterministic replay.

## Localnet Caveat

`sdk.localnet.isAlive()` exists, but process control methods such as
`sdk.localnet.start()` and `sdk.localnet.reset()` are not yet implemented. Use the
CLI for localnet lifecycle commands.
