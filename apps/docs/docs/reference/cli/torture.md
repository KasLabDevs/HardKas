---
title: hardkas torture
---

# `hardkas torture`

## `hardkas torture matrix`

### Synopsis (Generated)

**Purpose:** Execute the deterministic chaos-and-mutation torture matrix alpha

#### Options

- `--iterations &lt;number&gt;` (Default: `300`): Number of torture cases to execute
- `--seed &lt;seed&gt;` (Default: `random`): Seed value for deterministic inputs or 'random'
- `--report [path]`: Optional custom JSON output filepath for findings report
- `--bucket &lt;name&gt;`: Optional target bucket name to execute exclusively
- `--profile &lt;name&gt;`: Optional profile name to execute
- `--debug-stack` (Default: `false`): Print raw stacktraces when cases fail

---

## `hardkas torture replay`

### Synopsis (Generated)

**Purpose:** Replay and debug a specific failed case from a torture run alpha

#### Options

- `--seed &lt;number&gt;`: Original global seed of the failed matrix run
- `--case &lt;caseId&gt;`: Failed case ID, e.g. case-001
- `--profile &lt;name&gt;`: Original profile filter of the failed matrix run

---

