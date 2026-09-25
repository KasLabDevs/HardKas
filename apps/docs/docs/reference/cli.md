---
title: CLI reference
---

The CLI reference is generated from the Commander command tree. Do not maintain flags manually in docs; regenerate from code.

Core and diagnostics

`hardkas doctor`Full system diagnostic and health report.

`--json`

Machine-readable output

`hardkas capabilities`Machine-readable capability and trust-boundary report.

`--json`

Machine-readable output

`hardkas init [name]`Initialize HardKAS config in a project.

`hardkas init <name>`Create project scaffolding.

`--template <type>`

Project template (default: basic)

`--network <name>`

Default network (default: simnet)

`--accounts <n>`

Number of Synthetic accounts (default: 3)

`--skip-install`

Skip pnpm install

`hardkas config show --json`Show resolved configuration.

`hardkas networks`List configured networks.

`--json`

Machine-readable output

Development runtime

`hardkas dev doctor --profile igra --json`Validate Igra/local dev readiness.

`hardkas dev server`Start local dev server and dashboard.

`--port <n>`

Server port (default: 7420)

`--host <host>`

Bind host (default: localhost)

`--open`

Open dashboard in browser

`--unsafe-external`

Allow non-localhost connections

`hardkas dashboard --start-server`Open dashboard, starting server when needed.

`hardkas local wizard --profile igra`Guided local setup.

`hardkas console`Interactive REPL with SDK loaded.

`--network <name>`

Network name (default: simnet)

`--accounts <n>`

Synthetic accounts (default: 3)

`--balance <sompi>`

Initial balance per account

`hardkas run <script>`Run TS/JS file with HardKAS harness injection.

`--network <name>`

Network name (default: simnet)

`--accounts <n>`

Synthetic accounts (default: 3)

`--balance <sompi>`

Initial balance per account

`--no-harness`

Skip harness injection

`hardkas test [pattern]`Run project tests with HardKAS test helpers.

`--mass-report`

Show mass/fee report after tests

`--mass-snapshot <label>`

Save mass snapshot for regression

`--mass-compare <label>`

Compare against saved snapshot

Accounts and wallets

`hardkas session create <name>`Create a local developer session binding L1/L2 identities.

`--l1 <wallet>`

Name of the Kaspa L1 wallet (required)

`--l2 <account>`

Name of the Igra L2 account (required)

`hardkas accounts list --json`List configured accounts.

`hardkas accounts balance <identifier> --json`Show account balance.

`hardkas accounts real init`Initialize encrypted dev account store.

`hardkas accounts real generate`Generate persistent dev accounts.

`hardkas accounts real import`Import an account safely.

`hardkas accounts real session-open <name>`Verify keystore access and mark local signing intent.

`hardkas kaspa wallet create <name>`Create local Kaspa wallet.

`hardkas metamask network --profile igra`Show MetaMask local Igra network settings.

Kaspa L1 and node

`hardkas localnet start`Start Docker Kaspa node.

`hardkas localnet status --json`Check node status.

`hardkas kaspa doctor --json`Verify local Kaspa L1 readiness.

`hardkas kaspa wallet send from to --amount 1 --dry-run`Plan local wallet send.

`hardkas localnet fund <identifier> --amount 1000`Local-only funding helper.

`hardkas localnet fork --network testnet-10 --json`Fork UTXO state into local simulation preview.

Igra L2

`hardkas l2 networks --json`List L2 profiles.

`hardkas l2 profile show igra --json`Show Igra profile details.

`hardkas l2 balance <address> --network igra --json`Check L2 balance.

`hardkas l2 nonce <address> --network igra --json`Check L2 nonce.

`hardkas l2 tx build --from ... --to ... --value 0 --json`Build L2 transaction plan.

`hardkas l2 tx sign plan.json --account bob`Sign L2 plan.

`hardkas l2 tx send signed.json --yes`Submit signed L2 transaction.

`hardkas l2 contract deploy-plan --bytecode 0x...`Build L2 contract deployment plan.

Artifacts, query and replay

`hardkas deploy track <label>`Track deployment status and link it to artifacts.

`--network <name>`

Network where deployed

`--tx-id <txId>`

Transaction ID

`--plan <artifactId>`

Reference to plan artifact

`--status <status>`

Deployment status (default: sent)

`--notes <text>`

Notes

`hardkas artifact verify path --strict`Verify artifact integrity.

`hardkas query store sync --json`Index artifacts into SQLite read model.

`hardkas query artifacts list --limit 100`List indexed artifacts.

`hardkas query artifacts inspect <target> --explain full`Deep structural analysis.

`hardkas query lineage chain <anchor> --why`Explain artifact lineage.

`hardkas replay verify path --json`Verify local replay invariants.

Fork state and test deterministic hashing

**localnet Copy**

```typescript
hardkas localnet fork --network testnet-10
hardkas tx plan --to qz... --amount 1000
hardkas tx sign ./artifacts/plan.json --account dev
hardkas verify --strict
```

**sample output**

```typescript
Strict verification:
  Sorting:     byte-level deterministic
  Boundaries:  enforced (.hardkas/ context)
  Hash match:  passed
```

Replay causal graph from a crashed workspace

**replay Copy**

```typescript
hardkas doctor --json
hardkas repair --dry-run
hardkas rebuild --from-artifacts
hardkas replay verify path --json
```

**sample output**

```typescript
Rebuild complete:
  Events parsed:  1542
  Artifacts:      128
  Conflicts:      0

Replay Verification:
  Status:         VERIFIED
  Causal Graph:   intact
```
