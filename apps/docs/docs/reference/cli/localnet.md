---
title: hardkas localnet
---

# `hardkas localnet`

## `hardkas localnet start`

### Synopsis (Generated)

**Purpose:** Start (or adopt) the Docker rusty-kaspad node for the toccata-v2 profile and create dev accounts alice…erin; needs Docker alpha

#### Options

- `--profile &lt;name&gt;`: Localnet profile: toccata-v2 (the only one, required; or use --toccata)
- `--toccata` (Default: `false`): Shortcut for --profile toccata-v2
- `--detached` (Default: `false`): No effect: the node always runs as a detached Docker container
- `--json` (Default: `false`): Output as JSON

---

## `hardkas localnet stop`

### Synopsis (Generated)

**Purpose:** Stop the Docker rusty-kaspad node of the toccata-v2 profile and its miner; needs Docker alpha

#### Options

- `--profile &lt;name&gt;` (Default: `toccata-v2`): Localnet profile: toccata-v2 (the only one)
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
- `--amount &lt;kas&gt;` (Default: `1000`): KAS to wait for: mine until the mature balance grows by this amount
- `--timeout &lt;ms&gt;` (Default: `300000`): Funding/maturity wait timeout in ms
- `--keep-miner` (Default: `false`): Keep mining to the funded account after funding (its balance keeps growing)
- `--stop-miner` (Default: `false`): Leave the chain stopped after funding: no new blocks until you mine again
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

**Purpose:** Copy the current UTXOs of some addresses from a node into a simulator state file preview

#### Options

- `--network &lt;name&gt;`: Network to fork from
- `--addresses &lt;addrs...&gt;`: Addresses whose UTXOs are copied, separated by spaces
- `--at-daa-score &lt;score&gt;`: Required label recorded with the snapshot; the UTXOs copied are always the node's current ones
- `--output &lt;path&gt;`: State file to write (default: .hardkas/localnet.json, replaced)
- `--json` (Default: `false`): Not implemented yet: no JSON is printed

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

**Purpose:** Restore a snapshot's missing artifacts into the workspace; never removes or overwrites one alpha

#### Arguments

- `&lt;name&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

