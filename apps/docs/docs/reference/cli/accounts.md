---
title: hardkas accounts
---

# `hardkas accounts`

## `hardkas accounts list`

### Synopsis (Generated)

**Purpose:** List available HardKAS accounts stable

#### Options

- `--config &lt;path&gt;`: Path to config file
- `--json` (Default: `false`): Output as JSON

---

## `hardkas accounts real init`

### Synopsis (Generated)

**Purpose:** Initialize real dev account store stable

#### Options

- `--force` (Default: `false`): Overwrite existing store
- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms
- `--json` (Default: `false`): Output as JSON

---

## `hardkas accounts real import`

### Synopsis (Generated)

**Purpose:** Import an account into the persistent store stable

#### Options

- `--name &lt;name&gt;`: Account name
- `--address &lt;address&gt;`: Kaspa address
- `--private-key &lt;hex&gt;`: Deprecated. Unsafe: may leak through shell history. Prefer --private-key-stdin or --private-key-env.
- `--private-key-stdin` (Default: `false`): Read private key from stdin
- `--private-key-env &lt;env&gt;`: Read private key from environment variable
- `--password-stdin` (Default: `false`): Read keystore password from stdin (safe)
- `--password-env &lt;env&gt;`: Read keystore password from environment variable (safe)
- `--unsafe-plaintext` (Default: `false`): Store private key in plaintext (legacy/discouraged)
- `--fixture &lt;name&gt;`: Import deterministic fixture test account
- `--yes` (Default: `false`): Skip confirmation for unsafe operations
- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms
- `--json` (Default: `false`): Output as JSON

---

## `hardkas accounts real session-open`

### Synopsis (Generated)

**Purpose:** Verify keystore access and record signing intent internal

**Aliases:** `unlock`

#### Arguments

- `&lt;name&gt;` (Required): 

#### Options

- `--password-stdin` (Default: `false`): Read password from stdin
- `--password-env &lt;env&gt;`: Read password from environment variable
- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms

---

## `hardkas accounts real session-close`

### Synopsis (Generated)

**Purpose:** Clear the local dev signing session marker internal

**Aliases:** `lock`

#### Arguments

- `&lt;name&gt;` (Required): 

---

## `hardkas accounts real change-password`

### Synopsis (Generated)

**Purpose:** Change password for an encrypted account stable

#### Arguments

- `&lt;name&gt;` (Required): 

#### Options

- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms

---

## `hardkas accounts real generate`

### Synopsis (Generated)

**Purpose:** Generate new real dev account(s) using Kaspa SDK stable

#### Options

- `--name &lt;name&gt;`: Base name for account(s)
- `--count &lt;number&gt;` (Default: `1`): Number of accounts to generate
- `--network &lt;network&gt;` (Default: `simnet`): Kaspa network (simnet, testnet-10, mainnet)
- `--password-stdin` (Default: `false`): Read keystore password from stdin
- `--password-env &lt;env&gt;`: Read password from environment variable
- `--unsafe-plaintext` (Default: `false`): Generate accounts in plaintext (legacy/discouraged)
- `--yes` (Default: `false`): Skip confirmation for unsafe operations
- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms
- `--json` (Default: `false`): Output as JSON

---

## `hardkas accounts balance`

### Synopsis (Generated)

**Purpose:** Show account balance stable

#### Arguments

- `&lt;identifier&gt;` (Required): 

#### Options

- `--network &lt;name&gt;` (Default: `simnet`): Kaspa network name
- `--provider &lt;type&gt;` (Default: `auto`): Provider mode (auto, rpc, simulated)
- `--url &lt;url&gt;`: RPC URL (optional override)
- `--local` (Default: `false`): Query local query-store instead of remote RPC (for simulated networks)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas accounts fund`

### Synopsis (Generated)

**Purpose:** Fund an account (Faucet) - DEPRECATED

#### Arguments

- `&lt;identifier&gt;` (Required): 

#### Options

- `--amount &lt;kas&gt;` (Default: `1000`): Amount in KAS to fund

---

## `hardkas accounts consolidate`

### Synopsis (Generated)

**Purpose:** Consolidate dust UTXOs into a single UTXO alpha

#### Arguments

- `&lt;account&gt;` (Required): 

#### Options

- `--network &lt;name&gt;`: Kaspa network name
- `--provider &lt;type&gt;` (Default: `auto`): Provider mode (auto, rpc, simulated)
- `--url &lt;url&gt;`: RPC URL (optional override)
- `--target-utxos &lt;n&gt;` (Default: `20`): Target number of UTXOs to leave behind
- `--batch-size &lt;n&gt;` (Default: `256`): Number of UTXOs to consolidate per batch (max 512)
- `--min-utxo &lt;sompi&gt;`: Minimum UTXO size to consolidate in sompi
- `--dry-run`: Only estimate batches (default if --execute is not provided)
- `--execute`: Execute the consolidation (requires --yes to broadcast)
- `--yes`: Confirm broadcast for execution
- `--allow-mainnet`: Allow consolidation on mainnet
- `--json` (Default: `false`): Output as JSON

---

