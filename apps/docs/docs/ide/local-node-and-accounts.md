---
title: Local node and accounts
description: Start, stop, restart and reset HardKAS' local simnet node from the IDE, drive its miner, read the explorer, and manage dev accounts and KasWare.
sidebar_label: Local node and accounts
sidebar_position: 5
---

# Local node and accounts

## Servers view

**Servers** (rail icon, or **View → Servers (node)**) shows the environment and HardKAS' local node: rusty-kaspa in Docker, on simnet. The IDE works with this single node only.

### Environment

The **Environment** picker at the top is the same as in the environment bar: Simulator, Local node or Public testnet. Below it, the view shows what HardKAS calls it (`--target` and `--network`).

### Docker

The local node needs Docker Desktop. When Docker is missing, the view says "Docker is not installed"; when it is installed but stopped, "Docker is installed but not running". Both suggest the simulator until then, with a **Switch to Simulator** button.

### The Local node (Docker) card

The card shows the node's state (ready, starting, stopped), its container, version, RPC address and ports, the DAA score and the last error. It refreshes every 30 seconds and with the refresh button. If another program answers on the node's RPC port, the state is **FOREIGN RPC**: stop that program first.

| Button | What it runs |
| --- | --- |
| **Start** | `hardkas localnet start --toccata`. It then waits up to 2 minutes for the RPC, loads the dev accounts and gives each empty one 100 KAS. |
| **Stop** | `hardkas localnet stop --toccata`. Stops the node and its miner. The chain is kept. |
| **Restart** | Stop, then the whole Start sequence. |
| **Reset from scratch…** | Wipes the local chain and starts again (below). |

The same actions are under **Run → Local node** and in the command palette. A progress banner above the editor lists the steps. While it runs, the Accounts and Deploy & Run views are covered until the node is ready. Errors stay on the banner until you close them.

The card also shows which `hardkas` CLI is in use. It turns amber when that version differs from the one the IDE was tested with.

### Reset from scratch

**Reset from scratch…** asks first ("Reset local node"), then:

1. Stops the node and the miner (`hardkas localnet stop --toccata`).
2. **Backs up the account keys.** It moves `.hardkas/accounts.real.json` and `.hardkas/dev-accounts/` into `.hardkas/backups/reset-<time>/`.
3. Deletes the local chain data (`.hardkas/node-data`, `.hardkas/localnet`) and runs `hardkas node reset --yes`.
4. Starts a fresh node, which creates the dev accounts again, and gives each one 100 KAS.

Your project files and the artifacts in `.hardkas/artifacts` are kept, but they now describe a chain that no longer exists.

If the key backup fails, nothing is deleted and the reset stops. The node is already stopped at that point, so start it again.

**Getting old keys back.** The IDE does not show the backup folder and has no restore button. To restore, stop the node, then move the files from the newest `.hardkas/backups/reset-…/` folder back into `.hardkas/` by hand. The coins those keys held were on the wiped chain, so restoring the keys does not bring them back.

## The miner

A private simnet has no network to mine for it, so blocks only exist while a miner runs. HardKAS runs a CPU miner in its own Docker container (`hardkas-toccata-miner`) while it funds an account, and stops it afterwards. A deploy or payment sent with the miner stopped reaches the mempool and **waits there**.

When the local node is ready, a miner box says which case you are in: "Miner running: blocks are being mined", "Miner stopped: nothing confirms" or "No miner yet: nothing confirms".

| Button | What it does | When to use it |
| --- | --- | --- |
| **Mine a burst** | Runs `hardkas localnet fund <first account> --amount 1 --stop-miner`: mines until 1 more KAS reaches the account, then stops. It also creates the miner the first time. | You sent something and want it confirmed. |
| **Start miner** | `docker start hardkas-toccata-miner` | You want blocks for a while (several deploys in a row). Stop it afterwards. |
| **Stop miner** | `docker stop hardkas-toccata-miner` | You are done, or the node refuses blocks (below). |

The IDE only starts or stops HardKAS' own miner container. A miner left running finds blocks faster than the node accepts them: the Explorer then warns `route is full` and confirmations get slower. Stop the miner when that happens.

## Explorer

The **Explorer** card, inside Servers, reads the local node every 4 seconds while it is on screen. When the node stops, it shows the last reading.

- **Chain**: virtual DAA score and its rate, sink, tips, parents, sync state and node version.
- **Blocks**: the blocks the miner found, its rate, and the `route is full` warning.
- **Mempool**: transactions waiting for a block, with their fees.
- **UTXOs**: pick an account or paste an address, then **Load** (`hardkas rpc utxos <address>`). Shows the totals and the 40 largest outputs.

## Accounts

**Accounts** (rail icon) lists the accounts of the selected environment with their balances (`hardkas accounts list` and `hardkas accounts balance`). On the local node with the node stopped, it shows **Start local node** instead.

Each account card has:

- the name, kind and balance;
- **Public key (address)**: the account's address, with a copy button;
- **Private key**: always masked. The copy button asks first ("Copy private key"), then copies it. Only local simnet dev keys can be copied; testnet keys never are;
- **fund 100**: 100 KAS on the simulator (`hardkas simulator fund`) or the local node (`hardkas localnet fund`). The IDE has no faucet for testnet.

**Fund all** (not shown on testnet) gives each empty account 100 KAS. When no account is empty, it funds them all.

**Create** adds an account with the name you type (a letter first, then letters, digits, `-` or `_`, up to 32 characters). It runs `hardkas localnet account create <name>`.

**Watch out:** accounts created this way keep their private key in plain text in `.hardkas/accounts.real.json`. Use them for development coins only.

### KasWare

At the bottom of the Accounts view, the **KasWare** card helps you connect the KasWare browser extension to the local node:

- the values KasWare needs, ready to copy: network, network id, wRPC (JSON and Borsh), gRPC and address prefix;
- **Connect KasWare** and **Switch to `<network>`**. These only work when the IDE page is open in a browser that has the extension; the desktop window cannot load browser extensions, so there the card shows "not detected";
- steps to import a dev account: in KasWare, **Import Account → Private Key**, then paste the key copied from the account card.

## Accounts in the environment bar

The accounts summary in the environment bar opens a list of every account with its balance and address on hover; click to pin it. It has **Refresh balances** and **Open View**.
