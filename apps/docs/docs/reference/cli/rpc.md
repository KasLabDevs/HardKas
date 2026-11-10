---
title: hardkas rpc
---

# `hardkas rpc`

## `hardkas rpc info`

### Synopsis (Generated)

**Purpose:** Show the node's network, version, sync state and UTXO index

#### Options

- `--url &lt;url&gt;`: Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210)
- `--network &lt;name&gt;`: Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet, unchecked)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas rpc health`

### Synopsis (Generated)

**Purpose:** Check that a Kaspa node answers and is ready (default: the canonical localnet, ws://127.0.0.1:18210; --url or --network for another)

#### Options

- `--url &lt;url&gt;`: Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210)
- `--network &lt;name&gt;`: Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet, unchecked)
- `--wait`: Wait until healthy
- `--timeout &lt;ms&gt;`: With --wait: how long to wait in ms (default: 60000)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas rpc doctor`

### Synopsis (Generated)

**Purpose:** Probe RPC endpoints: TCP, wRPC connection, server and DAG info (http:// endpoints without port 18210 are probed as EVM JSON-RPC)

#### Options

- `--endpoints &lt;urls...&gt;`: Endpoints to probe, separated by spaces (commas are not split)

---

## `hardkas rpc compare`

### Synopsis (Generated)

**Purpose:** Read several nodes side by side, read-only: identity, lag, the UTXOs of addresses, one look at a transaction. Differences the nodes' lag accounts for are lag, others disagreements (exit 1); when no node can be read, nothing is compared (exit 1, MULTINODE_NO_NODE_REACHABLE). Nothing is sent; agreement among nodes is not consensus validation

#### Options

- `--endpoints &lt;urls...&gt;`: Node wRPC endpoints to read, separated by spaces (two or more)
- `--network &lt;id&gt;`: The network every node must say it serves (e.g. simnet, testnet-10); a node serving another is not read
- `--address &lt;addresses...&gt;`: Compare the UTXOs of these addresses
- `--tx &lt;txId&gt;`: Look at this transaction on every node
- `--since &lt;hash&gt;`: With --tx: a chain block every node holds to look from (default: each node's pruning point)
- `--lag-threshold &lt;daa&gt;`: DAA score behind the most advanced synced node beyond which a node is lagging (default: 100)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas rpc dag`

### Synopsis (Generated)

**Purpose:** Show the node's DAG: network, virtual DAA score, sink and tips

#### Options

- `--url &lt;url&gt;`: Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210)
- `--network &lt;name&gt;`: Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet, unchecked)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas rpc utxos`

### Synopsis (Generated)

**Purpose:** Show the UTXOs the node holds for an address

#### Arguments

- `&lt;address&gt;` (Required): 

#### Options

- `--url &lt;url&gt;`: Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210)
- `--network &lt;name&gt;`: Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet, unchecked)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas rpc mempool`

### Synopsis (Generated)

**Purpose:** Look up a transaction in the node's mempool, or list what the mempool holds

#### Arguments

- `&lt;txId&gt;` (Optional): 

#### Options

- `--url &lt;url&gt;`: Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210)
- `--network &lt;name&gt;`: Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet, unchecked)
- `--json` (Default: `false`): Output as JSON

---

