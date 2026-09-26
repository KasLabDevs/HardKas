---
title: hardkas lock
---

# `hardkas lock`

## `hardkas lock list`

### Synopsis (Generated)

**Purpose:** List all active workspace locks stable

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas lock status`

### Synopsis (Generated)

**Purpose:** Show status of one or all locks stable

#### Arguments

- `&lt;name&gt;` (Optional): 

---

## `hardkas lock doctor`

### Synopsis (Generated)

**Purpose:** Analyze locks and identify stale or corrupted ones stable

---

## `hardkas lock clear`

### Synopsis (Generated)

**Purpose:** Safely or forcibly clear a lock stable

#### Arguments

- `&lt;name&gt;` (Required): 

#### Options

- `--if-dead` (Default: `false`): Only clear if the process is no longer running
- `--force` (Default: `false`): Forcibly clear the lock even if the process is alive
- `--yes` (Default: `false`): Confirm clearing without prompt

---

