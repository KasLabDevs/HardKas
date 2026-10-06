---
title: hardkas dev
---

# `hardkas dev`

## `hardkas dev`

### Synopsis (Generated)

**Purpose:** Local development tools: dev environment, dApp templates, simnet dev accounts (`dev doctor` is an Igra L2 lab check)

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

**Purpose:** Igra L2 lab, not the L1 core: check local dev readiness for an L2 profile (Igra by default): workspace, artifacts, query store, SDK import, dev server and the L2 JSON-RPC; the Kaspa node is not checked experimental

#### Options

- `--profile &lt;name&gt;` (Default: `igra`): L2 network profile name
- `--rpc-url &lt;url&gt;`: Explicit Igra RPC URL to check
- `--account &lt;name&gt;`: EVM account that must exist in hardkas.config (its balance is not checked)
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

**Purpose:** Export a dev account for a wallet's manual import; format: kasware

#### Arguments

- `&lt;format&gt;` (Required): 

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

**Purpose:** Act on the latest transaction artifact of the workspace store

#### Options

- `--inspect` (Default: `false`): Print the latest artifact
- `--replay` (Default: `false`): Show the latest receipt, or verify the latest plan or signed transaction (no replay is run)
- `--explain` (Default: `false`): Print the `hardkas why` command for the latest artifact
- `--workspace &lt;path&gt;`: Override workspace root directory

---

