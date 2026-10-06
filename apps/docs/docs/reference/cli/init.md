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

- `--force` (Default: `false`): Overwrite an existing hardkas.config.ts (the other scaffold files are kept)
- `--template &lt;type&gt;`: No effect in this release (for templates use 'hardkas create')
- `--network &lt;name&gt;` (Default: `simulated`): 'simulated' pre-creates the simulator state (5 accounts, 1000 KAS each); other values skip it. The project's default target is always the simulator
- `--accounts &lt;n&gt;`: No effect in this release: init always creates the 5 simulated accounts alice…erin
- `--install` (Default: `false`): Run npm install after scaffolding
- `--skip-toolchain` (Default: `false`): Do not install the pinned kaspa-wasm (signing, planning and the generated test need it)
- `--toolchain-from-file &lt;asset&gt;`: Install the pinned kaspa-wasm from its official release asset already on disk
- `--json` (Default: `false`): Output results as JSON

### Semantic Contract (Curated)

- **Environments:** Local Workspace
- **Reads:** 
- **Writes:** hardkas.config.ts, .hardkas/localnet.json, package.json updates
- **⚠️ Side Effects:** Creates new project scaffolding, provisions deterministic accounts, funds simulator accounts.

---

