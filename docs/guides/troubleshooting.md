---
title: Troubleshooting
description: Find the failing boundary, know what is safe to delete, and recover a HardKAS workspace, node or account without losing evidence.
---

# Troubleshooting

When a HardKAS command fails, do not guess: find the boundary that failed, read its evidence, then take the least
destructive recovery. Pass `--json` to any command to get the error's stable `code`; the codes and their fixes are in
the [errors reference](../reference/errors.md) and in [AI Troubleshooting & Error Codes](../ai/troubleshooting.md).

Create a project folder, initialize it, and run every command of the chapter from inside it:

```bash
mkdir troubleshoot-project
cd troubleshoot-project
```

```bash execute
hardkas init
```

The primary diagnostic tool is the `doctor` command, which scans the workspace for missing configurations, corrupt artifacts, or unreachable nodes.

```bash execute
hardkas doctor
```

The CLI works on one workspace root: the nearest directory, at or above the current one, that holds a `hardkas.config.*`, else the current directory itself (`--workspace <path>` names another). The SDK refuses a workspace that has no `.hardkas/` folder with `NOT_INITIALIZED`: run `hardkas init` there first, or open it with `autoBootstrap: true`.

## Find the boundary first

Every operation follows one causal chain:

`configuration` → `workspace` → `node / RPC` → `transaction` → `artifact` → `evidence`

Find the earliest link that failed. A workspace failure is fundamentally different from a node failure:

1. **The CLI process (`hardkas`)** reads `.hardkas/`, plans, signs and talks to the node. It is ephemeral: it holds
   nothing between commands.
2. **The node** is a Kaspa daemon (rusty-kaspad). HardKAS runs none inside its own process, except the simulator. The
   localnet started by `hardkas localnet start --toccata` is a Docker container (`hardkas-kaspad-toccata-v2`) with its
   miner (`hardkas-toccata-miner`), one per machine; `hardkas localnet stop` stops both.
3. **The network** is the one the node is connected to.

| Environment | Where it runs | Its state |
| :--- | :--- | :--- |
| Simulator | inside each CLI command | `.hardkas/localnet.json` |
| Localnet (simnet) | a Docker container in the background | the chain in `.hardkas/kaspad/` of the workspace that started it |
| testnet-10 (opt-in) | an external node | the public network |

Mainnet is locked down: no keys, no connection, no broadcast.

## What is safe to delete

> [!CAUTION]
> Never run a destructive command (`rm -rf`, a reset) before you know which data can be reproduced and which is lost
> for good. No destructive recovery is right unless the state is ephemeral, fully reproducible, or irrelevant.

**Never delete (irreversible):**

- `.hardkas/accounts.real.json` and `.hardkas/keystore/`. `accounts.real.json` holds references to the encrypted
  keystores in `.hardkas/keystore/` (a plaintext key only for an account imported with `--unsafe-plaintext`). Deleting
  them destroys the keys, and the funds with them, unless you can restore the key or the recovery phrase.
- `.hardkas/wallets/`: the encrypted HD wallets.
- `.hardkas/artifacts/`: the plans, signed transactions, receipts and submissions. The node holds the transaction, but
  without the artifact HardKAS can no longer track, explain or prove what was intended.
- `events.jsonl` at the workspace root: the append-only event ledger.

**Rebuildable:**

- `.hardkas/store.db` (the query store) is a derived read model: `hardkas query store rebuild` makes it again from the
  artifacts and the event ledger.
- `.hardkas/kaspad/` is the localnet's chain. It can be "rebuilt" only in the sense that a new chain can be mined: every
  localnet balance, deployment and pending transaction of the old chain is gone. Reset it with `hardkas localnet reset`
  (below), never by hand while the node runs.
- `.hardkas/localnet.json` is the simulator's ledger. Deleting it erases the simulated balances, and
  `hardkas replay verify` rebuilds its state from this file.

## Symptoms

### The node does not answer: `RPC_CONNECTION_FAILED`, `RPC_TIMEOUT`

**Boundary:** node / localnet. **Check:** `hardkas rpc health`, `hardkas doctor`, then `docker ps` and
`docker logs hardkas-kaspad-toccata-v2`.
**Recover:** start the localnet with `hardkas localnet start --toccata`. `LOCALNET_DOCKER_UNAVAILABLE` means Docker is
not running; `LOCALNET_PORT_CONFLICT` means another node already serves the localnet's port. For another endpoint, check
the `rpcUrl` of the network in `hardkas.config.ts`.

### The node is not synced: `NODE_NOT_SYNCED`

**Boundary:** node. **Check:** `hardkas rpc info --network simnet` (sync state). A fresh simnet node with no miner says
it is not synced until it mines a block. **Recover:** keep the localnet miner running, then retry.

### Nothing to spend: `NO_SPENDABLE_UTXOS`, `INSUFFICIENT_FUNDS_UPSTREAM`

**Boundary:** planning / UTXO state. **Check:**

```bash
hardkas accounts balance <account> --network simnet
hardkas rpc utxos <address> --network simnet
```

