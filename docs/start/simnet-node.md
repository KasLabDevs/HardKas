---
title: Run your own simnet node
description: Run rusty-kaspad v2.1.0 by digest and a CPU miner in Docker, wait for coinbase maturity, point your workspace at it, and stop it without losing data.
url: /localnet
---

# Run your own simnet node

This page starts a real Kaspa node of your own in Docker: the `rusty-kaspad`
release HardKAS pins, on **simnet** (a private local network), plus the upstream
CPU miner that produces its blocks. Your HardKAS workspace then plans, signs and
sends against it like against any node.

It is part of [Build on your own simnet](./build-on-simnet.md). You need Docker
and an initialized workspace ([Install HardKAS](./installation.md#initialize-the-workspace)).

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
16110, 16210, 17110, 17210, 18110, 18210 and 18211: HardKAS's managed localnet
(`hardkas localnet start`, a separate, fixed setup) uses them.

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
      description: "Local Docker kaspad on simnet — requires hardkas node start"
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

## The managed localnet, for comparison

`hardkas localnet start --profile toccata-v2` runs a node and miner that HardKAS
manages itself (fixed container names and ports, one per machine) and proves by
container and image digest. This page uses a node of your own instead: your
names, your ports, your data folder, and the same pinned image.

## Next

- [Quickstart: a real transaction on your simnet](./quickstart-simnet.md)
- [SilverScript and covenants on your simnet](./silverscript-covenants.md)
