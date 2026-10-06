---
title: hardkas rpc
---

# `hardkas rpc`

## `hardkas rpc info`

### Synopsis (Generated)

**Purpose:** Show the node's network, version, sync state and UTXO index

#### Options

- `--url &lt;url&gt;`: Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas rpc health`

### Synopsis (Generated)

**Purpose:** Check that the canonical localnet node (ws://127.0.0.1:18210) answers and is ready

#### Options

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

## `hardkas rpc dag`

### Synopsis (Generated)

**Purpose:** Show the node's DAG: network, virtual DAA score, sink and tips

#### Options

- `--url &lt;url&gt;`: Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas rpc utxos`

### Synopsis (Generated)

**Purpose:** Show the UTXOs the node holds for an address

#### Arguments

- `&lt;address&gt;` (Required): 

#### Options

- `--url &lt;url&gt;`: Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas rpc mempool`

### Synopsis (Generated)

**Purpose:** Look up a transaction in the node's mempool, or list what the mempool holds

#### Arguments

- `&lt;txId&gt;` (Optional): 

#### Options

- `--url &lt;url&gt;`: Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210)
- `--json` (Default: `false`): Output as JSON

---

