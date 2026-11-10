---
title: hardkas node
---

# `hardkas node`

## `hardkas node start`

### Synopsis (Generated)

**Purpose:** Start local node stable

#### Options

- `--image &lt;image&gt;`: Docker image, pinned by digest: &lt;repository&gt;[:tag]@sha256:&lt;64 hex&gt; (default: the pinned rusty-kaspad); an image without a digest is refused (NODE_IMAGE_DIGEST_REQUIRED)
- `--allow-floating-image` (Default: `false`): No effect: the image must be pinned by digest (@sha256:&lt;64 hex&gt;); a floating tag is never run
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
- `--follow` (Default: `false`): No effect: the logs are printed once (the last --tail lines), never followed
- `--json` (Default: `false`): Output results as JSON

---

