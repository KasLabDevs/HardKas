---
title: hardkas localnet
---

# `hardkas localnet`

## `hardkas localnet start`

### Synopsis (Generated)

**Purpose:** Start localnet profile alpha

#### Options

- `--profile &lt;name&gt;` (Default: `simulated`): Localnet profile
- `--toccata` (Default: `false`): Shortcut for --profile toccata-v2
- `--detached` (Default: `false`): Run in background
- `--json` (Default: `false`): Output as JSON

---

## `hardkas localnet stop`

### Synopsis (Generated)

**Purpose:** Stop localnet profile alpha

#### Options

- `--profile &lt;name&gt;` (Default: `simulated`): Localnet profile
- `--toccata` (Default: `false`): Shortcut for --profile toccata-v2
- `--json` (Default: `false`): Output as JSON

---

## `hardkas localnet status`

### Synopsis (Generated)

**Purpose:** Show localnet status alpha

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas localnet fund`

### Synopsis (Generated)

**Purpose:** Fund a local Toccata/simnet account alpha

#### Arguments

- `&lt;identifier&gt;` (Required): 

#### Options

- `--profile &lt;name&gt;` (Default: `toccata-v2`): Funding profile
- `--amount &lt;kas&gt;` (Default: `1000`): Target mining amount hint in KAS
- `--timeout &lt;ms&gt;` (Default: `300000`): Funding/maturity wait timeout in ms
- `--keep-miner` (Default: `false`): Leave the companion miner running
- `--json` (Default: `false`): Output as JSON

---

## `hardkas localnet account create`

### Synopsis (Generated)

**Purpose:** Create a simulated localnet account alpha

#### Arguments

- `&lt;name&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas localnet fork`

### Synopsis (Generated)

**Purpose:** Fork state from a real Kaspa network for local simulation preview

#### Options

- `--network &lt;name&gt;`: Network to fork from
- `--addresses &lt;addrs...&gt;`: Only fetch UTXOs for these addresses
- `--at-daa-score &lt;score&gt;`: Fork at specific DAA score (implicit latest is forbidden)
- `--output &lt;path&gt;`: Save fork snapshot to file
- `--json` (Default: `false`): Output as JSON

---

## `hardkas localnet snapshot verify`

### Synopsis (Generated)

**Purpose:** Verify the integrity of a snapshot preview

#### Arguments

- `&lt;idOrName&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas localnet snapshot create`

### Synopsis (Generated)

**Purpose:** Create a deterministic snapshot of current localnet state alpha

#### Arguments

- `&lt;name&gt;` (Required): 

#### Options

- `--consensus-validated` (Default: `false`): Mark snapshot as validated by consensus (strict)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas localnet snapshot replay`

### Synopsis (Generated)

**Purpose:** Replay and rebuild deterministic state from a snapshot alpha

#### Arguments

- `&lt;name&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