Coinbase outputs are spendable only once mature (1,000 DAA on simnet), and outputs held by
your own pending transactions are not selectable. **Recover:** fund the account (`hardkas localnet fund <account>`), or
wait for the pending transaction (`hardkas tx wait <txId>`). `MULTI_TRANSACTION_PLAN_REQUIRED` means the inputs do not
fit in one transaction: consolidate first with `hardkas accounts consolidate <account> --network simnet --execute --yes`.

### Inputs spent while planning: `SELECTED_UTXO_INVALIDATED`

**Boundary:** concurrent sends from one account. The planner re-checks at the node that each selected input is still
unspent and retries a bounded number of times; it fails with this code when another transaction keeps spending them.
**Recover:** wait for the competing transaction (`hardkas tx wait <txId>`), then plan again.

### Artifact integrity: `ARTIFACT_HASH_MISMATCH`

**Boundary:** workspace / artifact storage. The file's content no longer hashes to the `contentHash` it carries: it was
edited after it was written. **Check:** `hardkas artifact inspect <file>`; compare it with the copy in
`.hardkas/artifacts/`. **Recover:** do not delete it at once (it may be the only copy of a signed transaction or a
covenant id). If it was never submitted, regenerate it from the last intact step (`hardkas tx plan`, `hardkas tx sign`).
If it was submitted, keep it as a record, never edit hashes by hand, and follow the transaction by its txId
(`hardkas tx status <txId>`).

### The node rejects the request shape: `RPC_SCHEMA_ERROR`

**Boundary:** node version. `tx plan` raises it when the node rejects the payload of its UTXO request. **Check:**
`hardkas rpc info --json` for the node's version. **Recover:** use a node of the version HardKAS targets
(rusty-kaspad 2.1.0, the Toccata release), or check the address formats you passed.

### Replay: `REPLAY_MODE_UNSUPPORTED`, `REPLAY_DIVERGED`

`hardkas replay verify <receipt>` takes one simulator receipt; a node send is `REPLAY_MODE_UNSUPPORTED` and is checked
with `hardkas tx status <txId>` instead. `REPLAY_DIVERGED` means the re-execution produced another outcome than the
receipt: inspect the report (`hardkas replay verify <receipt> --json`) and ask what changed (the simulator state, the
network parameters, the toolchain). A diverged replay is not fixed by editing artifacts
([Replay Verification](./replay-verification.md)).

### A send whose outcome you do not know: `TX_SEND_WAIT_FAILED`, `TX_ALREADY_SUBMITTED`

The transaction was submitted, or an earlier submission is recorded. Never resend blindly: `hardkas tx status <txId>`
shows its derived state, and `hardkas tx wait <txId>` keeps waiting on the same txId.

### The dev server refuses to send: `SEND_GUARD_LOCK_STALE`

A dev server was stopped without running its handlers and left its send-guard lock. Stop every dev server on the
workspace, then run `hardkas dev recover-lock --pid <pid>` with the pid the refusal names
([errors reference](../reference/errors.md#dev-server-send-guard)).

## Recover, least destructive first

1. **The query store:** `hardkas query store rebuild`. It flushes the SQLite index and reads the artifacts and the
   event ledger again; no canonical data is lost.
2. **Lock files, torn JSONL tails, a corrupt store:** `hardkas repair` reports them; `hardkas repair --force` applies
   the repairs. `--force` removes lock files without checking whether their process is alive, so stop every other
   HardKAS process on the workspace first ([Operator Commands](./operator-commands.md)).
3. **The local node** (it halted, forked or holds a chain you no longer want, and you accept losing its balances):

   ```bash
   hardkas localnet reset
   hardkas localnet start --toccata
   ```

   `localnet reset` stops the toccata-v2 node and its miner, checks that each is down, then removes only this
   workspace's `.hardkas/kaspad`. It keeps the dev accounts and their keys, and the workspace's artifacts and records
   (those of the old chain then describe a chain that is gone). It asks for confirmation; `--yes` gives it, and
   `--json` needs `--yes`. `--wait-lock` and `--lock-timeout <ms>` wait for the workspace lock. It refuses, before
   anything is stopped or removed, when the running node keeps its chain in another workspace
   (`LOCALNET_RESET_OTHER_WORKSPACE`) or Docker names no data folder for it (`LOCALNET_RESET_DATA_UNVERIFIED`): stop the
   localnet first, or reset from the workspace that started it.
   *Lost:* every localnet balance, deployment and pending transaction. *Kept:* accounts, keys, artifacts, config.
4. **An account's keys** (you lost or damaged `.hardkas/accounts.real.json` or `.hardkas/wallets/`):

   ```bash
   hardkas wallet hd import --name <name> --network <network> --mnemonic-env <VAR> --password-env <VAR>
   hardkas accounts real import --name <name> --address <address> --private-key-env <VAR> --password-env <VAR>
   ```

   - An HD wallet whose recovery phrase you backed up: recover it with `hardkas wallet hd import` (phrases belong to
     `hardkas wallet hd`).
   - A key you kept: import it again with `hardkas accounts real import`. It takes a private key, never a phrase.
   - A random key you never backed up: **the funds are lost.** HardKAS cannot recover keys.
