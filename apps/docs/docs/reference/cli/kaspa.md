---
title: hardkas kaspa
---

# `hardkas kaspa`

## `hardkas kaspa wallet create`

### Synopsis (Generated)

**Purpose:** Create a new local Kaspa wallet stable

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

- `--rpc-url &lt;url&gt;` (Default: `http://127.0.0.1:16110`): Kaspa RPC URL
- `--json` (Default: `false`): Output as JSON

---

## `hardkas kaspa wallet send`

### Synopsis (Generated)

**Purpose:** Send Kaspa between local wallets stable

#### Arguments

- `&lt;from&gt;` (Required): 
- `&lt;to&gt;` (Required): 

#### Options

- `--amount &lt;kas&gt;`: Amount in KAS to send
- `--dry-run` (Default: `false`): Plan but do not sign or broadcast
- `--rpc-url &lt;url&gt;` (Default: `http://127.0.0.1:16110`): Kaspa RPC URL

---

## `hardkas kaspa doctor`

### Synopsis (Generated)

**Purpose:** Verify local Kaspa L1 environment readiness stable

#### Options

- `--rpc-url &lt;url&gt;` (Default: `http://127.0.0.1:16110`): Kaspa RPC URL
- `--json` (Default: `false`): Output as JSON

---

