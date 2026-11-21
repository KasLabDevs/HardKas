---
title: hardkas replay
---

# `hardkas replay`

## `hardkas replay verify`

### Synopsis (Generated)

**Purpose:** Verify deterministic simulator-mode replay for a receipt (required) by exact artifactId or a workspace path such as ./receipt.json. Real-node sends are not supported: they record a TxSubmission, not a TxReceipt. stable

#### Arguments

- `&lt;artifact&gt;` (Optional): 

#### Options

- `--json` (Default: `false`): Output as JSON
- `--workspace &lt;path&gt;`: Override workspace root directory

---

## `hardkas replay diff`

### Synopsis (Generated)

**Purpose:** Compare two replay artifacts for deterministic divergence alpha

#### Arguments

- `&lt;idA&gt;` (Required): 
- `&lt;idB&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

