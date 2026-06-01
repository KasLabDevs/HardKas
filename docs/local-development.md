# Local Development

HardKAS is built with a "local-first" philosophy. The majority of your development cycle should happen against the built-in simulator before touching a real testnet.

## The Simulator

The HardKAS localnet simulator provides a fast, deterministic environment for your dApps.

To start the simulator:
```bash
pnpm hardkas localnet start
```

### State Forking

You can fork state from a real network. This creates a local snapshot of the network state that you can test against deterministically.

```bash
pnpm hardkas localnet fork --network testnet-10
```

The simulator state is always saved to `.hardkas/localnet.json`.

## The Dashboard

HardKAS includes a local dashboard to visualize your artifacts, causal graphs, and telemetry stream in real-time.

```bash
pnpm hardkas dev
```

The dashboard is completely disposable and derived from your `.hardkas/` directory. It does not own any authoritative truth.

## Troubleshooting State

If your dashboard or queries seem out of sync, the SQLite projection may have fallen behind. You can safely rebuild it:

```bash
pnpm hardkas rebuild --from-artifacts
```
This command destroys the local index and rebuilds it strictly from the `events.jsonl` and `artifacts/` folder.
