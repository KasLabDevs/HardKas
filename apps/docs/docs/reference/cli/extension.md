---
title: hardkas extension
---

# `hardkas extension`

## `hardkas extension list`

### Synopsis (Generated)

**Purpose:** List the known extensions and their state in this project (installed, version, enabled, compatible)

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas extension install`

### Synopsis (Generated)

**Purpose:** Install an extension in this project at the CLI's exact version, with install scripts disabled; it downloads no toolchain and starts nothing

#### Arguments

- `&lt;id&gt;` (Required): 

#### Options

- `--from &lt;tgz&gt;`: Install from a local npm tarball (offline); requires --sha256
- `--sha256 &lt;hex&gt;`: SHA-256 the --from tarball must have
- `--yes` (Default: `false`): Run the package manager without asking
- `--dry-run` (Default: `false`): Only print the checks' result and the command that would run
- `--json` (Default: `false`): Output as JSON

---

## `hardkas extension remove`

### Synopsis (Generated)

**Purpose:** Remove an extension from this project

#### Arguments

- `&lt;id&gt;` (Required): 

#### Options

- `--yes` (Default: `false`): Run the package manager without asking
- `--dry-run` (Default: `false`): Only print the command that would run
- `--json` (Default: `false`): Output as JSON

---

## `hardkas extension doctor`

### Synopsis (Generated)

**Purpose:** Run the checks of the extensions loaded in this project

#### Options

- `--json` (Default: `false`): Output as JSON

---

