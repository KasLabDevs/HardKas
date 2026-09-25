---
title: hardkas dev
---

# `hardkas dev`

## `hardkas dev`

### Synopsis (Generated)

**Purpose:** Local development and Igra-native environment tools

#### Options

- `--once` (Default: `false`): Initialize dev environment, run health checks, and exit (headless)
- `--headless` (Default: `false`): Run headlessly (no UI open)

---

## `hardkas dev create`

### Synopsis (Generated)

**Purpose:** Create a new dApp project from a template stable

#### Arguments

- `&lt;name&gt;` (Required): 

---

## `hardkas dev init`

### Synopsis (Generated)

**Purpose:** Initialize dApp support in the current workspace stable

---

## `hardkas dev doctor`

### Synopsis (Generated)

**Purpose:** Validate local dev environment readiness stable

#### Options

- `--profile &lt;name&gt;` (Default: `igra`): L2 network profile name
- `--rpc-url &lt;url&gt;`: Explicit Igra RPC URL to check
- `--account &lt;name&gt;`: Local EVM account name to verify balance
- `--timeout &lt;ms&gt;` (Default: `3000`): RPC timeout in milliseconds
- `--json`: Output as JSON
- `--release`: Run strict release gate checks

---

## `hardkas dev accounts list`

### Synopsis (Generated)

**Purpose:** List dev accounts

---

## `hardkas dev accounts reveal`

### Synopsis (Generated)

**Purpose:** Reveal private key for a dev account (simnet only)

#### Arguments

- `&lt;alias&gt;` (Required): 

---

## `hardkas dev accounts export`

### Synopsis (Generated)

**Purpose:** Export dev account in format suitable for Kasware manual import

#### Arguments

- `&lt;kasware&gt;` (Required): 

#### Options

- `--alias &lt;alias&gt;` (Default: `alice`): Alias to export

---

## `hardkas dev tx send`

### Synopsis (Generated)

**Purpose:** Quick send transaction

#### Options

- `--from &lt;accountOrAddress&gt;`: Sender alias
- `--to &lt;address&gt;`: Recipient address
- `--amount &lt;kas&gt;`: Amount in KAS
- `--workspace &lt;path&gt;`: Override workspace root directory

---

## `hardkas dev tx generate`

### Synopsis (Generated)

**Purpose:** Generate simulated load/batch transactions stable

#### Options

- `--count &lt;number&gt;`: Number of transactions to generate
- `--network &lt;name&gt;` (Default: `simulated`): Network name
- `--workspace &lt;path&gt;`: Override workspace root directory
- `--json` (Default: `false`): Output as JSON

---

## `hardkas dev fixture generate`

### Synopsis (Generated)

**Purpose:** Generate mock fixtures for testing stable

#### Options

- `--type &lt;type&gt;`: Type of fixture (marketplace|dao|payroll|random)
- `--out &lt;path&gt;`: Save fixture as JSON to this file
- `--json` (Default: `false`): Output as JSON

---

## `hardkas dev last`

### Synopsis (Generated)

**Purpose:** Interact with the latest local workflow

#### Options

- `--inspect` (Default: `false`): Inspect the latest artifact
- `--replay` (Default: `false`): Replay the latest workflow
- `--explain` (Default: `false`): Explain the latest workflow
- `--workspace &lt;path&gt;`: Override workspace root directory

---

