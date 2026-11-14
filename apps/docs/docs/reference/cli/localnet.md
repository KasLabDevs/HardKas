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
- `--seed` (Default: `false`): Distribute an initial exact balance (default 100 KAS) to empty dev accounts from the localnet Treasury after start (its key is public by design, the same on every HardKAS localnet, and used on simnet only)
- `--seed-amount &lt;kas&gt;` (Default: `100`): KAS per account when --seed is set
- `--stop-miner` (Default: `false`): With --seed: leave the chain stopped after seeding
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
- `--amount &lt;kas&gt;` (Default: `1000`): KAS to fund: without --treasury, mine to the account until its mature balance grows by this amount; with --treasury, transfer exactly this amount from the localnet Treasury
- `--treasury` (Default: `false`): Transfer exactly --amount KAS from the localnet Treasury instead of mining to the account (an amount too large for one transaction is sent in several). The Treasury key is public by design, the same on every HardKAS localnet, and used on simnet only
- `--timeout &lt;ms&gt;` (Default: `300000`): Funding/maturity wait timeout in ms
- `--keep-miner` (Default: `false`): Keep mining to the funded account after funding (its balance keeps growing)
- `--stop-miner` (Default: `false`): Leave the chain stopped after funding: no new blocks until you mine again
- `--json` (Default: `false`): Output as JSON

---

## `hardkas localnet seed`

### Synopsis (Generated)

**Purpose:** Distribute an exact initial KAS balance to dev accounts from the localnet Treasury (1 -&gt; N; the Treasury key is public by design, the same on every HardKAS localnet, and used on simnet only) alpha

#### Options

- `--profile &lt;name&gt;` (Default: `toccata-v2`): Funding profile
- `--amount &lt;kas&gt;` (Default: `100`): KAS per dev account
- `--only-empty` (Default: `false`): Only fund accounts whose balance is currently 0
- `--accounts &lt;names&gt;`: Comma-separated account names or simnet addresses to seed
- `--timeout &lt;ms&gt;` (Default: `300000`): Funding/confirmation timeout in ms
- `--stop-miner` (Default: `false`): Leave the chain stopped after seeding: no new blocks until you mine again
- `--json` (Default: `false`): Output as JSON

---

## `hardkas localnet account create`

### Synopsis (Generated)

**Purpose:** Create a real simnet account: a random key, stored in plaintext in .hardkas/accounts.real.json alpha

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

- `--consensus-validated` (Default: `false`): Not supported: refused (SNAPSHOT_CONSENSUS_VALIDATION_UNSUPPORTED, exit 2). HardKAS does not validate snapshots against consensus, so a snapshot never declares it
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

