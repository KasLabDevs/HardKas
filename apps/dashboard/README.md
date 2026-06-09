# `@hardkas/dashboard`

The dashboard is the local HardKas workspace viewer. It observes artifacts, transactions, replay status, query-store health, lineage, telemetry, and dashboard API availability.

It is not a wallet and it should not invent state. The UI reads the local dev-server/dashboard API and displays what the workspace can prove.

## Run Locally

From the repo root:

```bash
pnpm --filter @hardkas/dashboard dev
```

The app expects the HardKas dashboard/dev API on:

```text
http://localhost:7420
```

Start the CLI-side dashboard/server flow separately when needed:

```bash
hardkas dashboard
```

## Useful Local Flow

Generate local data first:

```bash
hardkas init
hardkas tx send --from alice --to bob --amount 1 --network simulated --yes
hardkas query store sync
```

Then open the dashboard and check:

- workspace health
- artifact list
- transaction receipts
- replay/lineage state
- query-store drift

## Boundary

The browser app should use `@hardkas/react` and `@hardkas/client`. It should not import `@hardkas/sdk` directly because the SDK is Node-oriented and depends on filesystem/runtime packages.
