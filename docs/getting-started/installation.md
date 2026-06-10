# Installation

HardKAS is distributed through npm packages and is developed against Node.js
`>=22.5.0`.

For deterministic projects, install the CLI and SDK locally:

```bash
npm install @hardkas/sdk@0.9.1-alpha
npm install -D @hardkas/cli@0.9.1-alpha
```

You can then run the CLI with:

```bash
npx hardkas --help
```

or, depending on your package manager resolution:

```bash
npx @hardkas/cli --help
```

## Packages

- `@hardkas/cli`: command-line workspace, artifact, tx, query, and dashboard
  tools.
- `@hardkas/sdk`: programmatic API for planning, signing, simulating, artifacts,
  replay, lineage, and local workspace access.
- `@hardkas/client`: HTTP client for the HardKAS dev-server.
- `@hardkas/react`: React hooks for dashboard-style local apps.

## Local-First Default

Start with `simulated`. It requires no node, no faucet, no network, and no real
funds.

```bash
npx hardkas init .
npx hardkas tx send --from alice --to bob --amount 10 --network simulated --yes
```

Use `simnet` or testnet only after your local artifact workflow is stable.
