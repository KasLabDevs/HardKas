---
title: hardkas init
---

# `hardkas init`

## `hardkas init`

### Synopsis (Generated)

**Purpose:** Initialize a new HardKAS project stable

#### Arguments

- `&lt;name&gt;` (Optional): Project name or directory

#### Options

- `--force` (Default: `false`): Overwrite existing hardkas.config.ts (in-place only)
- `--template &lt;type&gt;` (Default: `basic`): Project template for new projects
- `--network &lt;name&gt;` (Default: `simulated`): Default network for new projects
- `--accounts &lt;n&gt;` (Default: `3`): Number of simulated accounts for new projects
- `--install` (Default: `false`): Run pnpm/npm install automatically after scaffolding
- `--json` (Default: `false`): Output results as JSON

### Semantic Contract (Curated)

- **Environments:** Local Workspace
- **Reads:** 
- **Writes:** hardkas.config.ts, .hardkas/localnet.json, package.json updates
- **⚠️ Side Effects:** Creates new project scaffolding, provisions deterministic accounts, funds simulator accounts.

---

