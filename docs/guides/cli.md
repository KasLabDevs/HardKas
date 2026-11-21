# CLI Guide

The HardKAS CLI (`hardkas` or `npx hardkas`) is the main local developer
interface. The generated [command reference](../reference/cli.md) lists every
command, but the happy path is intentionally small.

## 1. Local Transaction Lifecycle

Shortcut flow:

```bash
hardkas tx send --from alice --to bob --amount 10 --network simulated --yes
```

Explicit artifact flow:

```bash
hardkas tx plan --from alice --to bob --amount 10 --network simulated --out tx-plan.json
hardkas artifact inspect tx-plan.json
hardkas artifact verify tx-plan.json --strict
hardkas tx sign tx-plan.json --account alice --out tx-signed.json
hardkas tx send tx-signed.json --network simulated --yes
```

## 2. Accounts

```bash
hardkas accounts list
hardkas accounts balance alice --network simulated
hardkas simulator fund alice --amount 1000
```

`simulator fund` adds synthetic UTXOs on the simulated ledger. On simnet, fund a
real account with `hardkas localnet fund <account>` (mined, or with `--treasury`
from the localnet Treasury). `accounts fund` is deprecated. Mainnet is locked
down: HardKAS is not a mainnet wallet.

## 3. Artifacts

```bash
hardkas artifact inspect tx-plan.json
hardkas artifact verify tx-plan.json --strict
hardkas artifact lineage tx-signed.json
hardkas artifact explain tx-signed.json
```

Artifacts are the audit boundary between planning, signing, sending and replay. An artifact's id is its
`contentHash`; [Artifact Auditing](./artifact-auditing.md) covers `verify`, `explain` and `why`.

## 4. Query Store

The query store is a rebuildable SQLite projection (`.hardkas/store.db`). No
transaction command creates it: build it first, then index new artifacts with
`sync`.

```bash
hardkas query store rebuild
hardkas query store sync
hardkas query store doctor
hardkas query artifacts list
hardkas query lineage chain <artifact_id>
```

If it drifts, rebuild it from the canonical filesystem artifacts with
`hardkas query store rebuild` again. Every query command and filter is in the
[Query Store guide](./query-store.md).

## 5. Replay And Diagnostics

```bash
hardkas replay verify <receipt>
hardkas verify
hardkas doctor
```

`replay verify` needs a simulated receipt: its artifact id, or a path such as
`.hardkas/artifacts/receipts/txReceipt-<id>.json`. A real-node send records a
`TxSubmission`, not a receipt, and is not replayed.

Use `verify` for workspace-level integrity and `artifact verify --strict`
for a specific artifact or directory; neither replays anything
([Replay Verification](./replay-verification.md), [Debugging](./debugging.md)).
