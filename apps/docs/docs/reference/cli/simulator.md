---
title: hardkas simulator
---

# `hardkas simulator`

## `hardkas simulator start`

### Synopsis (Generated)

**Purpose:** Start the in-memory Kaspa node simulator (approximate rules, not consensus-equivalent) experimental

#### Options

- `-p, --port &lt;port&gt;` (Default: `19110`): Port for the RPC server (HTTP JSON-RPC and wRPC JSON)
- `-H, --host &lt;host&gt;` (Default: `127.0.0.1`): Host to bind
- `-n, --network &lt;network&gt;` (Default: `simnet`): Network ID (simnet, devnet, testnet-10, testnet-11)
- `--automine` (Default: `true`): Automine is on by default (this flag changes nothing; --no-automine turns it off)
- `--no-automine`: Disable automine mode
- `--json` (Default: `false`): Output as JSON

---

## `hardkas simulator account create`

### Synopsis (Generated)

**Purpose:** Create a synthetic simulated account (a kaspa:sim_ identity without a real key, for the simulated network only) experimental

#### Arguments

- `&lt;name&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas simulator fund`

### Synopsis (Generated)

**Purpose:** Fund a synthetic simulated account (the project's default network must be the simulator; synthetic UTXOs, not a Kaspa node's) experimental

#### Arguments

- `&lt;identifier&gt;` (Required): 

#### Options

- `--amount &lt;kas&gt;` (Default: `1000`): Amount in KAS, up to 8 decimals, above 0
- `--json` (Default: `false`): Output as JSON

---

