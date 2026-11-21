---
title: Debugging
description: Diagnose a workspace and its node with doctor and the rpc commands, and check a node send step by step.
---

# Debugging

Diagnose from evidence, not guesses: every check below prints what it saw, and `--json` gives the stable `code` of a
failure. The codes and their fixes are in the [errors reference](../reference/errors.md) and in
[AI Troubleshooting & Error Codes](../ai/troubleshooting.md).

## 1. The workspace: `hardkas doctor`

```bash
hardkas doctor
hardkas doctor --json
```

`doctor` checks the local configuration, then the workspace's node: connectivity, network identity, sync and, with
`--flow payment,silver,covenant`, its capability for those flows. Mainnet is never contacted. A report with a failed
check exits 1; warnings and skips exit 0. The report is the same either way, so a script can rely on the exit code or
read `summary.failed` and each `checks[].code` from the `hardkas.doctor.v1` JSON.

- `--network <name>` checks the node of that network of the workspace config, `--url <url>` a node at that endpoint,
  and `--timeout <ms>` bounds the node check (default 8000).
- `--strict` runs the consistency checks in strict mode and raises `DOCTOR_FAILED` when one fails.
- `hardkas doctor workspace` runs the L1 workspace checks only (`--release` adds the release checks);
  `hardkas doctor node` checks the managed localnet container (`NODE_NOT_RUNNING`, `RPC_NOT_READY`;
  `--capabilities` reports RPC, network and DAA advance as JSON); `hardkas doctor signer` checks the signer.

`hardkas status` shows the workspace's runtime state, `hardkas config show` its configuration, and `hardkas env check`
the `HARDKAS_*` environment variables HardKAS honours (and any it does not know).

## 2. The node: `hardkas rpc`

```bash
hardkas rpc health
hardkas rpc info --network simnet
hardkas rpc dag
hardkas rpc mempool <txId>
hardkas rpc utxos <address>
hardkas rpc doctor --endpoints <url-a> <url-b>
```

- `rpc health` checks that a node answers and is ready (default: the canonical localnet, `ws://127.0.0.1:18210`;
  `--url` or `--network` for another; `--wait` with `--timeout <ms>` waits for it). Not ready, it exits 1 with
  `RPC_CONNECTION_FAILED` or `RPC_TIMEOUT` (the node cannot be reached) or `RPC_NOT_READY` (it answers but is not
  ready).
- `rpc info` shows the node's network, version, sync state and UTXO index (`RPC_INFO_UNAVAILABLE` when it does not
  answer). `--network <name>` uses the endpoint the workspace declares, and the node must prove it serves that network.
- `rpc dag` shows the network, virtual DAA score, sink and tips. `rpc mempool [txId]` looks a transaction up in the
  mempool, or lists it. `rpc utxos <address>` lists the UTXOs the node holds for an address.
- `rpc doctor --endpoints` probes each endpoint (TCP, wRPC connection, server and DAG info). Endpoints are separated by
  **spaces**; commas are not split. It exits 1 with `RPC_DOCTOR_NOT_READY` when any endpoint is not ready, and names
  each one.
- `rpc compare --endpoints <url-a> <url-b> --network <id>` reads several nodes side by side, read-only. Agreement among
  nodes is not consensus validation.

A mainnet endpoint is refused before anything is read (`MAINNET_CONNECTION_DISABLED`).

## 3. A node send, step by step

Before you send on simnet (or testnet-10, behind its opt-in), check each step's evidence before the next one:

```bash
hardkas doctor --json
hardkas rpc info --network simnet
hardkas accounts balance <account> --network simnet
hardkas tx plan --from <account> --to <address> --amount <kas> --network simnet --out plan.json
hardkas artifact inspect plan.json
hardkas tx sign plan.json --account <account> --password-env <VAR> --out signed.json
hardkas tx send signed.json --network simnet --wait
hardkas explain --tx <txId>
```

1. `doctor` reports no failed check.
2. `rpc info` names the network you expect and says the node is synced.
3. The balance covers the amount plus the fee.
4. The plan's recipients and amounts are the ones you intend. Read it before signing.
5. `tx send --wait` returns the `txId` and reaches `CONFIRMED`. A node send records a `TxSubmission` under
   `.hardkas/artifacts/receipts/`; `explain --tx` tells its story.

If the send fails or times out, do not resend and do not delete anything. `TX_SEND_WAIT_FAILED` means the transaction
**was** submitted: follow the same txId with `hardkas tx status <txId>` (its derived state) and
`hardkas tx wait <txId>`. Then match the error `code` in the [errors reference](../reference/errors.md) and the
[Troubleshooting guide](./troubleshooting.md).

## 4. Local stores

- **Stale index.** When `hardkas query store doctor` reports issues, the SQLite index is out of step with the
  artifacts: rebuild it with `hardkas query store rebuild` ([Query Store](./query-store.md)).
- **Telemetry.** `hardkas telemetry verify` checks each line of the `.hardkas/telemetry/telemetry.jsonl` stream against
  Telemetry Source Contract v1. When it fails (`TELEMETRY_VERIFICATION_FAILED`), it prints the line number and the
  violation of every bad line. No stream means no anomalies were recorded, which passes
  ([Event Ledger and Telemetry](./telemetry.md)).
- **Locks and torn files.** `hardkas repair` reports lock files, torn JSONL tails and a corrupt store; `--force`
  repairs them ([Operator Commands](./operator-commands.md)).
- **Evidence.** `hardkas verify`, `hardkas explain` and `hardkas why` read the artifacts themselves
  ([Artifact Auditing](./artifact-auditing.md)).
