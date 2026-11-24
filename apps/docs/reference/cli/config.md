---
title: "hardkas config commands"
sidebar_label: "hardkas config"
description: "Reference for the hardkas config commands (show, networks, init, repair), with their arguments, options and defaults."
---

# `hardkas config`

## `hardkas config show`

### Synopsis (Generated)

**Purpose:** Show the current HardKAS configuration

#### Options

- `--config &lt;path&gt;`: Path to config file
- `--json` (Default: `false`): Output as JSON

---

## `hardkas config networks`

### Synopsis (Generated)

**Purpose:** List configured networks

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas config init`

### Synopsis (Generated)

**Purpose:** Initialize a basic hardkas.config.ts in the current directory (the config imports nothing, so it loads before any install)

#### Options

- `--force` (Default: `false`): Replace an existing hardkas.config.ts; the original is first copied to a backup that never overwrites another
- `--json` (Default: `false`): Output results as JSON

---

## `hardkas config repair`

### Synopsis (Generated)

**Purpose:** Repair an invalid or missing hardkas config: an invalid one is copied to a backup that never overwrites another, then replaced by a minimal config that loads

#### Options

- `--json` (Default: `false`): Output results as JSON

---

