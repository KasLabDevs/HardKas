# HardKAS CLI Reference

Generated from the HardKAS Commander command tree.

Do not edit command flags manually. Run:

```bash
pnpm docs:generate-cli
```

## hardkas accounts

Manage HardKAS accounts

### Usage

```bash
hardkas accounts [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas accounts balance](#hardkas-accounts-balance)
- [hardkas accounts consolidate](#hardkas-accounts-consolidate)
- [hardkas accounts fund](#hardkas-accounts-fund)
- [hardkas accounts list](#hardkas-accounts-list)
- [hardkas accounts real](#hardkas-accounts-real)

---

## hardkas accounts balance

Show account balance stable

### Usage

```bash
hardkas accounts balance [options] <identifier>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | Kaspa network name | simnet |
| `--provider <type>` | Provider mode (auto, rpc, simulated) | auto |
| `--url <url>` | RPC URL (optional override) |  |
| `--local` | Query local query-store instead of remote RPC (for simulated networks) | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `identifier` |  |

---

## hardkas accounts consolidate

Consolidate dust UTXOs into a single UTXO alpha

### Usage

```bash
hardkas accounts consolidate [options] <account>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | Kaspa network name |  |
| `--provider <type>` | Provider mode (auto, rpc, simulated) | auto |
| `--url <url>` | RPC URL (optional override) |  |
| `--target-utxos <n>` | Target number of UTXOs to leave behind | 20 |
| `--batch-size <n>` | Number of UTXOs to consolidate per batch (max 512) | 256 |
| `--min-utxo <sompi>` | Minimum UTXO size to consolidate in sompi |  |
| `--dry-run` | Only estimate batches (default if --execute is not provided) |  |
| `--execute` | Execute the consolidation (requires --yes to broadcast) |  |
| `--yes` | Confirm broadcast for execution |  |
| `--allow-mainnet` | Allow consolidation on mainnet |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `account` |  |

---

## hardkas accounts fund

Fund an account (Faucet) - DEPRECATED

### Usage

```bash
hardkas accounts fund [options] <identifier>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--amount <kas>` | Amount in KAS to fund | 1000 |

### Arguments

| Argument | Description |
| :--- | :--- |
| `identifier` |  |

---

## hardkas accounts list

List available HardKAS accounts stable

### Usage

```bash
hardkas accounts list [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--config <path>` | Path to config file |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas accounts real

Persistent dev account store (L1)

### Usage

```bash
hardkas accounts real [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas accounts real change-password](#hardkas-accounts-real-change-password)
- [hardkas accounts real generate](#hardkas-accounts-real-generate)
- [hardkas accounts real import](#hardkas-accounts-real-import)
- [hardkas accounts real init](#hardkas-accounts-real-init)
- [hardkas accounts real session-close](#hardkas-accounts-real-session-close)
- [hardkas accounts real session-open](#hardkas-accounts-real-session-open)

---

## hardkas accounts real change-password

Change password for an encrypted account stable

### Usage

```bash
hardkas accounts real change-password [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas accounts real generate

Generate new real dev account(s) using Kaspa SDK stable

### Usage

```bash
hardkas accounts real generate [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--name <name>` | Base name for account(s) |  |
| `--count <number>` | Number of accounts to generate | 1 |
| `--network <network>` | Kaspa network (simnet, testnet-10, mainnet) | simnet |
| `--password-stdin` | Read keystore password from stdin | false |
| `--password-env <env>` | Read password from environment variable |  |
| `--unsafe-plaintext` | Generate accounts in plaintext (legacy/discouraged) | false |
| `--yes` | Skip confirmation for unsafe operations | false |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas accounts real import

Import an account into the persistent store stable

### Usage

```bash
hardkas accounts real import [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--name <name>` | Account name |  |
| `--address <address>` | Kaspa address |  |
| `--private-key <hex>` | Deprecated. Unsafe: may leak through shell history. Prefer --private-key-stdin or --private-key-env. |  |
| `--private-key-stdin` | Read private key from stdin | false |
| `--private-key-env <env>` | Read private key from environment variable |  |
| `--password-stdin` | Read keystore password from stdin (safe) | false |
| `--password-env <env>` | Read keystore password from environment variable (safe) |  |
| `--unsafe-plaintext` | Store private key in plaintext (legacy/discouraged) | false |
| `--fixture <name>` | Import deterministic fixture test account |  |
| `--yes` | Skip confirmation for unsafe operations | false |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas accounts real init

Initialize real dev account store stable

### Usage

```bash
hardkas accounts real init [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--force` | Overwrite existing store | false |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas accounts real session-close

**Aliases:** lock

Clear the local dev signing session marker internal

### Usage

```bash
hardkas accounts real session-close [options] <name>
```

### Options

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas accounts real session-open

**Aliases:** unlock

Verify keystore access and record signing intent internal

### Usage

```bash
hardkas accounts real session-open [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--password-stdin` | Read password from stdin | false |
| `--password-env <env>` | Read password from environment variable |  |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas artifact

**Aliases:** artifacts

Manage HardKAS artifacts

### Usage

```bash
hardkas artifact [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas artifact create](#hardkas-artifact-create)
- [hardkas artifact explain](#hardkas-artifact-explain)
- [hardkas artifact inspect](#hardkas-artifact-inspect)
- [hardkas artifact lineage](#hardkas-artifact-lineage)
- [hardkas artifact verify](#hardkas-artifact-verify)

---

## hardkas artifact create

Create a new HardKAS artifact alpha

### Usage

```bash
hardkas artifact create [options] <type>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--input <path>` | Input JSON payload file |  |
| `--out <path>` | Output artifact file path |  |
| `--json` | Output results as JSON | false |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `type` |  |

---

## hardkas artifact explain

Provide a human-readable operational summary of an artifact stable

### Usage

```bash
hardkas artifact explain [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--strict` | Perform deep semantic and operational safety verification | false |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas artifact inspect

Deep inspect an artifact by ID or path stable

### Usage

```bash
hardkas artifact inspect [options] <id_or_path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as JSON | false |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `id_or_path` |  |

---

## hardkas artifact lineage

Show the provenance and operational history of an artifact stable

### Usage

```bash
hardkas artifact lineage [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas artifact verify

Verify an artifact's integrity and schema stable

### Usage

```bash
hardkas artifact verify [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as JSON | false |
| `--recursive` | Recursively verify all artifacts in a directory | false |
| `--strict` | Perform deep semantic and operational safety verification | false |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas capabilities

Show HardKAS capabilities and maturity level

### Usage

```bash
hardkas capabilities [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as stable JSON schema | false |

### Arguments

No arguments.

---

## hardkas chaos

Run the internal Chaos Engine to stress-test the runtime experimental

### Usage

```bash
hardkas chaos [options] [command]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--runs <number>` | Number of chaos iterations to run | 300 |
| `--seed <number>` | Deterministic PRNG seed | 1337 |
| `--profile <smoke|targeted|full>` | Fuzzing distribution profile | smoke |
| `--actor <LockHell|RotBot|DriftHunter|HumanChaos>` | Target a specific chaos actor instead of using a profile |  |
| `--isolate` | Run the chaos engine in a dedicated temporary workspace (Default) | true |
| `--unsafe-current-dir` | Run chaos in the current directory (DANGEROUS) | false |
| `--force-ci-chaos` | Allow unsafe chaos in CI environments | false |
| `--force-chaos-destructive` | Bypass workspace protection guards | false |

### Arguments

No arguments.

### Subcommands

- [hardkas chaos replay](#hardkas-chaos-replay)

---

## hardkas chaos replay

Replay a specific chaos run deterministically

### Usage

```bash
hardkas chaos replay [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--run-seed <number>` | The run seed to replay |  |
| `--isolate` | Run in isolated workspace | true |

### Arguments

No arguments.

---

## hardkas ci

Continuous Integration and DevSecOps commands

### Usage

```bash
hardkas ci [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas ci verify](#hardkas-ci-verify)

---

## hardkas ci verify

Non-interactively verify workspace integrity, artifacts, and projections

### Usage

```bash
hardkas ci verify [options]
```

### Options

No options.

### Arguments

No arguments.

---

## hardkas config

Manage HardKAS configuration

### Usage

```bash
hardkas config [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas config init](#hardkas-config-init)
- [hardkas config networks](#hardkas-config-networks)
- [hardkas config repair](#hardkas-config-repair)
- [hardkas config show](#hardkas-config-show)

---

## hardkas config init

Initialize a basic hardkas.config.ts in the current directory

### Usage

```bash
hardkas config init [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--force` | Overwrite existing config | false |
| `--json` | Output results as JSON | false |

### Arguments

No arguments.

---

## hardkas config networks

List configured networks

### Usage

```bash
hardkas config networks [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas config repair

Repair an invalid or missing hardkas.config.ts

### Usage

```bash
hardkas config repair [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as JSON | false |

### Arguments

No arguments.

---

## hardkas config show

Show the current HardKAS configuration

### Usage

```bash
hardkas config show [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--config <path>` | Path to config file |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas console

Open an interactive REPL with HardKAS SDK pre-loaded stable

### Usage

```bash
hardkas console [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | Network name | simnet |
| `--accounts <n>` | Number of simulated accounts | 3 |
| `--balance <sompi>` | Initial balance per account in sompi | 100000000000 |

### Arguments

No arguments.

---

## hardkas corpus

Verify release fixture corpora

### Usage

```bash
hardkas corpus [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas corpus verify](#hardkas-corpus-verify)

---

## hardkas corpus verify

Verify a HardKAS golden corpus

### Usage

```bash
hardkas corpus verify [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as JSON | false |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas create

Scaffold a new HardKAS project from a template stable

### Usage

```bash
hardkas create [options] <template> <dest>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--install` | Run npm install automatically after scaffolding | false |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `template` | Name of the template (e.g. payment-app, batch-payments) |
| `dest` | Destination directory |

---

## hardkas dag

Simulate blockDAG operations (Localnet only)

### Usage

```bash
hardkas dag [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas dag simulate-reorg](#hardkas-dag-simulate-reorg)
- [hardkas dag status](#hardkas-dag-status)

---

## hardkas dag simulate-reorg

Simulate a DAG reorg

### Usage

```bash
hardkas dag simulate-reorg [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--depth <n>` | Reorg depth | 1 |

### Arguments

No arguments.

---

## hardkas dag status

View current DAG status

### Usage

```bash
hardkas dag status [options]
```

### Options

No options.

### Arguments

No arguments.

---

## hardkas deploy

Track and manage deployments

### Usage

```bash
hardkas deploy [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas deploy history](#hardkas-deploy-history)
- [hardkas deploy init](#hardkas-deploy-init)
- [hardkas deploy inspect](#hardkas-deploy-inspect)
- [hardkas deploy list](#hardkas-deploy-list)
- [hardkas deploy status](#hardkas-deploy-status)
- [hardkas deploy track](#hardkas-deploy-track)

---

## hardkas deploy history

Show deployment history across all networks stable

### Usage

```bash
hardkas deploy history [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas deploy init

Generate deployment profiles (Docker Compose, Dockerfile, .env.example) alpha

### Usage

```bash
hardkas deploy init [options]
```

### Options

No options.

### Arguments

No arguments.

---

## hardkas deploy inspect

Show full details of a deployment stable

### Usage

```bash
hardkas deploy inspect [options] <label>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | Network |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `label` |  |

---

## hardkas deploy list

List all tracked deployments stable

### Usage

```bash
hardkas deploy list [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | Filter by network |  |
| `--status <status>` | Filter by status |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas deploy status

Check deployment status (query RPC if available) stable

### Usage

```bash
hardkas deploy status [options] <label>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | Network |  |
| `--verify` | Verify against RPC node | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `label` |  |

---

## hardkas deploy track

Create a deployment record for a transaction stable

### Usage

```bash
hardkas deploy track [options] <label>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | Network where deployed |  |
| `--tx-id <txId>` | Transaction ID |  |
| `--plan <artifactId>` | Reference to plan artifact |  |
| `--receipt <artifactId>` | Reference to receipt artifact |  |
| `--status <status>` | Deployment status | sent |
| `--notes <text>` | Notes about this deployment |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `label` |  |

---

## hardkas dev

Local development and Igra-native environment tools

### Usage

```bash
hardkas dev [options] [command]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--once` | Initialize dev environment, run health checks, and exit (headless) | false |
| `--headless` | Run headlessly (no UI open) | false |

### Arguments

No arguments.

### Subcommands

- [hardkas dev accounts](#hardkas-dev-accounts)
- [hardkas dev create](#hardkas-dev-create)
- [hardkas dev doctor](#hardkas-dev-doctor)
- [hardkas dev fixture](#hardkas-dev-fixture)
- [hardkas dev init](#hardkas-dev-init)
- [hardkas dev last](#hardkas-dev-last)
- [hardkas dev tx](#hardkas-dev-tx)

---

## hardkas dev accounts

Manage simnet dev accounts

### Usage

```bash
hardkas dev accounts [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas dev accounts export](#hardkas-dev-accounts-export)
- [hardkas dev accounts list](#hardkas-dev-accounts-list)
- [hardkas dev accounts reveal](#hardkas-dev-accounts-reveal)

---

## hardkas dev accounts export

Export dev account in format suitable for Kasware manual import

### Usage

```bash
hardkas dev accounts export [options] <kasware>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--alias <alias>` | Alias to export | alice |

### Arguments

| Argument | Description |
| :--- | :--- |
| `kasware` |  |

---

## hardkas dev accounts list

List dev accounts

### Usage

```bash
hardkas dev accounts list [options]
```

### Options

No options.

### Arguments

No arguments.

---

## hardkas dev accounts reveal

Reveal private key for a dev account (simnet only)

### Usage

```bash
hardkas dev accounts reveal [options] <alias>
```

### Options

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `alias` |  |

---

## hardkas dev create

Create a new dApp project from a template stable

### Usage

```bash
hardkas dev create [options] <name>
```

### Options

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas dev doctor

Validate local dev environment readiness stable

### Usage

```bash
hardkas dev doctor [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--profile <name>` | L2 network profile name | igra |
| `--rpc-url <url>` | Explicit Igra RPC URL to check |  |
| `--account <name>` | Local EVM account name to verify balance |  |
| `--timeout <ms>` | RPC timeout in milliseconds | 3000 |
| `--json` | Output as JSON |  |
| `--release` | Run strict release gate checks |  |

### Arguments

No arguments.

---

## hardkas dev fixture

Manage dev mock fixtures

### Usage

```bash
hardkas dev fixture [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas dev fixture generate](#hardkas-dev-fixture-generate)

---

## hardkas dev fixture generate

Generate mock fixtures for testing stable

### Usage

```bash
hardkas dev fixture generate [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--type <type>` | Type of fixture (marketplace|dao|payroll|random) |  |
| `--out <path>` | Save fixture as JSON to this file |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas dev init

Initialize dApp support in the current workspace stable

### Usage

```bash
hardkas dev init [options]
```

### Options

No options.

### Arguments

No arguments.

---

## hardkas dev last

Interact with the latest local workflow

### Usage

```bash
hardkas dev last [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--inspect` | Inspect the latest artifact | false |
| `--replay` | Replay the latest workflow | false |
| `--explain` | Explain the latest workflow | false |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

No arguments.

---

## hardkas dev tx

Quick transaction flows for dev

### Usage

```bash
hardkas dev tx [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas dev tx generate](#hardkas-dev-tx-generate)
- [hardkas dev tx send](#hardkas-dev-tx-send)

---

## hardkas dev tx generate

Generate simulated load/batch transactions stable

### Usage

```bash
hardkas dev tx generate [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--count <number>` | Number of transactions to generate |  |
| `--network <name>` | Network name | simulated |
| `--workspace <path>` | Override workspace root directory |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas dev tx send

Quick send transaction

### Usage

```bash
hardkas dev tx send [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--from <accountOrAddress>` | Sender alias |  |
| `--to <address>` | Recipient address |  |
| `--amount <kas>` | Amount in KAS |  |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

No arguments.

---

## hardkas doctor

Perform a full system diagnostic and health report stable

### Usage

```bash
hardkas doctor [options] [module]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as stable JSON schema | false |
| `--capabilities` | Report local node capabilities (RPC, network, DAA) | false |
| `--consistency` | Run advanced deterministic consistency checks | false |
| `--strict` | Fail strictly (exit 1) if invariants or consistency checks fail | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `module` |  |

---

## hardkas env

Manage and validate environment configurations

### Usage

```bash
hardkas env [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas env check](#hardkas-env-check)

---

## hardkas env check

Validate the .env file against known HardKAS production variables

### Usage

```bash
hardkas env check [options]
```

### Options

No options.

### Arguments

No arguments.

---

## hardkas evidence

Manage HardKAS Evidence Packages (.hke.json) alpha

### Usage

```bash
hardkas evidence [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas evidence explain](#hardkas-evidence-explain)
- [hardkas evidence pack](#hardkas-evidence-pack)
- [hardkas evidence verify](#hardkas-evidence-verify)

---

## hardkas evidence explain

Explain the contents and claims of an evidence package

### Usage

```bash
hardkas evidence explain [options] <packagePath>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `packagePath` |  |

---

## hardkas evidence pack

Pack a scenario result and its artifacts into an evidence package

### Usage

```bash
hardkas evidence pack [options] <scenarioResultPath>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--out <path>` | Output package file path |  |
| `--workspace <path>` | Override workspace root directory |  |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `scenarioResultPath` |  |

---

## hardkas evidence verify

Verify the integrity and policy compliance of an evidence package

### Usage

```bash
hardkas evidence verify [options] <packagePath>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `packagePath` |  |

---

## hardkas explain

Provide a narrative causal explanation of a deterministic artifact, transaction, or replay stable

### Usage

```bash
hardkas explain [options] <id_or_path>
```

### Options

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `id_or_path` |  |

---

## hardkas init

Initialize a new HardKAS project stable

### Usage

```bash
hardkas init [options] [name]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--force` | Overwrite existing hardkas.config.ts (in-place only) | false |
| `--template <type>` | Project template for new projects | basic |
| `--network <name>` | Default network for new projects | simulated |
| `--accounts <n>` | Number of simulated accounts for new projects | 3 |
| `--install` | Run pnpm/npm install automatically after scaffolding | false |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` | Project name or directory |

---

## hardkas inspect

Inspect stream sizes and archive segments beta

### Usage

```bash
hardkas inspect [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as stable JSON schema | false |

### Arguments

No arguments.

---

## hardkas kaspa

Kaspa L1 native developer tools

### Usage

```bash
hardkas kaspa [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas kaspa doctor](#hardkas-kaspa-doctor)
- [hardkas kaspa wallet](#hardkas-kaspa-wallet)

---

## hardkas kaspa doctor

Verify local Kaspa L1 environment readiness stable

### Usage

```bash
hardkas kaspa doctor [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--rpc-url <url>` | Kaspa RPC URL | http://127.0.0.1:16110 |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas kaspa wallet

Manage local Kaspa L1 wallets

### Usage

```bash
hardkas kaspa wallet [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas kaspa wallet address](#hardkas-kaspa-wallet-address)
- [hardkas kaspa wallet balance](#hardkas-kaspa-wallet-balance)
- [hardkas kaspa wallet create](#hardkas-kaspa-wallet-create)
- [hardkas kaspa wallet list](#hardkas-kaspa-wallet-list)
- [hardkas kaspa wallet send](#hardkas-kaspa-wallet-send)

---

## hardkas kaspa wallet address

Show address of a local Kaspa wallet stable

### Usage

```bash
hardkas kaspa wallet address [options] <name>
```

### Options

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas kaspa wallet balance

Show balance of a local Kaspa wallet stable

### Usage

```bash
hardkas kaspa wallet balance [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--rpc-url <url>` | Kaspa RPC URL | http://127.0.0.1:16110 |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas kaspa wallet create

Create a new local Kaspa wallet stable

### Usage

```bash
hardkas kaspa wallet create [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <id>` | Kaspa network ID | simnet |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas kaspa wallet list

List local Kaspa wallets stable

### Usage

```bash
hardkas kaspa wallet list [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas kaspa wallet send

Send Kaspa between local wallets stable

### Usage

```bash
hardkas kaspa wallet send [options] <from> <to>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--amount <kas>` | Amount in KAS to send |  |
| `--dry-run` | Plan but do not sign or broadcast | false |
| `--rpc-url <url>` | Kaspa RPC URL | http://127.0.0.1:16110 |

### Arguments

| Argument | Description |
| :--- | :--- |
| `from` |  |
| `to` |  |

---

## hardkas local

Local development and environment lifecycle tools

### Usage

```bash
hardkas local [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas local wizard](#hardkas-local-wizard)

---

## hardkas local wizard

Guided setup for local development stable

### Usage

```bash
hardkas local wizard [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--profile <name>` | L2 network profile name | igra |
| `--account <name>` | New or existing EVM account name | dev_alice |
| `--non-interactive` | Skip interactive prompts (will fail if input required) | false |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas localnet

Manage localnet state and snapshots

### Usage

```bash
hardkas localnet [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas localnet account](#hardkas-localnet-account)
- [hardkas localnet fork](#hardkas-localnet-fork)
- [hardkas localnet fund](#hardkas-localnet-fund)
- [hardkas localnet snapshot](#hardkas-localnet-snapshot)
- [hardkas localnet start](#hardkas-localnet-start)
- [hardkas localnet status](#hardkas-localnet-status)
- [hardkas localnet stop](#hardkas-localnet-stop)

---

## hardkas localnet account

Manage simulated localnet accounts

### Usage

```bash
hardkas localnet account [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas localnet account create](#hardkas-localnet-account-create)

---

## hardkas localnet account create

Create a simulated localnet account alpha

### Usage

```bash
hardkas localnet account create [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas localnet fork

Fork state from a real Kaspa network for local simulation preview

### Usage

```bash
hardkas localnet fork [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | Network to fork from |  |
| `--addresses <addrs...>` | Only fetch UTXOs for these addresses |  |
| `--at-daa-score <score>` | Fork at specific DAA score (implicit latest is forbidden) |  |
| `--output <path>` | Save fork snapshot to file |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas localnet fund

Fund a local Toccata/simnet account alpha

### Usage

```bash
hardkas localnet fund [options] <identifier>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--profile <name>` | Funding profile | toccata-v2 |
| `--amount <kas>` | Target mining amount hint in KAS | 1000 |
| `--timeout <ms>` | Funding/maturity wait timeout in ms | 300000 |
| `--keep-miner` | Leave the companion miner running | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `identifier` |  |

---

## hardkas localnet snapshot

Manage HardKAS localnet snapshots

### Usage

```bash
hardkas localnet snapshot [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas localnet snapshot create](#hardkas-localnet-snapshot-create)
- [hardkas localnet snapshot replay](#hardkas-localnet-snapshot-replay)
- [hardkas localnet snapshot verify](#hardkas-localnet-snapshot-verify)

---

## hardkas localnet snapshot create

Create a deterministic snapshot of current localnet state alpha

### Usage

```bash
hardkas localnet snapshot create [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--consensus-validated` | Mark snapshot as validated by consensus (strict) | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas localnet snapshot replay

Replay and rebuild deterministic state from a snapshot alpha

### Usage

```bash
hardkas localnet snapshot replay [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas localnet snapshot verify

Verify the integrity of a snapshot preview

### Usage

```bash
hardkas localnet snapshot verify [options] <idOrName>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `idOrName` |  |

---

## hardkas localnet start

Start localnet profile alpha

### Usage

```bash
hardkas localnet start [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--profile <name>` | Localnet profile | simulated |
| `--toccata` | Shortcut for --profile toccata-v2 | false |
| `--detached` | Run in background | false |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas localnet status

Show localnet status alpha

### Usage

```bash
hardkas localnet status [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas localnet stop

Stop localnet profile alpha

### Usage

```bash
hardkas localnet stop [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--profile <name>` | Localnet profile | simulated |
| `--toccata` | Shortcut for --profile toccata-v2 | false |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas lock

Manage HardKAS workspace locks

### Usage

```bash
hardkas lock [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas lock clear](#hardkas-lock-clear)
- [hardkas lock doctor](#hardkas-lock-doctor)
- [hardkas lock list](#hardkas-lock-list)
- [hardkas lock status](#hardkas-lock-status)

---

## hardkas lock clear

Safely or forcibly clear a lock stable

### Usage

```bash
hardkas lock clear [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--if-dead` | Only clear if the process is no longer running | false |
| `--force` | Forcibly clear the lock even if the process is alive | false |
| `--yes` | Confirm clearing without prompt | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas lock doctor

Analyze locks and identify stale or corrupted ones stable

### Usage

```bash
hardkas lock doctor [options]
```

### Options

No options.

### Arguments

No arguments.

---

## hardkas lock list

List all active workspace locks stable

### Usage

```bash
hardkas lock list [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas lock status

Show status of one or all locks stable

### Usage

```bash
hardkas lock status [options] [name]
```

### Options

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas node

Kaspa node management (Docker)

### Usage

```bash
hardkas node [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas node logs](#hardkas-node-logs)
- [hardkas node reset](#hardkas-node-reset)
- [hardkas node restart](#hardkas-node-restart)
- [hardkas node start](#hardkas-node-start)
- [hardkas node status](#hardkas-node-status)
- [hardkas node stop](#hardkas-node-stop)

---

## hardkas node logs

View node logs preview

### Usage

```bash
hardkas node logs [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--tail <n>` | Number of lines to show | 100 |
| `--follow` | Follow log output | false |
| `--json` | Output results as JSON | false |

### Arguments

No arguments.

---

## hardkas node reset

Stop node and remove all local chain data preview

### Usage

```bash
hardkas node reset [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--start` | Restart the node after reset | false |
| `--yes` | Skip confirmation prompt | false |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |
| `--json` | Output results as JSON | false |

### Arguments

No arguments.

---

## hardkas node restart

Restart local node stable

### Usage

```bash
hardkas node restart [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |
| `--json` | Output results as JSON | false |

### Arguments

No arguments.

---

## hardkas node start

Start local node stable

### Usage

```bash
hardkas node start [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--image <image>` | Docker image |  |
| `--allow-floating-image` | Allow using a floating tag like 'latest' without warning | false |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |
| `--json` | Output results as JSON | false |

### Arguments

No arguments.

---

## hardkas node status

Check node status

### Usage

```bash
hardkas node status [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Return status in JSON format | false |

### Arguments

No arguments.

---

## hardkas node stop

Stop local node stable

### Usage

```bash
hardkas node stop [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |
| `--json` | Output results as JSON | false |

### Arguments

No arguments.

---

## hardkas programmability

Builder-ready local programmability surface (Outputs JSON by default)

### Usage

```bash
hardkas programmability [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas programmability app](#hardkas-programmability-app)
- [hardkas programmability audit](#hardkas-programmability-audit)
- [hardkas programmability capabilities](#hardkas-programmability-capabilities)
- [hardkas programmability corpus](#hardkas-programmability-corpus)
- [hardkas programmability inspect](#hardkas-programmability-inspect)
- [hardkas programmability verify](#hardkas-programmability-verify)

---

## hardkas programmability app

Plan builder app surfaces

### Usage

```bash
hardkas programmability app [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas programmability app plan](#hardkas-programmability-app-plan)

---

## hardkas programmability app plan

Return a local app plan for a programmable HardKAS app

### Usage

```bash
hardkas programmability app plan [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--kind <kind>` | silver, zk, vprog, or full-lab | full-lab |
| `--template <path>` | Template path |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas programmability audit

Audit the boundaries and claims of programmability layers

### Usage

```bash
hardkas programmability audit [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas programmability capabilities

Show local programmability capabilities

### Usage

```bash
hardkas programmability capabilities [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas programmability corpus

Verify local programmability corpora

### Usage

```bash
hardkas programmability corpus [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas programmability corpus verify](#hardkas-programmability-corpus-verify)

---

## hardkas programmability corpus verify

Verify the root Toccata programmability corpus

### Usage

```bash
hardkas programmability corpus verify [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas programmability inspect

Inspect a Silver, ZK, or vProgs artifact

### Usage

```bash
hardkas programmability inspect [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--kind <kind>` | Artifact kind: silver, zk, or vprog |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas programmability verify

Verify a local programmability artifact

### Usage

```bash
hardkas programmability verify [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--kind <kind>` | Artifact kind: silver, zk, or vprog |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas pskt

Portable Signing Sessions (PSKT) offline coordination

### Usage

```bash
hardkas pskt [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas pskt capabilities](#hardkas-pskt-capabilities)
- [hardkas pskt export](#hardkas-pskt-export)
- [hardkas pskt extract](#hardkas-pskt-extract)
- [hardkas pskt finalize](#hardkas-pskt-finalize)
- [hardkas pskt import](#hardkas-pskt-import)
- [hardkas pskt inspect](#hardkas-pskt-inspect)
- [hardkas pskt merge](#hardkas-pskt-merge)
- [hardkas pskt sign](#hardkas-pskt-sign)
- [hardkas pskt verify](#hardkas-pskt-verify)

---

## hardkas pskt capabilities

Show PSKT adapter capabilities alpha

### Usage

```bash
hardkas pskt capabilities [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--adapter <adapterId>` | Specific adapter ID to query (default: kaspa-wasm-local) |  |
| `--json` | Output results as JSON | false |

### Arguments

No arguments.

---

## hardkas pskt export

Export a TxPlan as a Portable Signing Session alpha

### Usage

```bash
hardkas pskt export [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--plan <planPath>` | Path to the TxPlan JSON artifact |  |
| `--out <sessionPath>` | Path to write the new PSKT session JSON |  |
| `--adapter <adapterId>` | Specific adapter ID to bind to (default: kaspa-wasm-local) |  |
| `--force` | Overwrite the output file if it exists | false |
| `--json` | Output results as JSON | false |

### Arguments

No arguments.

---

## hardkas pskt extract

Extract KaspaRpcTransaction from a finalized PSKT session alpha

### Usage

```bash
hardkas pskt extract [options] <sessionPath>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--out <outputPath>` | Path to write the Kaspa transaction JSON |  |
| `--force` | Overwrite the output file if it exists | false |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `sessionPath` |  |

---

## hardkas pskt finalize

Finalize a PSKT session alpha

### Usage

```bash
hardkas pskt finalize [options] <sessionPath>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--out <outputPath>` | Path to write the finalized PSKT session JSON |  |
| `--force` | Overwrite the output file if it exists | false |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `sessionPath` |  |

---

## hardkas pskt import

Import a raw payload into a PSKT session alpha

### Usage

```bash
hardkas pskt import [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--file <sessionPath>` | Path to the PSKT session JSON |  |
| `--payload <payloadPath>` | Path to the raw payload file |  |
| `--out <outputPath>` | Path to write the updated PSKT session JSON |  |
| `--force` | Overwrite the output file if it exists | false |
| `--json` | Output results as JSON | false |

### Arguments

No arguments.

---

## hardkas pskt inspect

Inspect a PSKT session payload and metadata alpha

### Usage

```bash
hardkas pskt inspect [options] <sessionPath>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `sessionPath` |  |

---

## hardkas pskt merge

Merge two PSKT sessions alpha

### Usage

```bash
hardkas pskt merge [options] <sessionA> <sessionB>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--out <outputPath>` | Path to write the merged PSKT session JSON |  |
| `--force` | Overwrite the output file if it exists | false |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `sessionA` |  |
| `sessionB` |  |

---

## hardkas pskt sign

Sign a PSKT session payload alpha

### Usage

```bash
hardkas pskt sign [options] <sessionPath>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--account <name>` | Name of the HardKAS L1 account to sign with |  |
| `--keystore <path>` | Path to a HardKAS keystore JSON file |  |
| `--key-stdin` | Read private key from standard input |  |
| `--private-key-file <path>` | Path to file containing raw private key (TEST ONLY) |  |
| `--out <outputPath>` | Path to write the updated PSKT session JSON |  |
| `--force` | Overwrite the output file if it exists | false |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `sessionPath` |  |

---

## hardkas pskt verify

Verify integrity and lineage of a PSKT session alpha

### Usage

```bash
hardkas pskt verify [options] <sessionPath>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `sessionPath` |  |

---

## hardkas query

Query and introspect HardKAS artifacts, lineage, and workflows

### Usage

```bash
hardkas query [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas query artifacts](#hardkas-query-artifacts)
- [hardkas query dag](#hardkas-query-dag)
- [hardkas query events](#hardkas-query-events)
- [hardkas query lineage](#hardkas-query-lineage)
- [hardkas query replay](#hardkas-query-replay)
- [hardkas query store](#hardkas-query-store)
- [hardkas query tx](#hardkas-query-tx)

---

## hardkas query artifacts

Query artifact store stable

### Usage

```bash
hardkas query artifacts [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas query artifacts diff](#hardkas-query-artifacts-diff)
- [hardkas query artifacts inspect](#hardkas-query-artifacts-inspect)
- [hardkas query artifacts list](#hardkas-query-artifacts-list)

---

## hardkas query artifacts diff

Semantic diff between two artifacts

### Usage

```bash
hardkas query artifacts diff [options] <left> <right>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `left` |  |
| `right` |  |

---

## hardkas query artifacts inspect

Deep structural analysis of an artifact (path or contentHash)

### Usage

```bash
hardkas query artifacts inspect [options] <target>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--explain [level]` | Attach explain chains (brief|full) |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `target` |  |

---

## hardkas query artifacts list

**Aliases:** ls

List artifacts matching filters

### Usage

```bash
hardkas query artifacts list [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--schema <schema>` | Filter by artifact schema (e.g. txPlan, signedTx) |  |
| `--network <network>` | Filter by network ID |  |
| `--mode <mode>` | Filter by mode (simulated/real) |  |
| `--from <address>` | Filter by sender address |  |
| `--to <address>` | Filter by recipient address |  |
| `--sort <field:dir>` | Sort field and direction (e.g. createdAt:desc) |  |
| `--limit <n>` | Max results | 100 |
| `--json` | Output as deterministic JSON | false |
| `--explain [level]` | Attach explain chains (brief|full) |  |

### Arguments

No arguments.

---

## hardkas query dag

Query simulated DAG state research

### Usage

```bash
hardkas query dag [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas query dag anomalies](#hardkas-query-dag-anomalies)
- [hardkas query dag conflicts](#hardkas-query-dag-conflicts)
- [hardkas query dag displaced](#hardkas-query-dag-displaced)
- [hardkas query dag history](#hardkas-query-dag-history)
- [hardkas query dag sink-path](#hardkas-query-dag-sink-path)

---

## hardkas query dag anomalies

Find transactions or blocks in unexpected states

### Usage

```bash
hardkas query dag anomalies [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--explain [level]` | Attach explain chains (brief|full) |  |

### Arguments

No arguments.

---

## hardkas query dag conflicts

Show double-spend conflict analysis

### Usage

```bash
hardkas query dag conflicts [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--explain [level]` | Attach explain chains (brief|full) |  |
| `--why` | Shorthand for --explain full |  |

### Arguments

No arguments.

---

## hardkas query dag displaced

Show displaced transactions

### Usage

```bash
hardkas query dag displaced [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--explain [level]` | Attach explain chains (brief|full) |  |

### Arguments

No arguments.

---

## hardkas query dag history

Full lifecycle of a transaction through the DAG

### Usage

```bash
hardkas query dag history [options] <txId>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--explain [level]` | Attach explain chains (brief|full) |  |
| `--why` | Shorthand for --explain full |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `txId` |  |

---

## hardkas query dag sink-path

Show current selected path from genesis to sink

### Usage

```bash
hardkas query dag sink-path [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas query events

Query event log

### Usage

```bash
hardkas query events [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--tx <txId>` | Filter events by transaction ID |  |
| `--domain <domain>` | Filter by event domain |  |
| `--kind <kind>` | Filter by event kind |  |
| `--workflow <workflowId>` | Filter by workflow ID |  |
| `--limit <n>` | Max results | 100 |
| `--json` | Output as deterministic JSON | false |
| `--explain [level]` | Attach explain metadata (brief|full) |  |

### Arguments

No arguments.

---

## hardkas query lineage

Traverse artifact lineage stable

### Usage

```bash
hardkas query lineage [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas query lineage chain](#hardkas-query-lineage-chain)
- [hardkas query lineage orphans](#hardkas-query-lineage-orphans)
- [hardkas query lineage transitions](#hardkas-query-lineage-transitions)

---

## hardkas query lineage chain

Reconstruct lineage chain from an artifact (contentHash or artifactId)

### Usage

```bash
hardkas query lineage chain [options] <anchor>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--direction <dir>` | Traversal direction: ancestors or descendants | ancestors |
| `--json` | Output as JSON | false |
| `--explain [level]` | Attach explain chains (brief|full) |  |
| `--why` | Shorthand for --explain full |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `anchor` |  |

---

## hardkas query lineage orphans

Find artifacts with broken lineage references

### Usage

```bash
hardkas query lineage orphans [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--explain [level]` | Attach explain chains (brief|full) |  |

### Arguments

No arguments.

---

## hardkas query lineage transitions

List all lineage transitions

### Usage

```bash
hardkas query lineage transitions [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--root <hash>` | Filter by root artifact ID |  |
| `--json` | Output as JSON | false |
| `--explain [level]` | Attach explain chains (brief|full) |  |
| `--why` | Shorthand for --explain full |  |

### Arguments

No arguments.

---

## hardkas query replay

Inspect replay history and divergence stable

### Usage

```bash
hardkas query replay [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas query replay divergences](#hardkas-query-replay-divergences)
- [hardkas query replay invariants](#hardkas-query-replay-invariants)
- [hardkas query replay list](#hardkas-query-replay-list)
- [hardkas query replay summary](#hardkas-query-replay-summary)

---

## hardkas query replay divergences

Detect receipts with replay divergence indicators

### Usage

```bash
hardkas query replay divergences [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--explain [level]` | Attach explain chains (brief|full) |  |

### Arguments

No arguments.

---

## hardkas query replay invariants

Check replay invariants for a specific transaction

### Usage

```bash
hardkas query replay invariants [options] <txId>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--explain [level]` | Attach explain chains (brief|full) |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `txId` |  |

---

## hardkas query replay list

**Aliases:** ls

List all stored receipts

### Usage

```bash
hardkas query replay list [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--status <status>` | Filter by status |  |
| `--json` | Output as JSON | false |
| `--limit <n>` | Max results | 100 |

### Arguments

No arguments.

---

## hardkas query replay summary

Detailed receipt + trace summary for a transaction

### Usage

```bash
hardkas query replay summary [options] <txId>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `txId` |  |

---

## hardkas query store

Manage query store index stable

### Usage

```bash
hardkas query store [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas query store doctor](#hardkas-query-store-doctor)
- [hardkas query store export](#hardkas-query-store-export)
- [hardkas query store migrate](#hardkas-query-store-migrate)
- [hardkas query store rebuild](#hardkas-query-store-rebuild)
- [hardkas query store sql](#hardkas-query-store-sql)
- [hardkas query store sync](#hardkas-query-store-sync)

---

## hardkas query store doctor

Integrity and freshness check of the query store index

### Usage

```bash
hardkas query store doctor [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--migrate` | Apply pending migrations if found | false |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |

### Arguments

No arguments.

---

## hardkas query store export

Export logical store state to JSON

### Usage

```bash
hardkas query store export [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--output <path>` | Output file path |  |

### Arguments

No arguments.

---

## hardkas query store migrate

Apply pending schema migrations to the query store

### Usage

```bash
hardkas query store migrate [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |

### Arguments

No arguments.

---

## hardkas query store rebuild

Force a complete rebuild of the query store index

### Usage

```bash
hardkas query store rebuild [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--backend <type>` | Backend to use (sqlite/filesystem) |  |
| `--strict` | Fail on any corrupted data | false |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas query store sql

Run a raw SQL query against the query store

### Usage

```bash
hardkas query store sql [options] <query>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--unsafe-write` | Allow mutating SQL (DANGEROUS) | false |
| `--yes` | Confirm mutating SQL (DANGEROUS) | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `query` |  |

---

## hardkas query store sync

**Aliases:** index

Synchronize the filesystem artifacts with the query store index

### Usage

```bash
hardkas query store sync [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--strict` | Fail on any corrupted data | false |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas query tx

Aggregate all data for a transaction stable

### Usage

```bash
hardkas query tx [options] <txId>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as deterministic JSON | false |
| `--explain [level]` | Attach explain metadata (brief|full) |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `txId` |  |

---

## hardkas rebuild

Reconstruct projections from committed canonical artifacts stable

### Usage

```bash
hardkas rebuild [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--from-artifacts` | Rebuild the query-store and localnet projection from artifacts | false |
| `--json` | Output machine-readable JSON | false |

### Arguments

No arguments.

---

## hardkas repair

Attempt automatic recovery of corrupt projections or append tails beta

### Usage

```bash
hardkas repair [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as stable JSON schema | false |
| `--force` | Repair without prompting for confirmation | false |

### Arguments

No arguments.

---

## hardkas replay

Manage HardKAS transaction replays

### Usage

```bash
hardkas replay [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas replay diff](#hardkas-replay-diff)
- [hardkas replay verify](#hardkas-replay-verify)

---

## hardkas replay diff

Compare two replay artifacts for deterministic divergence alpha

### Usage

```bash
hardkas replay diff [options] <idA> <idB>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `idA` |  |
| `idB` |  |

---

## hardkas replay verify

Verify replay invariants for a directory of artifacts stable

### Usage

```bash
hardkas replay verify [options] [path]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas rotate

Rotate and archive telemetry streams beta

### Usage

```bash
hardkas rotate [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as stable JSON schema | false |
| `--force` | Force rotation even if file size is below threshold | false |

### Arguments

No arguments.

---

## hardkas rpc

Kaspa RPC diagnostics and queries

### Usage

```bash
hardkas rpc [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas rpc dag](#hardkas-rpc-dag)
- [hardkas rpc doctor](#hardkas-rpc-doctor)
- [hardkas rpc health](#hardkas-rpc-health)
- [hardkas rpc info](#hardkas-rpc-info)
- [hardkas rpc mempool](#hardkas-rpc-mempool)
- [hardkas rpc utxos](#hardkas-rpc-utxos)

---

## hardkas rpc dag

Show DAG information from node

### Usage

```bash
hardkas rpc dag [options]
```

### Options

No options.

### Arguments

No arguments.

---

## hardkas rpc doctor

Run comprehensive RPC diagnostics

### Usage

```bash
hardkas rpc doctor [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--endpoints <urls...>` | Specific endpoints to audit |  |

### Arguments

No arguments.

---

## hardkas rpc health

Check RPC health

### Usage

```bash
hardkas rpc health [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--wait` | Wait until healthy |  |
| `--timeout <ms>` | Timeout in ms |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas rpc info

Show RPC connection info

### Usage

```bash
hardkas rpc info [options]
```

### Options

No options.

### Arguments

No arguments.

---

## hardkas rpc mempool

Show mempool status from node

### Usage

```bash
hardkas rpc mempool [options] [txId]
```

### Options

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `txId` |  |

---

## hardkas rpc utxos

Show UTXOs for an address from node

### Usage

```bash
hardkas rpc utxos [options] <address>
```

### Options

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `address` |  |

---

## hardkas run

Execute a TypeScript or JavaScript file with HardKAS SDK injected stable

### Usage

```bash
hardkas run [options] <script>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | Network name | simnet |
| `--accounts <n>` | Number of simulated accounts | 3 |
| `--balance <sompi>` | Initial balance per account in sompi | 100000000000 |
| `--no-harness` | Skip automatic harness creation |  |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `script` |  |

---

## hardkas sandbox

Start a temporary, ephemeral HardKAS local experimentation environment

### Usage

```bash
hardkas sandbox [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--with-node` | Start a simulated Kaspa node in the background with mining |  |
| `--recipe <name>` | Run an initial recipe/template inside the sandbox |  |
| `-p, --port <port>` | Port for dashboard | 3000 |
| `-h, --host <host>` | Host for dashboard | localhost |

### Arguments

No arguments.

---

## hardkas security

Security DX and safety verification tools

### Usage

```bash
hardkas security [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas security audit](#hardkas-security-audit)

---

## hardkas security audit

Audit workspace for DX safety and secret leakage

### Usage

```bash
hardkas security audit [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--include <path>` | Extra path to include in search |  |

### Arguments

No arguments.

---

## hardkas session

L1/L2 developer identity linkage and sessions

### Usage

```bash
hardkas session [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas session create](#hardkas-session-create)
- [hardkas session list](#hardkas-session-list)
- [hardkas session status](#hardkas-session-status)
- [hardkas session use](#hardkas-session-use)

---

## hardkas session create

Create a new L1/L2 session linkage alpha

### Usage

```bash
hardkas session create [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--l1 <wallet>` | Name of the Kaspa L1 wallet |  |
| `--l2 <account>` | Name of the Igra L2 account |  |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas session list

List all configured sessions alpha

### Usage

```bash
hardkas session list [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as JSON | false |

### Arguments

No arguments.

---

## hardkas session status

Show active session linkage alpha

### Usage

```bash
hardkas session status [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as JSON | false |

### Arguments

No arguments.

---

## hardkas session use

Set the active session alpha

### Usage

```bash
hardkas session use [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas simulator

HardKAS Simulator management

### Usage

```bash
hardkas simulator [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas simulator account](#hardkas-simulator-account)
- [hardkas simulator fund](#hardkas-simulator-fund)

---

## hardkas simulator account

Manage synthetic simulated accounts

### Usage

```bash
hardkas simulator account [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas simulator account create](#hardkas-simulator-account-create)

---

## hardkas simulator account create

Create a synthetic simulated account stable

### Usage

```bash
hardkas simulator account create [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas simulator fund

Fund a synthetic simulated account stable

### Usage

```bash
hardkas simulator fund [options] <identifier>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--amount <kas>` | Amount in KAS to fund | 1000 |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `identifier` |  |

---

## hardkas status

Display the current state of the local HardKAS runtime workspace

### Usage

```bash
hardkas status [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

No arguments.

---

## hardkas task

Execute an evidence-aware custom task

### Usage

```bash
hardkas task [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas task <name>](#hardkas-task-<name>)

---

## hardkas task <name>

Run a task

### Usage

```bash
hardkas task <name> [options]
```

### Options

No options.

### Arguments

No arguments.

---

## hardkas telemetry

Inspect, verify, and monitor the canonical runtime pressure telemetry stream

### Usage

```bash
hardkas telemetry [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas telemetry inspect](#hardkas-telemetry-inspect)
- [hardkas telemetry tail](#hardkas-telemetry-tail)
- [hardkas telemetry verify](#hardkas-telemetry-verify)

---

## hardkas telemetry inspect

Deep introspection of the telemetry stream stable

### Usage

```bash
hardkas telemetry inspect [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--limit <n>` | Number of recent events to display | 5 |

### Arguments

No arguments.

---

## hardkas telemetry tail

Real-time monitor of the telemetry stream stable

### Usage

```bash
hardkas telemetry tail [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `-f, --follow` | Keep checking for incoming telemetry events | false |
| `-n, --lines <n>` | Number of initial lines to tail | 20 |

### Arguments

No arguments.

---

## hardkas telemetry verify

Verify schema integrity conforming to Telemetry Source Contract v1 stable

### Usage

```bash
hardkas telemetry verify [options]
```

### Options

No options.

### Arguments

No arguments.

---

## hardkas test

Run HardKAS tests against localnet stable

### Usage

```bash
hardkas test [options] [files...]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <network>` | Network to test against | simnet |
| `--watch` | Watch for changes | false |
| `--mass-report` | Show mass/fee report after scenario execution | false |
| `--mass-snapshot <label>` | Save mass snapshot for regression detection |  |
| `--mass-compare <label>` | Compare against saved mass snapshot |  |
| `--json` | Output results as JSON | false |
| `--keep-runs` | Keep temporary scenario workspaces for debugging | false |
| `--evidence` | Automatically package evidence into .hke.json | false |
| `--scenario <name>` | Run specific scenario by name |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `files` |  |

---

## hardkas torture

HardKAS Semantic Torture Testing Suite

### Usage

```bash
hardkas torture [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas torture matrix](#hardkas-torture-matrix)
- [hardkas torture replay](#hardkas-torture-replay)

---

## hardkas torture matrix

Execute the deterministic chaos-and-mutation torture matrix alpha

### Usage

```bash
hardkas torture matrix [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--iterations <number>` | Number of torture cases to execute | 300 |
| `--seed <seed>` | Seed value for deterministic inputs or 'random' | random |
| `--report [path]` | Optional custom JSON output filepath for findings report |  |
| `--bucket <name>` | Optional target bucket name to execute exclusively |  |
| `--profile <name>` | Optional profile name to execute |  |
| `--debug-stack` | Print raw stacktraces when cases fail | false |

### Arguments

No arguments.

---

## hardkas torture replay

Replay and debug a specific failed case from a torture run alpha

### Usage

```bash
hardkas torture replay [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--seed <number>` | Original global seed of the failed matrix run |  |
| `--case <caseId>` | Failed case ID, e.g. case-001 |  |
| `--profile <name>` | Original profile filter of the failed matrix run |  |

### Arguments

No arguments.

---

## hardkas tx

L1 Transaction commands

### Usage

```bash
hardkas tx [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas tx batch](#hardkas-tx-batch)
- [hardkas tx compare](#hardkas-tx-compare)
- [hardkas tx plan](#hardkas-tx-plan)
- [hardkas tx profile](#hardkas-tx-profile)
- [hardkas tx receipt](#hardkas-tx-receipt)
- [hardkas tx send](#hardkas-tx-send)
- [hardkas tx sign](#hardkas-tx-sign)
- [hardkas tx status](#hardkas-tx-status)
- [hardkas tx trace](#hardkas-tx-trace)
- [hardkas tx verify](#hardkas-tx-verify)
- [hardkas tx wait](#hardkas-tx-wait)

---

## hardkas tx batch

Process a batch of transactions sequentially stable

### Usage

```bash
hardkas tx batch [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--file <path>` | Path to JSON file containing batch payments |  |
| `--network <name>` | Network name |  |
| `--workspace <path>` | Override workspace root directory |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas tx compare

Compare simulated vs real receipts for fidelity stable

### Usage

```bash
hardkas tx compare [options] <simulatedPath> <realPath>
```

### Options

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `simulatedPath` |  |
| `realPath` |  |

---

## hardkas tx plan

Build a transaction plan artifact stable

### Usage

```bash
hardkas tx plan [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--target <name>` | Named execution target from hardkas.config.ts |  |
| `--from <accountOrAddress>` | Sender account name or address |  |
| `--to <address>` | Recipient address |  |
| `--amount <kas>` | Amount in KAS |  |
| `--network <name>` | Kaspa network name |  |
| `--fee-rate <sompiPerMass>` | Fee rate in sompi per mass |  |
| `--provider <type>` | Provider mode (auto, rpc, simulated) | auto |
| `--url <url>` | RPC URL (optional override) |  |
| `--out <path>` | Save plan as artifact JSON |  |
| `--save <path>` | Alias for --out (Save plan as artifact JSON) |  |
| `--workflow-id <id>` | Optional deterministic workflow ID override |  |
| `--assumption-level <level>` | Optional assumption level override |  |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas tx profile

Show detailed mass and fee breakdown for a transaction plan stable

### Usage

```bash
hardkas tx profile [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas tx receipt

Show transaction receipt stable

### Usage

```bash
hardkas tx receipt [options] <txId>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `txId` |  |

---

## hardkas tx send

Broadcast a signed transaction or send directly stable

### Usage

```bash
hardkas tx send [options] [signedPath]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--target <name>` | Named execution target from hardkas.config.ts |  |
| `--from <accountOrAddress>` | Sender (shortcut mode) |  |
| `--to <address>` | Recipient (shortcut mode) |  |
| `--amount <kas>` | Amount in KAS (shortcut mode) |  |
| `--network <name>` | Network name |  |
| `--fee-rate <sompiPerMass>` | Fee rate in sompi per mass (shortcut mode) |  |
| `--provider <type>` | Provider mode (auto, rpc, simulated) | auto |
| `--url <url>` | RPC URL (optional override) |  |
| `--yes` | Confirm broadcast | false |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |
| `--json` | Output as JSON | false |
| `--track <label>` | Auto-track deployment with this label |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `signedPath` |  |

---

## hardkas tx sign

Sign a transaction plan artifact stable

### Usage

```bash
hardkas tx sign [options] <planPath>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--account <name>` | Account name to sign with |  |
| `--out <path>` | Save signed artifact JSON |  |
| `--fixture` | Use fixture signer for Docker testing on simnet | false |
| `--allow-mainnet-signing` | Allow signing for mainnet | false |
| `--threshold <number>` | Multisig threshold |  |
| `--required-signers <list>` | Comma-separated list of required signers |  |
| `--append` | Append signature to a partially signed transaction | false |
| `--target <name>` | Named execution target from hardkas.config.ts |  |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `planPath` |  |

---

## hardkas tx status

Show the signature coverage and status of a transaction artifact

### Usage

```bash
hardkas tx status [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas tx trace

Reconstruct the full operational trace of a transaction research

### Usage

```bash
hardkas tx trace [options] <txId>
```

### Options

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `txId` |  |

---

## hardkas tx verify

Perform deep semantic verification of a transaction plan preview

### Usage

```bash
hardkas tx verify [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas tx wait

Wait for transaction to be confirmed stable

### Usage

```bash
hardkas tx wait [options] <txId>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--timeout <seconds>` | Timeout in seconds | 60 |
| `--url <url>` | Override RPC URL |  |
| `-n, --network <network>` | Network to use |  |
| `--address <address>` | Recipient address to verify UTXO maturity |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `txId` |  |

---

## hardkas up

Boot or validate the HardKAS developer runtime environment stable

### Usage

```bash
hardkas up [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as JSON | false |

### Arguments

No arguments.

---

## hardkas verify

Verify artifact integrity and lineage continuity across the workspace stable

### Usage

```bash
hardkas verify [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--deep` | Perform a deep validation of signatures and causality | false |
| `--json` | Output machine-readable JSON | false |

### Arguments

No arguments.

---

## hardkas verify-semantics

Verify semantic truth agreement across all HardKAS subsystems alpha

### Usage

```bash
hardkas verify-semantics [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output machine-readable JSON | false |
| `--ci-mode` | Verify semantic truth equivalence across OS boundaries | false |

### Arguments

No arguments.

---

## hardkas why

Explain the causal lineage of a given artifact ID

### Usage

```bash
hardkas why [options] <artifactId>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output lineage graph in JSON format |  |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `artifactId` | The full or partial ID of the artifact |

---

## hardkas workflow

Programmable deterministic workflows and agent orchestration alpha

### Usage

```bash
hardkas workflow [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas workflow create](#hardkas-workflow-create)
- [hardkas workflow diff](#hardkas-workflow-diff)
- [hardkas workflow inspect](#hardkas-workflow-inspect)
- [hardkas workflow replay](#hardkas-workflow-replay)
- [hardkas workflow run](#hardkas-workflow-run)

---

## hardkas workflow create

Create a deterministic workflow from a template

### Usage

```bash
hardkas workflow create [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--template <name>` | Embedded template name |  |
| `--out <path>` | Output artifact file path |  |
| `--json` | Output the final workflow artifact as JSON | false |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas workflow diff

Compare two workflow artifacts structurally

### Usage

```bash
hardkas workflow diff [options] <a> <b>
```

### Options

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `a` |  |
| `b` |  |

---

## hardkas workflow inspect

Inspect a completed workflow artifact

### Usage

```bash
hardkas workflow inspect [options] <id>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output full artifact as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `id` |  |

---

## hardkas workflow replay

Deterministically replay and verify a workflow's lineage

### Usage

```bash
hardkas workflow replay [options] <id>
```

### Options

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `id` |  |

---

## hardkas workflow run

Execute a workflow JSON definition in Agent mode

### Usage

```bash
hardkas workflow run [options] <file>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--dry-run` | Simulate the workflow without mutating the filesystem | false |
| `--network <net>` | Target network (e.g. simulated, testnet-10, mainnet) |  |
| `--offline` | Force offline execution (rejects real RPC connections) | false |
| `--timeout <ms>` | Maximum execution time in milliseconds |  |
| `--json` | Output the final workflow artifact as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `file` |  |

