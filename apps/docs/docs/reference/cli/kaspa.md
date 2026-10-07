---
title: hardkas kaspa
---

# `hardkas kaspa`

## `hardkas kaspa wallet create`

### Synopsis (Generated)

**Purpose:** Generate a key pair and print it (address, config snippet and private key); nothing is saved. For stored dev accounts use 'accounts real generate' stable

#### Arguments

- `&lt;name&gt;` (Required): 

#### Options

- `--network &lt;id&gt;` (Default: `simnet`): Kaspa network ID

---

## `hardkas kaspa wallet list`

### Synopsis (Generated)

**Purpose:** List local Kaspa wallets stable

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas kaspa wallet address`

### Synopsis (Generated)

**Purpose:** Show address of a local Kaspa wallet stable

#### Arguments

- `&lt;name&gt;` (Required): 

---

## `hardkas kaspa wallet balance`

### Synopsis (Generated)

**Purpose:** Show balance of a local Kaspa wallet stable

#### Arguments

- `&lt;name&gt;` (Required): 

#### Options

- `--rpc-url &lt;url&gt;` (Default: `ws://127.0.0.1:18210`): Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas kaspa wallet send`

### Synopsis (Generated)

**Purpose:** Plan, confirm (y/N), sign and submit a payment over --rpc-url; the network and target come from hardkas.config stable

#### Arguments

- `&lt;from&gt;` (Required): 
- `&lt;to&gt;` (Required): 

#### Options

- `--amount &lt;kas&gt;`: Amount in KAS to send
- `--dry-run` (Default: `false`): Plan but do not sign or broadcast
- `--rpc-url &lt;url&gt;` (Default: `ws://127.0.0.1:18210`): Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210)

---

## `hardkas kaspa doctor`

### Synopsis (Generated)

**Purpose:** Check one Kaspa node at --rpc-url: reachability, sync state, UTXO index, DAG info and mempool stable

#### Options

- `--rpc-url &lt;url&gt;` (Default: `ws://127.0.0.1:18210`): Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210)
- `--json` (Default: `false`): Output as JSON

---

