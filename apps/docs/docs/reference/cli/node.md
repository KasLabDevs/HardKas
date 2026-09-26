---
title: hardkas node
---

# `hardkas node`

## `hardkas node start`

### Synopsis (Generated)

**Purpose:** Start local node stable

#### Options

- `--image &lt;image&gt;`: Docker image
- `--allow-floating-image` (Default: `false`): Allow using a floating tag like 'latest' without warning
- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms
- `--json` (Default: `false`): Output results as JSON

---

## `hardkas node stop`

### Synopsis (Generated)

**Purpose:** Stop local node stable

#### Options

- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms
- `--json` (Default: `false`): Output results as JSON

---

## `hardkas node restart`

### Synopsis (Generated)

**Purpose:** Restart local node stable

#### Options

- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms
- `--json` (Default: `false`): Output results as JSON

---

## `hardkas node reset`

### Synopsis (Generated)

**Purpose:** Stop node and remove all local chain data preview

#### Options

- `--start` (Default: `false`): Restart the node after reset
- `--yes` (Default: `false`): Skip confirmation prompt
- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms
- `--json` (Default: `false`): Output results as JSON

---

## `hardkas node status`

### Synopsis (Generated)

**Purpose:** Check node status

#### Options

- `--json` (Default: `false`): Return status in JSON format

---

## `hardkas node logs`

### Synopsis (Generated)

**Purpose:** View node logs preview

#### Options

- `--tail &lt;n&gt;` (Default: `100`): Number of lines to show
- `--follow` (Default: `false`): Follow log output
- `--json` (Default: `false`): Output results as JSON

---

