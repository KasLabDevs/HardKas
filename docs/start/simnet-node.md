---
title: "Run a local Kaspa simnet node (rusty-kaspad in Docker)"
sidebar_label: "Run your own simnet node"
description: Run rusty-kaspad v2.1.0 and a CPU miner in Docker, by hand or as the managed localnet, point your workspace at it, stop it, or start over.
url: /localnet
---

# Run your own simnet node

This page starts a real Kaspa node of your own in Docker: the `rusty-kaspad`
release HardKAS pins, on **simnet** (a private local network), plus the upstream
CPU miner that produces its blocks. Your HardKAS workspace then plans, signs and
sends against it like against any node.

It is part of [Build on your own simnet](./build-on-simnet.md). You need Docker
and an initialized workspace ([Install HardKAS](./installation.md#initialize-the-workspace)).
If you would rather let HardKAS run the node for you (fixed names and ports, one
per machine), see [The managed localnet](#the-managed-localnet) at the end of
this page.

> [!IMPORTANT]
> A simnet node is its own chain. What it accepts is evidence about that node
> only: not about devnet, testnet-10 or mainnet, and not about another simnet
> node (a second simnet node is a different chain with the same name).

## 1. What you run

| Container | Image (pinned by digest) | Role | Ports |
| :-- | :-- | :-- | :-- |
| `my-simnet` | `kaspanet/rusty-kaspad:v2.1.0@sha256:f85da74b9514584451f83a2cbea3aa93f700248302fe7e3e0ab17288f93c905b` | the node | wRPC (JSON) published on `127.0.0.1:26510`; gRPC `26511` and P2P `26512` stay inside the container |
| `my-simnet-miner` | `kaspanet/cpuminer@sha256:60f78ab2828ab24b249c99210eee5a2825303a5226154260dd021ff26d46748b` | mines blocks to one address | none: it joins the node's network namespace and talks to gRPC `26511` |

These are the images HardKAS itself pins (`KASPAD_REFERENCE_IMAGE` and
`CPUMINER_REFERENCE_IMAGE` in `@hardkas/core`); `npx hardkas doctor` shows the
node image as `kaspad image`. The names and ports are free choices. Avoid
16210, 17210 and 18210: HardKAS's managed localnet (`hardkas localnet start`, a
separate, fixed setup) publishes its gRPC, Borsh wRPC and JSON wRPC there, on
`127.0.0.1`. Avoid 16110, 17110 and 18110 too: they are the node's own defaults
(gRPC, Borsh wRPC, JSON wRPC) and another local node may already hold them.

To fetch the images ahead of time (the first `docker run` does it otherwise):

```bash
docker pull kaspanet/rusty-kaspad:v2.1.0@sha256:f85da74b9514584451f83a2cbea3aa93f700248302fe7e3e0ab17288f93c905b
docker pull kaspanet/cpuminer@sha256:60f78ab2828ab24b249c99210eee5a2825303a5226154260dd021ff26d46748b
```

## 2. Start the node

The node keeps its data in a folder of yours (a bind mount), so stopping or even
removing the container does not lose the chain.

bash / zsh:

```bash
mkdir -p "$HOME/hardkas-simnet"
docker run -d --name my-simnet \
  -p 127.0.0.1:26510:26510 \
  -v "$HOME/hardkas-simnet:/app/data" \
  kaspanet/rusty-kaspad:v2.1.0@sha256:f85da74b9514584451f83a2cbea3aa93f700248302fe7e3e0ab17288f93c905b \
  kaspad --yes --nologfiles --disable-upnp --simnet --utxoindex --appdir=/app/data \
  --rpclisten=127.0.0.1:26511 --rpclisten-json=0.0.0.0:26510 --listen=127.0.0.1:26512 \
  --enable-unsynced-mining --externalip=127.0.0.1 --nodnsseed
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force "$HOME\hardkas-simnet" | Out-Null
docker run -d --name my-simnet `
  -p 127.0.0.1:26510:26510 `
  -v "${HOME}\hardkas-simnet:/app/data" `
  kaspanet/rusty-kaspad:v2.1.0@sha256:f85da74b9514584451f83a2cbea3aa93f700248302fe7e3e0ab17288f93c905b `
  kaspad --yes --nologfiles --disable-upnp --simnet --utxoindex --appdir=/app/data `
  --rpclisten=127.0.0.1:26511 --rpclisten-json=0.0.0.0:26510 --listen=127.0.0.1:26512 `
  --enable-unsynced-mining --externalip=127.0.0.1 --nodnsseed
```

| Flag | Why |
| :-- | :-- |
| `--simnet` | the private simulation network (address prefix `kaspasim:`) |
| `--utxoindex` | HardKAS reads UTXOs by address; without the index it cannot plan |
| `--rpclisten-json=0.0.0.0:26510` | wRPC with JSON encoding, what HardKAS speaks. `0.0.0.0` inside the container; `-p 127.0.0.1:…` publishes it on your loopback only |
| `--rpclisten=127.0.0.1:26511` | gRPC, for the miner (inside the container's network namespace) |
| `--listen=127.0.0.1:26512 --nodnsseed --disable-upnp --externalip=127.0.0.1` | no peers: the node is alone |
| `--enable-unsynced-mining` | a fresh node with no peers accepts its first blocks |
| `--appdir=/app/data` | the chain lives in the mounted folder |
| `--yes --nologfiles` | no prompts; logs go to `docker logs my-simnet` |

Check that it answers (a node that has never mined says it is not synced):

```bash
npx hardkas rpc info --url ws://127.0.0.1:26510
```

```text
URL:          ws://127.0.0.1:26510
Network:      simnet
Version:      2.1.0
Synced:       no
UTXO index:   yes
Virtual DAA:  0
```

## 3. Start the miner

The miner pays every block reward to one address: an account of your workspace.
Create it first ([Quickstart, step 1](./quickstart-simnet.md#1-create-two-accounts)),
then start the miner with its address. Start the miner only once the node
answers: a miner started before the node listens on gRPC exits at once (start
it again with `docker start my-simnet-miner`).

```bash
docker run -d --name my-simnet-miner --network container:my-simnet kaspanet/cpuminer@sha256:60f78ab2828ab24b249c99210eee5a2825303a5226154260dd021ff26d46748b --mining-address <miner-address> --kaspad-address 127.0.0.1 --port 26511 --threads 1 --mine-when-not-synced --throttle 20
```

Replace `<miner-address>` with the account's `kaspasim:…` address, as
`accounts real generate` printed it.

`--throttle 20` (milliseconds between hashes) is a local knob that keeps the
miner from outrunning the node on a laptop. It is not a Kaspa parameter. With it,
the test machine produced between about 5 and 25 blocks a second, depending on
its load.

## 4. Point the workspace at the node

`hardkas init` declares a `simnet` network whose endpoint is the managed
localnet's (`ws://127.0.0.1:18210`). Open `hardkas.config.ts` and change that
`rpcUrl` to your node:

```typescript
    simnet: {
      kind: "kaspa-node",
      network: "simnet",
      rpcUrl: "ws://127.0.0.1:26510", // was ws://127.0.0.1:18210
      description: "Local Docker kaspad on simnet — requires hardkas localnet start --toccata"
    }
```

Leave the rest as it is (the `description` is only a label). Every command that takes `--network simnet` now uses
your node, and `--url ws://…` still overrides it for one command. Check:

```bash
npx hardkas config networks
npx hardkas rpc info --network simnet
npx hardkas silver doctor --network simnet
```

`rpc info --network simnet` asks the declared endpoint and checks that the node
serves simnet. `silver doctor` reports the toolchains and whether that node is
ready for SilverScript and covenants; a node that is not synced is reported as
not ready. HardKAS proves a node it does not manage by what the node reports
(network, version, not the simulator, synced): it does not inspect your
container or its image.

## 5. Wait for coinbase maturity

A block reward cannot be spent until it is deep enough: on simnet, 1,000 DAA
after its block (observed against rusty-kaspad v2.1.0: one DAA short is refused,
1,000 is accepted). Until then the balance counts the outputs but planning skips
them:

```bash
npx hardkas accounts balance miner --network simnet
npx hardkas rpc info --network simnet
```

When `Virtual DAA` is past about 1,100 and `Synced: yes`, the oldest rewards
are spendable. With the throttle above that took about a minute. Before that,
`tx plan` refuses with `NO_SPENDABLE_UTXOS … (N UTXO(s) found, none mature …)`
([Common errors](./common-errors.md#no_spendable_utxos)).

## 6. Keep it synced while you work

A node with no peers says "synced" only while it receives recent blocks. Keep
the miner running while you send and wait: `tx wait` needs new blocks to reach
the 100 blue-score confirmations of HardKAS's policy, and commands that need the
current chain state (`tx plan`, `tx send`, `tx wait`, `silver deploy|spend`,
`silver covenant genesis|transition`) refuse a node that does not say it is
synced (`NODE_NOT_SYNCED`).

The miner pays every block to one address, so that account collects thousands
of small outputs per hour (about 3,000 in the first two and a half minutes of
the test run). Stop the miner when you are not using the node; a very large
number of outputs makes planning slow, and `npx hardkas accounts consolidate`
(alpha) merges them.

## 7. Stop and restart without losing data

```bash
docker stop my-simnet-miner
docker stop my-simnet
```

The chain stays in `~/hardkas-simnet` (the bind mount). Start the node first,
then the miner, which joins the node's network namespace:

```bash
docker start my-simnet
docker start my-simnet-miner
npx hardkas rpc info --network simnet
```

In the test run, the node came back with the same `Virtual DAA` it had when it
stopped (9143), and the miner resumed.

To start over with an empty chain, remove both containers and delete the data
folder, then repeat steps 2 and 3. Records from the old chain then name
transactions the new one never had: `artifact verify` reports them
`NOT_OBSERVED` on it.

```bash
docker rm my-simnet-miner my-simnet
```

## The managed localnet

`hardkas localnet start --toccata` (the same as `--profile toccata-v2`; one of
the two is required, otherwise `LOCALNET_PROFILE_REQUIRED`) runs a node and a
miner that HardKAS manages itself (alpha). It uses the same pinned images as
above, with fixed container names (`hardkas-kaspad-toccata-v2` and
`hardkas-toccata-miner`) and fixed ports on `127.0.0.1`: gRPC 16210, Borsh wRPC
17210 and JSON wRPC 18210, the endpoint `init` declares for `simnet`. HardKAS
proves the node by its container and image digest. The chain lives in the
workspace that started the node, in `.hardkas/kaspad`.

There is one managed localnet per machine. `localnet start` in a second
workspace adopts the running node, whose chain stays in the first workspace's
folder. If something HardKAS does not manage already answers on 18210, the start
is refused (`LOCALNET_PORT_CONFLICT`). The rest of this page uses a node of your
own instead: your names, your ports, your data folder, and the same pinned image.

### A first payment on the managed localnet

These commands reach the node through the `simnet` endpoint `init` writes
(`ws://127.0.0.1:18210`); if you pointed it at a node of your own
([step 4](#4-point-the-workspace-at-the-node)), set it back first. The keystore
password is read from `HARDKAS_PASSWORD`, set as in
[Quickstart, step 1](./quickstart-simnet.md#1-create-two-accounts).

```bash
npx hardkas localnet start --toccata
npx hardkas localnet status
npx hardkas accounts real generate --name miner --network simnet --password-env HARDKAS_PASSWORD
npx hardkas accounts real generate --name ana --network simnet --password-env HARDKAS_PASSWORD
npx hardkas localnet fund miner
npx hardkas tx plan --from miner --to ana --amount 10 --network simnet --out plan.json
npx hardkas tx sign plan.json --account miner --password-env HARDKAS_PASSWORD --out signed.json
npx hardkas tx send signed.json --network simnet --yes --wait
npx hardkas tx status <txId>
npx hardkas accounts balance ana --network simnet
```

- `localnet start` also creates the dev accounts `alice` … `erin` in
  `.hardkas/dev-accounts/`. Their keys come from a fixed seed, the same in every
  workspace, so they are for simnet only.
- `localnet fund` mines until the account's spendable (mature) balance has grown
  by `--amount` (default 1000 KAS), within `--timeout` (default 300000 ms).
  Afterwards a miner keeps running, paying its rewards to an address nobody can
  spend, so new blocks keep arriving and transactions confirm. `--keep-miner`
  keeps mining to the funded account instead; `--stop-miner` leaves the chain
  stopped.
- `tx send --wait` waits until the transaction is `CONFIRMED` (60 seconds by
  default, `--wait-timeout`). Not reaching it in time is `TX_SEND_WAIT_FAILED`:
  the transaction was still submitted.
- The send records a `TxSubmission`. `replay verify` refuses it
  (`REPLAY_MODE_UNSUPPORTED`): replay exists for simulated receipts only. Check a
  node send with `artifact verify --network simnet` and `tx status`
  ([Reading receipts and verification levels](./receipts-and-levels.md)).

### Stop, or start over from an empty chain

```bash
npx hardkas localnet stop
npx hardkas localnet reset
```

`localnet stop` stops the node and its miner, and reports success only once
Docker shows each one down. The chain stays in `.hardkas/kaspad`, and
`localnet start --toccata` resumes it.

`localnet reset` starts the localnet over from an empty chain (alpha). It stops
the node and its miner, each verified down, then removes only this workspace's
chain data, `.hardkas/kaspad`. It keeps the dev accounts and their keys, and
the workspace's artifacts and records; those that name the old chain's
transactions then describe a chain that no longer exists (`artifact verify`
reports them `NOT_OBSERVED`). Run `localnet start --toccata` afterwards for a
fresh chain.

- It asks before it removes anything. `--yes` confirms without asking, and
  `--json` needs `--yes` (`INTERACTIVE_PROMPT_IN_JSON_MODE` otherwise).
- It runs only inside a workspace (`WORKSPACE_NOT_FOUND` otherwise).
- Before anything is stopped or removed, it refuses a running node whose chain
  data belongs to another workspace (`LOCALNET_RESET_OTHER_WORKSPACE`: reset it
  from that workspace, or run `localnet stop` first to reset only this
  workspace's data), and a running node whose data folder Docker does not name
  (`LOCALNET_RESET_DATA_UNVERIFIED`: run `localnet stop` first).
- It takes the workspace lock; `--wait-lock` waits for it, up to
  `--lock-timeout <ms>` (default 30000).

`localnet reset` replaces the hidden, deprecated `hardkas node reset`.

### Funding dev accounts from the localnet treasury (alpha)

On the managed localnet, `hardkas localnet seed` pays an exact balance to the
workspace's dev accounts from a **treasury** account, instead of mining to each
one:

```bash
npx hardkas localnet seed --profile toccata-v2 --amount 100 --only-empty
npx hardkas localnet start --profile toccata-v2 --seed --seed-amount 100
npx hardkas localnet fund alice --profile toccata-v2 --treasury --amount 250
```

- **The treasury key is public by design.** It is derived from a fixed string,
  the same in every HardKAS localnet, so anyone can spend its coins. It is used
  on simnet only: the commands have no `--network`, sign for simnet, and refuse
  any node that does not answer simnet.
- The treasury is mined to when it holds too little mature balance. Payments go
  out in as few transactions as fit; a large amount is split over several.
- `--stop-miner` leaves the chain stopped after seeding. Without it, the
  liveness miner keeps running, and it is restarted if a run fails.
- A transaction whose outcome is unknown (no answer from the node) is recorded
  in `localnet/treasury-pending.json` under `HARDKAS_HOME` (`~/.hardkas`), one
  per machine like the localnet. The next run, from any workspace, sends that same
  transaction again; it never pays twice.
- These treasury transactions are not recorded as plan, signed and submission
  artifacts. The command's JSON output (`hardkas.localnetSeed.v1`) lists their
  txIds and the accounts funded.

Error codes: `LOCALNET_TIMEOUT_INVALID`, `LOCALNET_DAG_SETTLE_TIMEOUT`,
`LOCALNET_TREASURY_SUBMIT_OUTCOME_UNKNOWN`, `LOCALNET_TREASURY_PENDING_UNRESOLVED`,
`LOCALNET_TREASURY_INCOMPLETE` ([Errors](../reference/errors.md)).

## Next

- [Quickstart: a real transaction on your simnet](./quickstart-simnet.md)
- [SilverScript and covenants on your simnet](./silverscript-covenants.md)
