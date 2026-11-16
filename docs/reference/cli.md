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
| `--network <name>` | Kaspa network name (default: the workspace's default target) |  |
| `--provider <type>` | Provider mode (auto, rpc, simulated) | auto |
| `--url <url>` | RPC URL (optional override) |  |
| `--local` | Read the simulator state file (.hardkas/localnet.json) instead of a node | false |
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
| `--allow-mainnet` | No effect: mainnet is blocked (MAINNET TOTAL LOCKDOWN) and executing on mainnet stays refused (MAINNET_BROADCAST_DISABLED) |  |
| `--password-env <env>` | Read the encrypted account's keystore password from this environment variable (read once, before the first batch) |  |
| `--password-stdin` | Read the encrypted account's keystore password from stdin |  |
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
| `--password-env <env>` | Read the current keystore password from this environment variable |  |
| `--password-stdin` | Read the current keystore password from stdin (needs --new-password-env) | false |
| `--new-password-env <env>` | Read the new keystore password from this environment variable (no confirmation prompt) |  |
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
| `--network <network>` | Kaspa network (simnet, testnet-10; mainnet is refused while mainnet is locked down: MAINNET_SIGNING_DISABLED) | simnet |
| `--password-stdin` | Read keystore password from stdin | false |
| `--password-env <env>` | Read password from environment variable |  |
| `--unsafe-plaintext` | Generate accounts in plaintext (legacy/discouraged) | false |
| `--ecdsa` | Make ECDSA accounts: the address is the key's ECDSA P2PK address (version 1), recorded with the account and in its keystore's authenticated metadata; HardKAS signs their payments with ECDSA (RFC 6979, low-S). Default: Schnorr | false |
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
| `--name <name>` | Account name: letters, digits, _ and - (default: default) |  |
| `--address <address>` | Kaspa address |  |
| `--network <network>` | Network the key is for (default: the address's: kaspasim simnet, kaspadev devnet; a kaspatest address needs testnet-<n> here or in the workspace). A mainnet network or address is refused while mainnet is locked down (MAINNET_SIGNING_DISABLED) |  |
| `--private-key <hex>` | Deprecated. Unsafe: may leak through shell history. Prefer --private-key-stdin or --private-key-env. |  |
| `--private-key-stdin` | Read private key from stdin | false |
| `--private-key-env <env>` | Read private key from environment variable |  |
| `--password-stdin` | Read keystore password from stdin (safe) | false |
| `--password-env <env>` | Read keystore password from environment variable (safe) |  |
| `--unsafe-plaintext` | Store private key in plaintext (legacy/discouraged) | false |
| `--fixture <name>` | Import deterministic fixture test account |  |
| `--ecdsa` | The key is imported as an ECDSA account: --address must be its ECDSA P2PK address (an ECDSA address without this flag is refused: ACCOUNT_KEY_SCHEME_MISMATCH). Default: Schnorr | false |
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
| `--force` | Replace an existing store with an empty one (the old store is copied to a backup first; refused when it holds accounts, unless --discard-accounts) | false |
| `--discard-accounts` | With --force: confirm that a store holding accounts is replaced (its backup is still written first) | false |
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

Check that an account's encrypted keystore opens with its password; nothing is recorded internal

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
- [hardkas artifact migrate](#hardkas-artifact-migrate)
- [hardkas artifact verify](#hardkas-artifact-verify)

---

## hardkas artifact create

Wrap a JSON payload as a content-hashed artifact under a free <type> label; the payload is not validated against any schema (schemaValidation: NOT_VALIDATED) alpha

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

## hardkas artifact migrate

Re-issue a legacy artifact as hashVersion 5 plus a MigrationReceipt (never in place) alpha

### Usage

```bash
hardkas artifact migrate [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--to <hashVersion>` | Target hash version (only 5 is supported) |  |
| `--migration-id <id>` | Migration identifier recorded in the receipt |  |
| `--json` | Output results as JSON | false |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas artifact verify

Verify an artifact: integrity (offline, every network), and on request its network level (NETWORK_OBSERVED by a node of its network) and consensus level (CONSENSUS_CONFIRMED by the declared confirmation policy; not finality). Mainnet: offline only stable

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
| `--network <network>` | Check the artifact's transaction on a node of this network (must be the artifact's own; mainnet is never contacted) |  |
| `--url <url>` | Node wRPC (JSON) endpoint for the network check (default: the one the workspace declares for the network; local networks: their local default) |  |
| `--since <blockHash>` | Virtual-chain cursor for the network check: a chain block before the transaction's acceptance (default: the artifact's own submit point, else the node's pruning point) |  |
| `--min-confirmations <n>` | Blue-score depth for CONSENSUS_CONFIRMED (default: the HardKAS product policy, 100) |  |
| `--require <level>` | Level the verification must reach to succeed: integrity (default), network or consensus |  |
| `--address <address>` | Network check: locate the transaction through the history of an address it pays or spends from (a bounded window of the node's selected chain, from --since or the last --lookback chain blocks): found, its acceptance is looked at from the chain block before it, also when its outputs were spent since; not found, the result names the window read |  |
| `--lookback <chainBlocks>` | With --address and no --since: the history's window, in chain blocks back from the node's sink (default 1000, at most 100000) |  |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

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
| `--profile <smoke|targeted|full>` | No effect: smoke, targeted and full use the same actor weights | smoke |
| `--actor <LockHell|RotBot|DriftHunter|HumanChaos>` | Target a specific chaos actor instead of using a profile |  |
| `--isolate` | Always on: every campaign runs in its own new temporary directory, never in the current one (the flag has no effect) | true |
| `--unsafe-current-dir` | No effect: a campaign never runs in the current directory; it runs in its own new temporary directory | false |
| `--force-ci-chaos` | No effect: there is no current-directory run to allow in CI | false |
| `--force-chaos-destructive` | No effect: there is no current-directory run whose guards could be bypassed | false |

### Arguments

No arguments.

### Subcommands

- [hardkas chaos replay](#hardkas-chaos-replay)

---

## hardkas chaos replay

Re-run one chaos run seed in a fresh temporary directory of its own (the actor is derived from the seed, so runs from an --actor campaign are not reproduced)

### Usage

```bash
hardkas chaos replay [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--run-seed <number>` | The run seed to replay |  |
| `--isolate` | Always on (the flag has no effect) | true |

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

Non-interactively verify workspace integrity, artifacts, and projections (offline: no public endpoint is contacted)

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

Initialize a basic hardkas.config.ts in the current directory (the config imports nothing, so it loads before any install)

### Usage

```bash
hardkas config init [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--force` | Replace an existing hardkas.config.ts; the original is first copied to a backup that never overwrites another | false |
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

Repair an invalid or missing hardkas config: an invalid one is copied to a backup that never overwrites another, then replaced by a minimal config that loads

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

Open an interactive REPL with an in-memory simulator harness (h) and hash/format helpers; no network is contacted stable

### Usage

```bash
hardkas console [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | Network label for the simulated state (nothing connects to it) | simnet |
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
| `--depth <n>` | Reorg depth: a whole number of blocks, 0 or more | 1 |

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

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--force` | Replace the profile files that already exist in this directory | false |

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

Local development tools: dev environment, dApp templates, simnet dev accounts (`dev doctor` is an Igra L2 lab check)

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

Export a dev account for a wallet's manual import; format: kasware

### Usage

```bash
hardkas dev accounts export [options] <format>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--alias <alias>` | Alias to export | alice |

### Arguments

| Argument | Description |
| :--- | :--- |
| `format` |  |

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

Act on the latest transaction artifact of the workspace store

### Usage

```bash
hardkas dev last [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--inspect` | Print the latest artifact | false |
| `--replay` | Show the latest receipt, or verify the latest plan or signed transaction (no replay is run) | false |
| `--explain` | Print the `hardkas why` command for the latest artifact | false |
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

Quick plan, sign and send on the simulated ledger or a local simnet, with no confirmation; any other network is refused (use 'hardkas tx send … --yes')

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

Perform a full system diagnostic and health report: local configuration, then the workspace's node (connectivity, network identity, sync, capability for a flow); mainnet is never contacted stable

### Usage

```bash
hardkas doctor [options] [module]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as stable JSON schema | false |
| `--network <name>` | Check the node of this network of hardkas.config.ts (default: the workspace's network; mainnet is refused, a public testnet needs the payments' opt-in) |  |
| `--url <url>` | Check the node at this endpoint, as the node of --network (default: the workspace's network) |  |
| `--flow <flows>` | Report the node's capability for these flows and fail when one is not ready: payment, silver, covenant (comma-separated) |  |
| `--timeout <ms>` | Bound the node check: connect and answer within this many milliseconds (default 8000) |  |
| `--capabilities` | With 'doctor node': report the node's capabilities (RPC, network, DAA advance) as JSON | false |
| `--consistency` | Run advanced deterministic consistency checks | false |
| `--strict` | Run the consistency checks in strict mode and report DOCTOR_FAILED when a check fails (any failed check exits 1) | false |
| `--release` | With 'doctor workspace': also run the release checks (git, schemas, claims, raw appends, browser imports) | false |

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

Check the HARDKAS_* environment variables (process and .env): the ones HardKAS honours, and any it does not know

### Usage

```bash
hardkas env check [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas escrow

Escrow operations: lifecycle, security guards, and legacy v1 fund recovery

### Usage

```bash
hardkas escrow [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas escrow create](#hardkas-escrow-create)
- [hardkas escrow fund](#hardkas-escrow-fund)
- [hardkas escrow prepare](#hardkas-escrow-prepare)
- [hardkas escrow reconcile](#hardkas-escrow-reconcile)
- [hardkas escrow release](#hardkas-escrow-release)
- [hardkas escrow rescue-v1](#hardkas-escrow-rescue-v1)
- [hardkas escrow sign](#hardkas-escrow-sign)
- [hardkas escrow status](#hardkas-escrow-status)

---

## hardkas escrow create

Create a v2 escrow (EscrowFull with --amount, EscrowSplit with --buyer-amount and --seller-amount), compiled by the pinned silverc for the network, and record it in this workspace. Nothing is sent

### Usage

```bash
hardkas escrow create [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--buyer <party>` | The buyer: an account of this workspace, a Schnorr address of the network, or a 32-byte x-only public key (hex) |  |
| `--seller <party>` | The seller (account, address or x-only public key) |  |
| `--arbiter <party>` | The arbiter (account, address or x-only public key) |  |
| `--buyer-destination <address|spk>` | Where refunds pay (default: the buyer's own address): an address of the network, or a script public key in hex without the version |  |
| `--seller-destination <address|spk>` | Where releases pay (default: the seller's own address) |  |
| `--amount <kas>` | EscrowFull: the principal every branch pays (KAS) |  |
| `--buyer-amount <kas>` | EscrowSplit: the buyer's allocation (KAS), with --seller-amount |  |
| `--seller-amount <kas>` | EscrowSplit: the seller's allocation (KAS), with --buyer-amount |  |
| `--fee-budget <sompi>` | The fee of every release, added to the funding (sompi; default 2000000 = 0.02 KAS; at least the node's minimum relay fee of a release, checked before funding) |  |
| `--nonce <hex>` | 32-byte nonce that makes the escrow's address unique (default: random) |  |
| `--network <network>` | Network (default: the escrow's own, else the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas escrow fund

Fund an escrow from the buyer's account: one payment of its funding amount (principal + fee budget) to its address, planned, signed and sent by HardKAS's payment path. Refused before anything is signed if any release could not pay the node's minimum relay fee

### Usage

```bash
hardkas escrow fund [options] <id>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--from <account>` | The buyer's account of this workspace (its key must be the escrow's buyer key) |  |
| `--network <network>` | Network (default: the escrow's own, else the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). The canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced) |  |
| `--wait` | Wait until a chain block accepts the funding | false |
| `--timeout <seconds>` | With --wait: how long to wait | 120 |
| `--password-env <env>` | Read the keystore password of the encrypted account this command signs with from this environment variable (development accounts need none) |  |
| `--password-stdin` | Read the keystore password of the encrypted account this command signs with from stdin | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `id` |  |

---

## hardkas escrow prepare

Prepare the release of one branch over the recorded funding and write the release request each required signer signs (in this workspace, or in their own with `escrow sign <file>`)

### Usage

```bash
hardkas escrow prepare [options] <id>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--branch <branch>` | EscrowFull: mutualRelease, refundBuyer, releaseToSeller; EscrowSplit: executeSplit, fullRefund, fullRelease, mutualRelease |  |
| `--buyer-share <kas>` | mutualRelease: what the buyer receives (KAS), with --seller-share; together the principal (default: the contract's default allocation) |  |
| `--seller-share <kas>` | mutualRelease: what the seller receives (KAS), with --buyer-share |  |
| `--out <file>` | The release request file (default escrow-<id>-<branch>.request.json) |  |
| `--network <network>` | Network (default: the escrow's own, else the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `id` |  |

---

## hardkas escrow reconcile

Look at the node once for an escrow's pending funding and release (its mempool, then its chain) and record what it shows: accepted by a chain block → confirmed (FUNDED / RELEASED)

### Usage

```bash
hardkas escrow reconcile [options] <id>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <network>` | Network (default: the escrow's own, else the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). The canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced) |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `id` |  |

---

## hardkas escrow release

Send an escrow's prepared release once every required role signed: each signature verified (BIP340) before anything is sent, then one send through HardKAS's send machinery. An unknown outcome is recorded and never sent again before reconcile

### Usage

```bash
hardkas escrow release [options] <id>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--signatures <files...>` | Signed release request files to take the signatures from (each checked against this escrow's prepared release) |  |
| `--network <network>` | Network (default: the escrow's own, else the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). The canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced) |  |
| `--wait` | Wait until a chain block accepts the release (RELEASED) | false |
| `--timeout <seconds>` | With --wait: how long to wait | 120 |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `id` |  |

---

## hardkas escrow rescue-v1

Legacy v1 Escrow fund recovery tools without exposing private keys in CLI arguments

### Usage

```bash
hardkas escrow rescue-v1 [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas escrow rescue-v1 broadcast](#hardkas-escrow-rescue-v1-broadcast)
- [hardkas escrow rescue-v1 inspect](#hardkas-escrow-rescue-v1-inspect)
- [hardkas escrow rescue-v1 prepare](#hardkas-escrow-rescue-v1-prepare)
- [hardkas escrow rescue-v1 sign](#hardkas-escrow-rescue-v1-sign)

---

## hardkas escrow rescue-v1 broadcast

Finalize and broadcast the signed rescue transaction to the network

### Usage

```bash
hardkas escrow rescue-v1 broadcast [options] <draft-file>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <network>` | Network (default: the draft's); must be the draft's |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the draft's network; simnet: the canonical localnet) |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `draft-file` |  |

---

## hardkas escrow rescue-v1 inspect

Inspect a rescue draft and verify balance and signature status

### Usage

```bash
hardkas escrow rescue-v1 inspect [options] <draft-file>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `draft-file` |  |

---

## hardkas escrow rescue-v1 prepare

Prepare a v1 escrow rescue draft spending an orphaned UTXO to a target address. The escrow is recompiled from the constructor arguments it was created with (createEscrow's v1 config); its lock must be --address and the UTXO's script, or nothing is read or written

### Usage

```bash
hardkas escrow rescue-v1 prepare [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--address <address>` | Legacy escrow P2SH address |  |
| `--outpoint <outpoint>` | Funding outpoint to spend (txId:index) |  |
| `--to <address>` | Destination address to recover funds to |  |
| `--buyer-pk <hex>` | Required: buyer x-only public key the escrow was created with (32 bytes hex) |  |
| `--seller-pk <hex>` | Required: seller x-only public key the escrow was created with (32 bytes hex) |  |
| `--arbiter-pk <hex>` | Required: arbiter x-only public key the escrow was created with (32 bytes hex) |  |
| `--buyer-destination <address|spk>` | Required: the buyer destination the escrow was created with: an address, or its script public key in hex without the version (EscrowConfig.buyerDestinationSpk) |  |
| `--seller-destination <address|spk>` | Required: the seller destination the escrow was created with: an address, or its script public key in hex without the version (EscrowConfig.sellerDestinationSpk) |  |
| `--refund-amount <sompi>` | Required: the escrow's refundAmount (sompi), as it was created |  |
| `--release-amount <sompi>` | Required: the escrow's releaseAmount (sompi), as it was created |  |
| `--network <network>` | Network id (default simnet); mainnet refused; testnet-<n> needs experimental + network.allowPublic | simnet |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet) |  |
| `--out <file>` | Output draft file path (default rescue-v1-plan.draft.json) | rescue-v1-plan.draft.json |
| `--fee <sompi>` | Miner fee in sompi (default 400000 sompi = 0.004 KAS, raised to the node's minimum relay fee for this rescue when that is higher; at most 2500000) |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas escrow rescue-v1 sign

Sign a rescue draft with a local dev or keystore account

### Usage

```bash
hardkas escrow rescue-v1 sign [options] <draft-file>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--account <name>` | Account name or role (e.g. buyer, seller, or dev account name) |  |
| `--role <role>` | Contract role (buyer or seller) | buyer |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `draft-file` |  |

---

## hardkas escrow sign

Sign an escrow's prepared release as one role: an escrow id of this workspace (the signature goes into its record), or a release request file, checked first against the escrow's own terms (the contract recompiled, the draft prepared again) and signed here, in the signer's own workspace

### Usage

```bash
hardkas escrow sign [options] <id-or-request>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--role <role>` | buyer, seller or arbiter: a role the prepared branch requires |  |
| `--account <account>` | The account of this workspace that signs (its key must be the escrow's key for the role) |  |
| `--out <file>` | With a request file: where the signed request is written (default: the request file itself) |  |
| `--network <network>` | Network (default: the escrow's own, else the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--password-env <env>` | Read the keystore password of the encrypted account this command signs with from this environment variable (development accounts need none) |  |
| `--password-stdin` | Read the keystore password of the encrypted account this command signs with from stdin | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `id-or-request` |  |

---

## hardkas escrow status

Show an escrow recorded in this workspace: its state, funding, prepared release, signatures and release (no node is contacted)

### Usage

```bash
hardkas escrow status [options] <id>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `id` |  |

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

Provide a narrative causal explanation of an artifact resolved by exact artifactId, artifact file path, or a namespaced identifier (--plan, --signed, --tx, --workflow) stable

### Usage

```bash
hardkas explain [options] [artifact]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--artifact <id-or-path>` | 64-hex artifactId or workspace path (same as the positional) |  |
| `--plan <planId>` | Resolve a plan by its derived label (verified against its hash) |  |
| `--signed <signedId>` | Resolve a signed transaction by its derived label (verified) |  |
| `--tx <txId>` | Resolve the submission receipt for a txId (never the signed); with no submission here, the tx as observed by this workspace (origin: observed) |  |
| `--workflow <workflowId>` | Resolve a workflow run by its correlation id |  |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `artifact` |  |

---

## hardkas extension

First-party extensions installed in the project (the Igra L2 lab is the 'l2' extension) experimental

### Usage

```bash
hardkas extension [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas extension doctor](#hardkas-extension-doctor)
- [hardkas extension install](#hardkas-extension-install)
- [hardkas extension list](#hardkas-extension-list)
- [hardkas extension remove](#hardkas-extension-remove)

---

## hardkas extension doctor

Run the checks of the extensions loaded in this project

### Usage

```bash
hardkas extension doctor [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas extension install

Install an extension in this project at the CLI's exact version, with install scripts disabled; it downloads no toolchain and starts nothing

### Usage

```bash
hardkas extension install [options] <id>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--from <tgz>` | Install from a local npm tarball (offline); requires --sha256 |  |
| `--sha256 <hex>` | SHA-256 the --from tarball must have |  |
| `--yes` | Run the package manager without asking | false |
| `--dry-run` | Only print the checks' result and the command that would run | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `id` |  |

---

## hardkas extension list

List the known extensions and their state in this project (installed, version, enabled, compatible)

### Usage

```bash
hardkas extension list [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas extension remove

Remove an extension from this project

### Usage

```bash
hardkas extension remove [options] <id>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--yes` | Run the package manager without asking | false |
| `--dry-run` | Only print the command that would run | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `id` |  |

---

## hardkas history

The history of an address over a bounded window of a Kaspa node's selected chain: every transaction accepted in it that pays the address or spends an output of it, with its depth; this workspace's own records merged in. The result says what the window covered and what it did not. Read-only; mainnet is refused

### Usage

```bash
hardkas history [options] <address>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--since <blockOrDaa>` | Start of the window: a chain block hash (64 hex: the transactions accepted after it) or a DAA score (the transactions accepted at or above it). Default: the last --lookback chain blocks. Never before the node's pruning point |  |
| `--lookback <chainBlocks>` | Default window: chain blocks back from the node's sink (default 1000, at most 100000) |  |
| `--max-blocks <n>` | Chain blocks this call may walk back to the start, and read forward from it (default 10000 each, at most 200000); the rest is the result's continueFrom |  |
| `--limit <n>` | Entries per page (default 100, at most 1000) |  |
| `--cursor <cursor>` | The next page of the same window (page.nextCursor of a previous result) |  |
| `--timeout <seconds>` | Deadline for the whole read (default 60, at most 600): a window cut short by it says so |  |
| `--network <name>` | Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet) |  |
| `--url <url>` | Node wRPC (JSON) endpoint |  |
| `--no-workspace-records` | Do not merge this workspace's own records (submissions, receipts) into the history |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `address` |  |

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
| `--force` | Overwrite an existing hardkas.config.ts (the other scaffold files are kept) | false |
| `--template <type>` | No effect in this release (for templates use 'hardkas create') |  |
| `--network <name>` | 'simulated' pre-creates the simulator state (5 accounts, 1000 KAS each); other values skip it. The project's default target is always the simulator | simulated |
| `--accounts <n>` | No effect in this release: init always creates the 5 simulated accounts alice…erin |  |
| `--install` | Run npm install after scaffolding | false |
| `--skip-toolchain` | Do not install the pinned kaspa-wasm (signing, planning and the generated test need it) | false |
| `--toolchain-from-file <asset>` | Install the pinned kaspa-wasm from its official release asset already on disk |  |
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

Check one Kaspa node at --rpc-url: reachability, sync state, UTXO index, DAG info and mempool stable

### Usage

```bash
hardkas kaspa doctor [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--rpc-url <url>` | Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210) | ws://127.0.0.1:18210 |
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
| `--rpc-url <url>` | Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210) | ws://127.0.0.1:18210 |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas kaspa wallet create

Generate a key pair and print its address and config snippet; the private key is printed once, only with --show-private-key; nothing is saved. For a stored, encrypted account use 'accounts real generate' stable

### Usage

```bash
hardkas kaspa wallet create [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <id>` | Kaspa network ID (simnet, testnet-10; mainnet, in any spelling or through a config alias, is refused while mainnet is locked down: MAINNET_SIGNING_DISABLED, nothing is generated) | simnet |
| `--show-private-key` | Print the new private key once; you keep the only copy (HardKAS stores nothing and cannot recover it). Without it the command refuses before generating anything | false |
| `--json` | Output as JSON (the private key is included only with --show-private-key) | false |

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

Plan a payment over --rpc-url with --dry-run (the node must serve the workspace's network); sending is disabled here: use 'tx plan', 'tx sign' and 'tx send' internal

### Usage

```bash
hardkas kaspa wallet send [options] <from> <to>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--amount <kas>` | Amount in KAS to send |  |
| `--dry-run` | Plan only (required: without it the command refuses, KASPA_WALLET_SEND_DISABLED) | false |
| `--rpc-url <url>` | Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210) | ws://127.0.0.1:18210 |

### Arguments

| Argument | Description |
| :--- | :--- |
| `from` |  |
| `to` |  |

---

## hardkas kcc

KCC-1 covenant ABI and KCC-2 authority schemes (kaspanet/kccs, Final), off chain experimental

### Usage

```bash
hardkas kcc [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas kcc dispatch](#hardkas-kcc-dispatch)
- [hardkas kcc template-hash](#hardkas-kcc-template-hash)

---

## hardkas kcc dispatch

The KCC-1 dispatch tag of a function signature written with dispatch type names, e.g. 'transfer({int,byte[32],byte,byte,byte[32],byte[32]}[],byte[])': Hash(UTF8(signature))[0:4]

### Usage

```bash
hardkas kcc dispatch [options] <signature>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `signature` |  |

---

## hardkas kcc template-hash

The KCC-1 template hash Hash(LE64(len(prefix)) || prefix || LE64(len(suffix)) || suffix) of a template

### Usage

```bash
hardkas kcc template-hash [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--prefix <hex>` | Template prefix (hex; empty is '') |  |
| `--suffix <hex>` | Template suffix (hex; empty is '') |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas kcc20

KCC-20 fungible tokens on L1 covenants (kaspanet/kccs, Final): off chain, the state codec, transfer checks and program artifacts; on a node, deploy, transfer and balance through the SDK's v1 engine experimental. Not KRC-20

### Usage

```bash
hardkas kcc20 [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas kcc20 artifact](#hardkas-kcc20-artifact)
- [hardkas kcc20 balance](#hardkas-kcc20-balance)
- [hardkas kcc20 check](#hardkas-kcc20-check)
- [hardkas kcc20 decode-state](#hardkas-kcc20-decode-state)
- [hardkas kcc20 deploy](#hardkas-kcc20-deploy)
- [hardkas kcc20 encode-state](#hardkas-kcc20-encode-state)
- [hardkas kcc20 transfer](#hardkas-kcc20-transfer)

---

## hardkas kcc20 artifact

Read a KCC-20 program artifact (kcc20.json: program, entrypoints, owner_schemes, max_token_inputs, max_token_outputs) and print its configuration and KCC-1 dispatch tags. Exit codes: 0 valid; 2 invalid

### Usage

```bash
hardkas kcc20 artifact [options] <file>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `file` |  |

---

## hardkas kcc20 balance

KCC-20 balances on a node: the holder's live token outputs (or every holder's), from this workspace's records of the token's covenant, each listed unspent at the node with the covenant id and its state checked against its address. The node has no query by covenant id: an output this workspace did not record is not seen. Mainnet refused (MAINNET_CONNECTION_DISABLED) before anything is read

### Usage

```bash
hardkas kcc20 balance [options] [holder]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--covenant <id>` | The token's covenant id (32 bytes, hex) |  |
| `--network <network>` | Network (default: the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced) |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `holder` |  |

---

## hardkas kcc20 check

Check a KCC-20 transfer off chain against the leader's rules: inputs (leader first, with state, kasValueSompi, witness), nextStates, outputs (state, kasValueSompi), optional transactionInputs and config (a kcc20.json). Signatures are listed, never verified; continuation programs, covenant bindings and each input's entrypoint are not checked, and the input states and their order are taken as given (the token's program checks them on chain). Exit codes: 0 STRUCTURALLY_VALID; 1 REJECTED (KCC20_TRANSFER_REJECTED); 2 usage

### Usage

```bash
hardkas kcc20 check [options] <transfer>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `transfer` |  |

---

## hardkas kcc20 decode-state

Decode a 112-byte KCC20State encoding strictly (KCC-1 §3.7.1) and report any KCC-20 rule the state breaks. Exit codes: 0 decoded; 2 not a canonical KCC20State encoding

### Usage

```bash
hardkas kcc20 decode-state [options] <hex>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `hex` |  |

---

## hardkas kcc20 deploy

Create a KCC-20 token on a node (transaction v1): a covenant genesis of the token program — its compile record, e.g. the reference KCC20.sil compiled by `hardkas silver compile` — with one token output per initial holder, all one covenant id; planned, checked, signed and sent by the SDK's v1 engine (sdk.kcc20). Mainnet refused (MAINNET_SIGNING_DISABLED) before anything is read; testnet-<n> needs experimental + network.allowPublic

### Usage

```bash
hardkas kcc20 deploy [options] <record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--from <account>` | Funding account (local key): pays the token outputs' KAS and the fee, gets the change |  |
| `--holder <spec>` | An initial holder, in output order (repeatable): '<owner>=<amount>', the owner an account of this workspace, a P2PK address or a 32-byte x-only public key (hex), owner scheme p2pk-schnorr/v1; the amount an exact integer |  |
| `--kas <kas>` | KAS locked in each token output | 10 |
| `--extension-commitment <hex>` | The token's extension commitment (32 bytes, hex; default zero): every output of the token carries it |  |
| `--artifact <file>` | The program's KCC-20 artifact (kcc20.json: entrypoints, owner schemes, bounds); default: KCC-20's default configuration |  |
| `--constructor-args <file>` | Constructor arguments the program was compiled with (default: proven from its initial State) |  |
| `--contract <name>` | Contract, when the artifact has several (default: KCC20) |  |
| `--fee <sompi>` | Fee in sompi: at least the node's floor for this transaction (the floor when omitted) |  |
| `--network <network>` | Network (default: the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced) |  |
| `--wait` | Wait until every token output is confirmed with the covenant id | false |
| `--timeout <seconds>` | Confirmation timeout | 120 |
| `--password-env <env>` | Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none) |  |
| `--password-stdin` | Read the keystore password of the encrypted account(s) this command signs with from stdin | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `record` |  |

---

## hardkas kcc20 encode-state

Encode a KCC20State (JSON file or inline: amount, owner, ownerScheme, borrowScheme, borrowGuard, extensionCommitment) as its 112-byte KCC-1 state encoding. Exit codes: 0 encoded; 2 an invalid state

### Usage

```bash
hardkas kcc20 encode-state [options] <state>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `state` |  |

---

## hardkas kcc20 transfer

Transfer KCC-20 tokens on a node (transaction v1): --from's token outputs (or the --input ones) to the recipients, the change back to --from, through the program's transfer (the leader) and transfer_delegator (the other inputs). Checked against the KCC-20 rules (the model `kcc20 check` runs) before anything is signed, and refused there when they reject it (KCC20_TRANSFER_REJECTED); the owners' signatures go in the witnesses; planned, signed and sent by the SDK's v1 engine (sdk.kcc20); the token's program on the node is the final judge. Mainnet refused (MAINNET_SIGNING_DISABLED) before anything is read

### Usage

```bash
hardkas kcc20 transfer [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--covenant <id>` | The token's covenant id (32 bytes, hex) |  |
| `--from <account>` | The holder whose token outputs are spent and who signs them (local key); the change in tokens goes back to it |  |
| `--to <spec>` | A recipient, in output order (repeatable): '<owner>=<amount>', the owner an account of this workspace, a P2PK address or a 32-byte x-only public key (hex) |  |
| `--input <outpoint>` | Spend this token output 'txid:index' (repeatable, the leader first); default: --from's live outputs, largest first, as few as cover the amounts |  |
| `--funder <account>` | Pay the fee from this account's coins (local key); default: the tokens' KAS (the first new output keeps what the fee leaves) |  |
| `--artifact <file>` | The program's KCC-20 artifact (kcc20.json); default: KCC-20's default configuration |  |
| `--fee <sompi>` | Fee in sompi: at least the node's floor for this transaction (the floor when omitted) |  |
| `--max-fee <sompi>` | The plan's fee limit (default: the fee it pays) |  |
| `--compute-budget <n>` | Compute budget of each token input, or 'estimate' (the default: rusty-kaspa's upper bound) |  |
| `--network <network>` | Network (default: the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced) |  |
| `--wait` | Wait until every new token output is confirmed with the covenant id | false |
| `--timeout <seconds>` | Confirmation timeout | 120 |
| `--password-env <env>` | Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none) |  |
| `--password-stdin` | Read the keystore password of the encrypted account(s) this command signs with from stdin | false |
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
- [hardkas localnet seed](#hardkas-localnet-seed)
- [hardkas localnet snapshot](#hardkas-localnet-snapshot)
- [hardkas localnet start](#hardkas-localnet-start)
- [hardkas localnet status](#hardkas-localnet-status)
- [hardkas localnet stop](#hardkas-localnet-stop)

---

## hardkas localnet account

Manage real simnet accounts for the local node

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

Create a real simnet account: a random key, stored in plaintext in .hardkas/accounts.real.json alpha

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

Copy the current UTXOs of some addresses from a node into a simulator state file preview

### Usage

```bash
hardkas localnet fork [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | Network to fork from |  |
| `--addresses <addrs...>` | Addresses whose UTXOs are copied, separated by spaces |  |
| `--at-daa-score <score>` | Required label recorded with the snapshot; the UTXOs copied are always the node's current ones |  |
| `--output <path>` | State file to write (default: .hardkas/localnet.json, replaced) |  |
| `--json` | Not implemented yet: no JSON is printed | false |

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
| `--amount <kas>` | KAS to fund: without --treasury, mine to the account until its mature balance grows by this amount; with --treasury, transfer exactly this amount from the localnet Treasury | 1000 |
| `--treasury` | Transfer exactly --amount KAS from the localnet Treasury instead of mining to the account (an amount too large for one transaction is sent in several). The Treasury key is public by design, the same on every HardKAS localnet, and used on simnet only | false |
| `--timeout <ms>` | Funding/maturity wait timeout in ms | 300000 |
| `--keep-miner` | Keep mining to the funded account after funding (its balance keeps growing) | false |
| `--stop-miner` | Leave the chain stopped after funding: no new blocks until you mine again | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `identifier` |  |

---

## hardkas localnet seed

Distribute an exact initial KAS balance to dev accounts from the localnet Treasury (1 -> N; the Treasury key is public by design, the same on every HardKAS localnet, and used on simnet only) alpha

### Usage

```bash
hardkas localnet seed [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--profile <name>` | Funding profile | toccata-v2 |
| `--amount <kas>` | KAS per dev account | 100 |
| `--only-empty` | Only fund accounts whose balance is currently 0 | false |
| `--accounts <names>` | Comma-separated account names or simnet addresses to seed |  |
| `--timeout <ms>` | Funding/confirmation timeout in ms | 300000 |
| `--stop-miner` | Leave the chain stopped after seeding: no new blocks until you mine again | false |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

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
| `--consensus-validated` | Not supported: refused (SNAPSHOT_CONSENSUS_VALIDATION_UNSUPPORTED, exit 2). HardKAS does not validate snapshots against consensus, so a snapshot never declares it | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas localnet snapshot replay

Restore a snapshot's missing artifacts into the workspace; never removes or overwrites one alpha

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

Start (or adopt) the Docker rusty-kaspad node for the toccata-v2 profile and create dev accounts alice…erin; needs Docker alpha

### Usage

```bash
hardkas localnet start [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--profile <name>` | Localnet profile: toccata-v2 (the only one, required; or use --toccata) |  |
| `--toccata` | Shortcut for --profile toccata-v2 | false |
| `--seed` | Distribute an initial exact balance (default 100 KAS) to empty dev accounts from the localnet Treasury after start (its key is public by design, the same on every HardKAS localnet, and used on simnet only) | false |
| `--seed-amount <kas>` | KAS per account when --seed is set | 100 |
| `--stop-miner` | With --seed: leave the chain stopped after seeding | false |
| `--detached` | No effect: the node always runs as a detached Docker container | false |
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

Stop the Docker rusty-kaspad node of the toccata-v2 profile and its miner; needs Docker alpha

### Usage

```bash
hardkas localnet stop [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--profile <name>` | Localnet profile: toccata-v2 (the only one) | toccata-v2 |
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

Report stale locks (process no longer running on this host) in .hardkas/locks stable

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
| `--follow` | No effect: the logs are printed once (the last --tail lines), never followed | false |
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
| `--image <image>` | Docker image, pinned by digest: <repository>[:tag]@sha256:<64 hex> (default: the pinned rusty-kaspad); an image without a digest is refused (NODE_IMAGE_DIGEST_REQUIRED) |  |
| `--allow-floating-image` | No effect: the image must be pinned by digest (@sha256:<64 hex>); a floating tag is never run | false |
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

Experimental local programmability tools: inspection and fixture checks of Silver, ZK and vProgs artifacts; no vProgs runtime, no on-chain ZK verification (Outputs JSON by default)

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
| `--json` | Output as JSON (always: this command only prints JSON; the flag changes nothing) | false |

### Arguments

No arguments.

---

## hardkas programmability audit

Print the fixed list of what this build's programmability layers do not do (on-chain ZK verification, vProgs runtime, L2 bridge and exit, real stable-asset issuer): a static statement that inspects and runs nothing

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
| `--json` | Output as JSON (always: this command only prints JSON; the flag changes nothing) | false |

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
| `--json` | Output as JSON (always: this command only prints JSON; the flag changes nothing) | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas programmability inspect

Inspect a Silver, ZK, or vProgs artifact: its schema and content hash. It never establishes node evidence for the artifact (artifactEvidence.realNodeEvidence: NOT_ESTABLISHED); the product's claims are in 'programmability capabilities'

### Usage

```bash
hardkas programmability inspect [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--kind <kind>` | Artifact kind: silver, zk, or vprog |  |
| `--json` | Output as JSON (always: this command only prints JSON; the flag changes nothing) | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas programmability verify

Verify a local programmability artifact's integrity. It never establishes node evidence for the artifact (artifactEvidence.realNodeEvidence: NOT_ESTABLISHED)

### Usage

```bash
hardkas programmability verify [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--kind <kind>` | Artifact kind: silver, zk, or vprog |  |
| `--json` | Output as JSON (always: this command only prints JSON; the flag changes nothing) | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas pskt

Portable Signing Sessions (PSKT): unavailable in this build. No adapter implements PSKT operations, so export, import, sign, merge, finalize and extract refuse

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

Export a TxPlan as a Portable Signing Session unavailable

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

Extract KaspaRpcTransaction from a finalized PSKT session unavailable

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

Finalize a PSKT session unavailable

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

Import a raw payload into a PSKT session unavailable

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

Show a PSKT session file's metadata. It does not decode the payload: no inputs, outputs, amounts or recipients, so it is no pre-signing check alpha

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

Merge two PSKT sessions unavailable

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

Sign a PSKT session payload unavailable

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
| `--inputs <indexes>` | Comma-separated input indexes to sign (default: the inputs this participant is eligible for) |  |
| `--network <name>` | The network you sign for (default: the workspace's); it must be the session's, and its node must list every input to sign as unspent |  |
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
| `--explain [level]` | Attach explain chains (brief and full currently give the same output) |  |

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
| `--mode <mode>` | Filter by mode: simulator, localnet or rpc |  |
| `--from <address>` | Filter by sender address |  |
| `--to <address>` | Filter by recipient address |  |
| `--sort <field:dir>` | Sort field and direction (e.g. createdAt:desc) |  |
| `--limit <n>` | Max results | 100 |
| `--json` | Output as deterministic JSON | false |
| `--explain [level]` | Attach explain chains (brief and full currently give the same output) |  |

### Arguments

No arguments.

---

## hardkas query dag

Query a light-model DAG (NOT GHOSTDAG) read from .hardkas/state.json, which no HardKAS command writes; without it each query fails with DAG_DATA_UNAVAILABLE (exit 1) instead of answering without data research

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
| `--explain [level]` | Attach explain chains (brief and full currently give the same output) |  |

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
| `--explain [level]` | Attach explain chains (brief and full currently give the same output) |  |
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
| `--explain [level]` | Attach explain chains (brief and full currently give the same output) |  |

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
| `--explain [level]` | Attach explain chains (brief and full currently give the same output) |  |
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
| `--explain [level]` | Attach explain chains (brief and full currently give the same output) |  |
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
| `--explain [level]` | Attach explain chains (brief and full currently give the same output) |  |

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
| `--explain [level]` | Attach explain chains (brief and full currently give the same output) |  |
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

Static analysis of the stored receipts: hash, state, UTXO-count and fee (relay minimum) checks of their fields. Nothing is re-executed; 'hardkas replay verify' replays a receipt

### Usage

```bash
hardkas query replay divergences [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--explain [level]` | Attach explain chains (brief and full currently give the same output) |  |

### Arguments

No arguments.

---

## hardkas query replay invariants

Static checks of one stored receipt: content hash, recorded state hashes, state change against status, non-empty UTXO lists. Nothing is re-executed; 'hardkas replay verify' replays it

### Usage

```bash
hardkas query replay invariants [options] <txId>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--explain [level]` | Attach explain chains (brief and full currently give the same output) |  |

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
| `--wait-lock` | With --migrate: wait for the query-store lock if held | false |
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
| `--wait-lock` | Wait for the query-store lock if held | false |
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
| `--backend <type>` | sqlite (the default) builds .hardkas/store.db from the workspace; filesystem keeps no index, so it has nothing to rebuild |  |
| `--strict` | Fail on any corrupted data | false |
| `--wait-lock` | Wait for the query-store lock if held | false |
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

Index new artifacts into the SQLite query store (needs .hardkas/store.db: run 'query store rebuild' first)

### Usage

```bash
hardkas query store sync [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--strict` | Fail on any corrupted data | false |
| `--wait-lock` | Wait for the query-store lock if held | false |
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

Wipe and rebuild the SQLite query store from the committed artifacts stable

### Usage

```bash
hardkas rebuild [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--from-artifacts` | Required: rebuild the query store from the artifacts (the localnet state is not rebuilt) | false |
| `--json` | Output machine-readable JSON | false |

### Arguments

No arguments.

---

## hardkas repair

Report an outdated workspace, lock files in .hardkas/, torn JSONL tails and a corrupt query store; --force repairs them beta

### Usage

```bash
hardkas repair [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as stable JSON schema | false |
| `--force` | Apply the repairs (without it, repair only reports). Removes lock files without checking whether their process is alive | false |

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

Verify deterministic simulator-mode replay for a receipt (required) by exact artifactId or a workspace path such as ./receipt.json. Real-node sends are not supported: they record a TxSubmission, not a TxReceipt. stable

### Usage

```bash
hardkas replay verify [options] [artifact]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `artifact` |  |

---

## hardkas rotate

Archive the telemetry stream (.hardkas/telemetry/telemetry.jsonl) once it reaches 10 MiB beta

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

- [hardkas rpc compare](#hardkas-rpc-compare)
- [hardkas rpc dag](#hardkas-rpc-dag)
- [hardkas rpc doctor](#hardkas-rpc-doctor)
- [hardkas rpc health](#hardkas-rpc-health)
- [hardkas rpc info](#hardkas-rpc-info)
- [hardkas rpc mempool](#hardkas-rpc-mempool)
- [hardkas rpc utxos](#hardkas-rpc-utxos)

---

## hardkas rpc compare

Read several nodes side by side, read-only: identity, lag, the UTXOs of addresses, one look at a transaction. Differences the nodes' lag accounts for are lag, others disagreements (exit 1); when no node can be read, nothing is compared (exit 1, MULTINODE_NO_NODE_REACHABLE). Nothing is sent; agreement among nodes is not consensus validation

### Usage

```bash
hardkas rpc compare [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--endpoints <urls...>` | Node wRPC endpoints to read, separated by spaces (two or more) |  |
| `--network <id>` | The network every node must say it serves (e.g. simnet, testnet-10); a node serving another is not read |  |
| `--address <addresses...>` | Compare the UTXOs of these addresses |  |
| `--tx <txId>` | Look at this transaction on every node |  |
| `--since <hash>` | With --tx: a chain block every node holds to look from (default: each node's pruning point) |  |
| `--lag-threshold <daa>` | DAA score behind the most advanced synced node beyond which a node is lagging (default: 100) |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas rpc dag

Show the node's DAG: network, virtual DAA score, sink and tips

### Usage

```bash
hardkas rpc dag [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--url <url>` | Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210) |  |
| `--network <name>` | Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet, unchecked) |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas rpc doctor

Probe RPC endpoints: TCP, wRPC connection, server and DAG info (http:// endpoints without port 18210 are probed as EVM JSON-RPC)

### Usage

```bash
hardkas rpc doctor [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--endpoints <urls...>` | Endpoints to probe, separated by spaces (commas are not split) |  |

### Arguments

No arguments.

---

## hardkas rpc health

Check that a Kaspa node answers and is ready (default: the canonical localnet, ws://127.0.0.1:18210; --url or --network for another)

### Usage

```bash
hardkas rpc health [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--url <url>` | Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210) |  |
| `--network <name>` | Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet, unchecked) |  |
| `--wait` | Wait until healthy |  |
| `--timeout <ms>` | With --wait: how long to wait in ms (default: 60000) |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas rpc info

Show the node's network, version, sync state and UTXO index

### Usage

```bash
hardkas rpc info [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--url <url>` | Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210) |  |
| `--network <name>` | Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet, unchecked) |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas rpc mempool

Look up a transaction in the node's mempool, or list what the mempool holds

### Usage

```bash
hardkas rpc mempool [options] [txId]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--url <url>` | Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210) |  |
| `--network <name>` | Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet, unchecked) |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `txId` |  |

---

## hardkas rpc utxos

Show the UTXOs the node holds for an address

### Usage

```bash
hardkas rpc utxos [options] <address>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--url <url>` | Node wRPC endpoint (default: the canonical localnet, ws://127.0.0.1:18210) |  |
| `--network <name>` | Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet, unchecked) |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `address` |  |

---

## hardkas run

Run a TypeScript or JavaScript file with tsx and a global 'hardkas': a simulator test harness on simulated networks, an RPC client otherwise (not the SDK) stable

### Usage

```bash
hardkas run [options] <script>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | Network from the workspace config (default: the workspace's network; an unknown name is refused) |  |
| `--accounts <n>` | Number of harness accounts (simulated networks only) | 3 |
| `--balance <sompi>` | Initial balance per harness account, whole sompi (simulated networks only) | 100000000000 |
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
| `--with-node` | Not supported: the sandbox starts no node (refuses with SANDBOX_WITH_NODE_UNSUPPORTED) |  |
| `--recipe <name>` | Run an initial recipe/template inside the sandbox |  |
| `-p, --port <port>` | Port for dev-server API | 3000 |
| `-H, --host <host>` | Host for dev-server API | localhost |

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

## hardkas silver

SilverScript v1: managed silverc v1.0.0, Kaspa SDK scripts, verified canonical node

### Usage

```bash
hardkas silver [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas silver audit](#hardkas-silver-audit)
- [hardkas silver compile](#hardkas-silver-compile)
- [hardkas silver covenant](#hardkas-silver-covenant)
- [hardkas silver debug](#hardkas-silver-debug)
- [hardkas silver deploy](#hardkas-silver-deploy)
- [hardkas silver doctor](#hardkas-silver-doctor)
- [hardkas silver engine](#hardkas-silver-engine)
- [hardkas silver fuzz](#hardkas-silver-fuzz)
- [hardkas silver inspect](#hardkas-silver-inspect)
- [hardkas silver preflight](#hardkas-silver-preflight)
- [hardkas silver spend](#hardkas-silver-spend)
- [hardkas silver test](#hardkas-silver-test)
- [hardkas silver verify](#hardkas-silver-verify)

---

## hardkas silver audit

Run static security analysis over a SilverScript (.sil) contract or compile record (heuristic AST and source-text rules COV-AUTH-001..COV-BUDGET-001, COV-INPUT-001, COV-SIGOPS-001 and COV-LOCKTIME-001: findings to review, not a proof of security).Exit codes: 0 report written; 1 HIGH findings with --fail-on-high (SILVER_AUDIT_HIGH_FINDINGS); 2 usage (file not found, not a compile record); 4 tampered compile record

### Usage

```bash
hardkas silver audit [options] <source-or-record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--args <file>` | Optional constructor arguments JSON file |  |
| `--fail-on-high` | Exit with non-zero code if any HIGH severity finding is detected | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `source-or-record` |  |

---

## hardkas silver compile

Compile SilverScript with the managed silverc v1.0.0 and record its provenance

### Usage

```bash
hardkas silver compile [options] <source>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--args <file>` | Constructor arguments: JSON list of {kind, value} |  |
| `--network <network>` | Network the record and its P2SH addresses are for (default: the workspace's network, else simnet; mainnet refused) |  |
| `--out <file>` | Record path (default .hardkas/artifacts/silver/) |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `source` |  |

---

## hardkas silver covenant

Toccata covenants (transaction v1): genesis and 1:1 auth-bound transitions; start (several outputs) and advance (1:N, N:M with delegates, termination)

### Usage

```bash
hardkas silver covenant [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas silver covenant advance](#hardkas-silver-covenant-advance)
- [hardkas silver covenant genesis](#hardkas-silver-covenant-genesis)
- [hardkas silver covenant inspect](#hardkas-silver-covenant-inspect)
- [hardkas silver covenant start](#hardkas-silver-covenant-start)
- [hardkas silver covenant transition](#hardkas-silver-covenant-transition)

---

## hardkas silver covenant advance

Advance a covenant through any transition its declaration allows — one input to several continuations (1:N), several inputs with a leader and delegates (N:M), or none (termination) — planned, checked against the node and the compiler before any key is read, signed and sent by the SDK's v1 engine. <record> is the covenant's compile record (its template); `transition` keeps the 1:1 form and its records

### Usage

```bash
hardkas silver covenant advance [options] <record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--covenant <id>` | The covenant id (32 bytes, hex) |  |
| `--policy <name>` | Covenant declaration (policy function) the transition runs |  |
| `--input <spec>` | A covenant input, in input order, the leader first (repeatable): 'txid:index' (its state: the one this workspace's records of the covenant declare for that output, checked against its address), or 'txid:index=<state-file>' |  |
| `--next <spec>` | A continuation, in output order (repeatable): '<state-file>=<kas>', or '<state-file>' for the one that keeps what the other outputs and the fee leave of the covenant's value (one at most; not with --funder) |  |
| `--pay <spec>` | A payment out of the covenant (repeatable): '<address or account>=<kas>' |  |
| `--terminate` | End the covenant: no continuation (its policy decides whether it may); its value goes to the --pay outputs and the fee | false |
| `--args <file>` | The leader entry's arguments other than its next states (filled from --next): JSON list of {kind, value} and {"kind":"signature","account":"<name>"} |  |
| `--delegate-args <file>` | A delegate input's entry arguments, same form, one file per delegate in input order (repeatable; default: none) |  |
| `--funder <account>` | Pay the fee from this account's coins (local key); the covenant keeps its value |  |
| `--fee <sompi>` | Fee in sompi, with a continuation that takes the rest or with --funder: at least the node's floor (the floor when omitted). Otherwise the fee is what the outputs leave of the covenant's value |  |
| `--max-fee <sompi>` | The plan's fee limit (default: the fee it pays; a fee the outputs leave is refused above the larger of 0.1 KAS and the node's floor unless this is given) |  |
| `--lock-time-daa <n>` | Absolute lock time as a DAA score (below 500000000000), for an entry that requires tx.daa >= x (CheckLockTimeVerify): checked against the entry's tx.daa statements before signing, and the spend is refused before the broadcast until the node's virtual DAA score is above it (LOCK_TIME_NOT_REACHED, nothing sent). Not with --lock-time-ms |  |
| `--lock-time-ms <t>` | Absolute lock time in milliseconds since the epoch (at or above 500000000000), for an entry that requires tx.time >= t: checked against the entry's tx.time statements before signing, and refused before the broadcast until the node's past median time is above it. Not with --lock-time-daa |  |
| `--compute-budget <n>` | Compute budget of each covenant input, or 'estimate' (rusty-kaspa's upper bound); default: the certified budget of its entry, else that estimate |  |
| `--constructor-args <file>` | Constructor arguments the contract was compiled with (default: proven from its initial State) |  |
| `--contract <name>` | Contract, when the artifact has several |  |
| `--network <network>` | Network (default: the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced) |  |
| `--wait` | Wait until every continuation is confirmed with the covenant id (termination: the first output) | false |
| `--timeout <seconds>` | Confirmation timeout | 120 |
| `--password-env <env>` | Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none) |  |
| `--password-stdin` | Read the keystore password of the encrypted account(s) this command signs with from stdin | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `record` |  |

---

## hardkas silver covenant genesis

Create a covenant: bind a new output to the covenant id the SDK derives

### Usage

```bash
hardkas silver covenant genesis [options] <record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--from <account>` | Funding account (local key) |  |
| `--amount <kas>` | Value locked in the covenant |  |
| `--compute-budget <n>` | Compute budget of the funding inputs (default: the certified P2PK budget) |  |
| `--fee <sompi>` | Fee in sompi: at least the node's floor for this transaction (the floor when omitted) |  |
| `--constructor-args <file>` | Constructor arguments the contract was compiled with (default: proven from its initial State) |  |
| `--contract <name>` | Contract, when the artifact has several |  |
| `--network <network>` | Network (default: the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced) |  |
| `--wait` | Wait for confirmation and the node's covenant id | false |
| `--timeout <seconds>` | Confirmation timeout | 120 |
| `--password-env <env>` | Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none) |  |
| `--password-stdin` | Read the keystore password of the encrypted account(s) this command signs with from stdin | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `record` |  |

---

## hardkas silver covenant inspect

A covenant's lineage and state (its id, or one of its covenant records): genesis anchored by its recomputed id, transitions linked by outpoints, the tip checked at the node

### Usage

```bash
hardkas silver covenant inspect [options] <covenant>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <network>` | Network (default: the workspace's) |  |
| `--no-node` | Do not ask the node for the tip (records only) |  |
| `--no-states` | Do not check the declared states against the addresses |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `covenant` |  |

---

## hardkas silver covenant start

Create a covenant with one or more outputs, each holding its own state, all bound to the one covenant id the SDK derives (what an N:M transition spends): planned, checked, signed and sent by the SDK's v1 engine. `genesis` keeps the one-output form and its record

### Usage

```bash
hardkas silver covenant start [options] <record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--from <account>` | Funding account (local key): pays the outputs and the fee, gets the change |  |
| `--output <spec>` | A covenant output, in output order (repeatable): '<kas>', or '<state-file>=<kas>' for an output holding the state in that JSON file ({field: {kind, value}}); every output a state, or none (each then holds the record's own) |  |
| `--fee <sompi>` | Fee in sompi: at least the node's floor for this transaction (the floor when omitted) |  |
| `--compute-budget <n>` | Compute budget of the funding inputs (default: the certified P2PK budget) |  |
| `--constructor-args <file>` | Constructor arguments the contract was compiled with (default: proven from its initial State) |  |
| `--contract <name>` | Contract, when the artifact has several |  |
| `--network <network>` | Network (default: the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced) |  |
| `--wait` | Wait until every output is confirmed with the covenant id | false |
| `--timeout <seconds>` | Confirmation timeout | 120 |
| `--password-env <env>` | Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none) |  |
| `--password-stdin` | Read the keystore password of the encrypted account(s) this command signs with from stdin | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `record` |  |

---

## hardkas silver covenant transition

Advance a 1:1 auth-bound covenant: successor state compiled by silverc, same covenant id

### Usage

```bash
hardkas silver covenant transition [options] <covenant-record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--policy <name>` | Covenant declaration (policy function) to call |  |
| `--constructor-args <file>` | Constructor arguments of the current state (checked against the record) |  |
| `--state-map <json|file>` | State field -> constructor parameter index: inline JSON such as {"value":0}, or the path of a JSON file with it |  |
| `--next-state <file>` | Successor state: JSON object of {kind, value} per field |  |
| `--compute-budget <n>` | Compute budget of the covenant input, or 'estimate' (rusty-kaspa's upper bound); default: the certified budget of this entry, else that estimate |  |
| `--args <file>` | Entry arguments: JSON list of {kind, value} and {"kind":"signature","account":"<name>"} |  |
| `--fee <sompi>` | Fee in sompi, paid from the covenant's value: at least the node's floor for this transaction (the floor when omitted) |  |
| `--lock-time-daa <n>` | Absolute lock time as a DAA score (below 500000000000), for an entry that requires tx.daa >= x (CheckLockTimeVerify): checked against the entry's tx.daa statements before signing, and the spend is refused before the broadcast until the node's virtual DAA score is above it (LOCK_TIME_NOT_REACHED, nothing sent). Not with --lock-time-ms |  |
| `--lock-time-ms <t>` | Absolute lock time in milliseconds since the epoch (at or above 500000000000), for an entry that requires tx.time >= t: checked against the entry's tx.time statements before signing, and refused before the broadcast until the node's past median time is above it. Not with --lock-time-daa |  |
| `--emit-args <file>` | Write the successor's constructor arguments here (for the next transition) |  |
| `--network <network>` | Network (default: the covenant record's); mainnet refused; testnet-<n> needs experimental + network.allowPublic |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced) |  |
| `--wait` | Wait for confirmation and check the lineage | false |
| `--timeout <seconds>` | Confirmation timeout | 120 |
| `--password-env <env>` | Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none) |  |
| `--password-stdin` | Read the keystore password of the encrypted account(s) this command signs with from stdin | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `covenant-record` |  |

---

## hardkas silver debug

Execute a covenant transition on the SilverScript runner (cli-debugger: a local build, no official binary exists) after the structural v1 validation, and emit source-mapped step traces, variable state and three verdicts (structural, SCRIPT_VM, global). Exit codes: 0 APPROVED (or any rejection with --allow-failure); 1 rejected (SILVER_DEBUG_STRUCTURAL_REJECTED, SILVER_DEBUG_CONTRACT_REJECTED) or a runner that gave no verdict (SILVER_RUNNER_NOT_FOUND, _START_FAILED, _TIMEOUT, _PROTOCOL_ERROR or _INTERNAL_ERROR); 2 usage; 3 runner refused by the trust policy (SILVER_RUNNER_UNVERIFIED); 4 tampered compile record

### Usage

```bash
hardkas silver debug [options] <source-or-record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--entry <name>` | Covenant policy or entrypoint name (e.g. bump) |  |
| `--constructor-args <file>` | Constructor arguments JSON file |  |
| `--args <json-or-file>` | Entry arguments JSON array or file path |  |
| `--state <json-or-file>` | Current covenant state JSON object or file path |  |
| `--next-state <json-or-file>` | Successor covenant state JSON object or file path |  |
| `--demo-fixture` | Allow generated laboratory fixture parameters and synthetic UTXO when explicit transaction arguments are omitted | false |
| `--fee <sompi>` | Fee in sompi (default: 300000) |  |
| `--compute-budget <n>` | Compute budget or 'estimate' (default: estimate) |  |
| `--allow-failure` | Return exit code 0 when the transition is rejected (structural validation or SCRIPT_VM), for interactive inspection; the verdicts are unchanged | false |
| `--allow-unverified-runner` | Run a SilverScript runner (cli-debugger) that is not verified against a trusted reference. Upstream publishes no runner binary, so today every runner is an UNVERIFIED local build: without this flag none is executed. Its verdicts are labelled UNVERIFIED, never official | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `source-or-record` |  |

---

## hardkas silver deploy

Fund a compiled contract's P2SH output on a Kaspa node (the canonical localnet, or the node --url / the workspace names)

### Usage

```bash
hardkas silver deploy [options] <record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--from <account>` | Funding account (local key) |  |
| `--amount <kas>` | Value locked in the contract |  |
| `--contract <name>` | Contract, when the artifact has several |  |
| `--network <network>` | Network (default: the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced) |  |
| `--tx-version <n>` | Transaction version: 0 (the default, as certified) or 1 (the SDK's v1 engine: checks before any key, compute budgets) | 0 |
| `--wait` | Wait for confirmation | false |
| `--timeout <seconds>` | Confirmation timeout | 120 |
| `--password-env <env>` | Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none) |  |
| `--password-stdin` | Read the keystore password of the encrypted account(s) this command signs with from stdin | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `record` |  |

---

## hardkas silver doctor

Report whether the pinned toolchains and the node the Silver on-chain commands would use are ready

### Usage

```bash
hardkas silver doctor [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <network>` | Network (default: the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced) |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas silver engine

The SDK's v1 engine (sdk.covenants): plan and sign covenant and contract transactions; send them with `hardkas tx send`

### Usage

```bash
hardkas silver engine [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas silver engine draft](#hardkas-silver-engine-draft)
- [hardkas silver engine plan](#hardkas-silver-engine-plan)
- [hardkas silver engine sign](#hardkas-silver-engine-sign)

---

## hardkas silver engine draft

A v1 plan signed in turns by several parties (not a PSKT): prepare, sign, combine, finalize; send with `hardkas tx send`

### Usage

```bash
hardkas silver engine draft [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas silver engine draft combine](#hardkas-silver-engine-draft-combine)
- [hardkas silver engine draft finalize](#hardkas-silver-engine-draft-finalize)
- [hardkas silver engine draft prepare](#hardkas-silver-engine-draft-prepare)
- [hardkas silver engine draft sign](#hardkas-silver-engine-draft-sign)

---

## hardkas silver engine draft combine

Combine drafts signed by different parties: the same transaction and slots, every signature verified (one bad signature refuses all)

### Usage

```bash
hardkas silver engine draft combine [options] <drafts...>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--plan <plan>` | The plan the drafts were prepared for (its path or artifact id) |  |
| `--out <file>` | Combined draft path (default .hardkas/drafts/) |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `drafts` |  |

---

## hardkas silver engine draft finalize

Finalize a fully signed draft into the signed transaction (checked against the node and the compiler again, every signature verified)

### Usage

```bash
hardkas silver engine draft finalize [options] <draft>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--plan <plan>` | The plan the draft was prepared for (its path or artifact id) |  |
| `--network <network>` | Network (default: the plan's) |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `draft` |  |

---

## hardkas silver engine draft prepare

Prepare a draft of a v1 plan (its path or artifact id): checked against the node and the compiler now, its signature slots unsigned

### Usage

```bash
hardkas silver engine draft prepare [options] <plan>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <network>` | Network (default: the plan's) |  |
| `--out <file>` | Draft path (default .hardkas/drafts/) |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `plan` |  |

---

## hardkas silver engine draft sign

Sign one account's slots of a draft with its local key (the draft checked first; each signature verified before it is kept)

### Usage

```bash
hardkas silver engine draft sign [options] <draft>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--plan <plan>` | The plan the draft was prepared for (its path or artifact id) |  |
| `--account <name>` | The account whose slots this signs |  |
| `--network <network>` | Network (default: the plan's) |  |
| `--out <file>` | Signed draft path (default .hardkas/drafts/) |  |
| `--password-env <env>` | Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none) |  |
| `--password-stdin` | Read the keystore password of the encrypted account(s) this command signs with from stdin | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `draft` |  |

---

## hardkas silver engine plan

Plan a v1 transaction (genesis, transition, deploy or spend) from a JSON spec of the SDK's options, sompi as decimal strings

### Usage

```bash
hardkas silver engine plan [options] <operation> <spec>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <network>` | Network (default: the workspace's) |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `operation` |  |
| `spec` |  |

---

## hardkas silver engine sign

Sign a v1 plan (its path or artifact id) with the SDK's engine: checked against the node and the compiler first, no key read for a plan it refuses

### Usage

```bash
hardkas silver engine sign [options] <plan>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <network>` | Network (default: the plan's) |  |
| `--password-env <env>` | Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none) |  |
| `--password-stdin` | Read the keystore password of the encrypted account(s) this command signs with from stdin | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `plan` |  |

---

## hardkas silver fuzz

Run bidirectional property-based fuzzing over a counter covenant transition: SCRIPT_VM checks the counter rule (accepted iff delta > 0 and next = previous + delta) on the SilverScript runner; SYNTHETIC checks the structural compute-budget bounds. Exit codes: 0 FUZZ PASS; 1 counterexample (SILVER_FUZZ_FAILED), too few samples of one direction (SILVER_FUZZ_INSUFFICIENT_COVERAGE), a sample without a VM verdict (SILVER_FUZZ_NO_VM_EVIDENCE), a testbed error (SILVER_FUZZ_EVALUATION_ERROR), a runner that gave no verdict (SILVER_RUNNER_NOT_FOUND, _START_FAILED, _TIMEOUT, _PROTOCOL_ERROR or _INTERNAL_ERROR) or one that changed during the run (SILVER_RUNNER_CHANGED); 2 usage (SILVER_OPTION_INVALID, SILVER_FUZZ_SHAPE_UNSUPPORTED); 3 runner refused by the trust policy (SILVER_RUNNER_UNVERIFIED); 4 tampered compile record

### Usage

```bash
hardkas silver fuzz [options] <source-or-record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--entry <name>` | Covenant entrypoint name: it must take (State, int delta, sig) over a state of one int field | bump |
| `--constructor-args <file>` | Constructor arguments JSON file |  |
| `--runs <n>` | Generated samples (1-10000), run after the boundary samples that every run includes | 10 |
| `--seed <n>` | Deterministic RNG seed (32-bit integer) | 20261029 |
| `--backend <backend>` | SCRIPT_VM: the counter rule on the SilverScript runner; SYNTHETIC: the structural compute-budget bounds (no contract logic is judged without the VM) | SCRIPT_VM |
| `--allow-unverified-runner` | Run a SilverScript runner (cli-debugger) that is not verified against a trusted reference. Upstream publishes no runner binary, so today every runner is an UNVERIFIED local build: without this flag none is executed. Its verdicts are labelled UNVERIFIED, never official | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `source-or-record` |  |

---

## hardkas silver inspect

Show a SilverScript v1 compile record

### Usage

```bash
hardkas silver inspect [options] <record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `record` |  |

---

## hardkas silver preflight

Run v1 covenant transition preflight on a generated local testbed UTXO (STRUCTURAL_PREFLIGHT, plus SCRIPT_VM_PREFLIGHT on the SilverScript runner) reporting mass, compute budget and both verdicts; never a node's acceptance. Exit codes: 0 PREFLIGHT PASS; 1 PREFLIGHT FAIL (structural or SCRIPT_VM rejection: SILVER_PREFLIGHT_FAILED) or a runner that gave no verdict (SILVER_RUNNER_NOT_FOUND, _START_FAILED, _TIMEOUT, _PROTOCOL_ERROR or _INTERNAL_ERROR); 2 usage; 3 runner refused by the trust policy (SILVER_RUNNER_UNVERIFIED); 4 tampered compile record

### Usage

```bash
hardkas silver preflight [options] <source-or-record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--entry <name>` | Covenant policy or entrypoint name (e.g. bump) |  |
| `--constructor-args <file>` | Constructor arguments JSON file |  |
| `--args <json-or-file>` | Entry arguments JSON array or file path |  |
| `--state <json-or-file>` | Current covenant state JSON object or file path |  |
| `--next-state <json-or-file>` | Successor covenant state JSON object or file path |  |
| `--demo-fixture` | Allow generated laboratory fixture parameters and synthetic UTXO when explicit transaction arguments are omitted | false |
| `--fee <sompi>` | Fee in sompi (default: 300000) |  |
| `--compute-budget <n>` | Compute budget or 'estimate' (default: estimate) |  |
| `--level <level>` | Preflight level: STRUCTURAL_PREFLIGHT or SCRIPT_VM_PREFLIGHT | SCRIPT_VM_PREFLIGHT |
| `--allow-unverified-runner` | Run a SilverScript runner (cli-debugger) that is not verified against a trusted reference. Upstream publishes no runner binary, so today every runner is an UNVERIFIED local build: without this flag none is executed. Its verdicts are labelled UNVERIFIED, never official | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `source-or-record` |  |

---

## hardkas silver spend

Spend a deployed contract output through one of its entries

### Usage

```bash
hardkas silver spend [options] <deploy-record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--entry <name>` | Entry to call |  |
| `--to <address>` | Recipient of the whole value (minus the fee) |  |
| `--args <file>` | Entry arguments: JSON list of {kind, value} and {"kind":"signature","account":"<name>"} |  |
| `--sequence <n>` | Input sequence (relative locks) |  |
| `--lock-time-daa <n>` | Absolute lock time as a DAA score (below 500000000000), for an entry that requires tx.daa >= x (CheckLockTimeVerify): checked against the entry's tx.daa statements before signing, and the spend is refused before the broadcast until the node's virtual DAA score is above it (LOCK_TIME_NOT_REACHED, nothing sent). Not with --lock-time-ms |  |
| `--lock-time-ms <t>` | Absolute lock time in milliseconds since the epoch (at or above 500000000000), for an entry that requires tx.time >= t: checked against the entry's tx.time statements before signing, and refused before the broadcast until the node's past median time is above it. Not with --lock-time-daa |  |
| `--sig-op-count <n>` | Declared signature operations (default: the signature arguments, at least 1); transaction v0 only |  |
| `--network <network>` | Network (default: the deploy record's); mainnet refused; testnet-<n> needs experimental + network.allowPublic |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced) |  |
| `--tx-version <n>` | Transaction version: 0 (the default, as certified) or 1 (the SDK's v1 engine: checks before any key, compute budgets) | 0 |
| `--constructor-args <file>` | With --tx-version 1: the constructor arguments the contract was compiled with (default: proven from this spend's signers, when they are the keys it checks) |  |
| `--compute-budget <n>` | With --tx-version 1: the contract input's compute budget, or 'estimate' (rusty-kaspa's upper bound); default: the certified budget of this entry, else that estimate |  |
| `--wait` | Wait for confirmation | false |
| `--timeout <seconds>` | Confirmation timeout | 120 |
| `--password-env <env>` | Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none) |  |
| `--password-stdin` | Read the keystore password of the encrypted account(s) this command signs with from stdin | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `deploy-record` |  |

---

## hardkas silver test

Run a compiled contract's tests on the SilverScript runner (cli-debugger) experimental (script engine on scenario transactions, verdict level SCRIPT_VM; not transaction validity), or with --on-node on a Kaspa node (each case's real transaction, verdict level CONSENSUS_SIMNET on simnet; a case no real transaction reproduces is NOT_REPRODUCIBLE, never a pass). Exit codes: 0 every test passed; 1 a test failed (SILVER_TEST_FAILED) or the runner gave no verdict (SILVER_RUNNER_FAILED, _START_FAILED, _CHANGED, _TIMEOUT, _OUTPUT_UNRECOGNIZED, _PROTOCOL_ERROR or _INTERNAL_ERROR), with --on-node a case without a node verdict (SILVER_TEST_INCONCLUSIVE, SILVER_TEST_NOT_REPRODUCIBLE) or a run the node setup or a send stopped (SILVER_TEST_FUNDING_FAILED, SILVER_SUBMIT_NOT_SENT, SILVER_SUBMIT_OUTCOME_UNKNOWN, SILVER_CONFIRMATION_TIMEOUT); 2 usage; 3 runner refused by the trust policy (SILVER_RUNNER_UNVERIFIED), or a network refused by policy; 4 tampered compile record

### Usage

```bash
hardkas silver test [options] <record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--tests <file>` | Runner test file (.test.json); a sig argument may be {"signature":"<account>"} |  |
| `--args <file>` | The constructor arguments the record was compiled with |  |
| `--contract <name>` | Contract, when the artifact has several |  |
| `--runner <path>` | SilverScript runner (cli-debugger) binary (default: $HARDKAS_SILVER_RUNNER, else <HARDKAS_HOME>/toolchains/cli-debugger/1.0.0) |  |
| `--allow-unverified-runner` | Run a SilverScript runner (cli-debugger) that is not verified against a trusted reference. Upstream publishes no runner binary, so today every runner is an UNVERIFIED local build: without this flag none is executed. Its verdicts are labelled UNVERIFIED, never official | false |
| `--on-node` | Judge every case on a Kaspa node instead of the SilverScript runner: each case HardKAS can reproduce gets its own coin of the case's utxo_value at the contract's P2SH (paid from --from), then the real spend the case describes (entry, arguments, signatures of the named accounts, outputs, sequence, lock time; transaction v0, or v1 through the SDK's engine when the case's tx.version is 1 or absent), sent through HardKAS's send machinery. The node's answer is the verdict (CONSENSUS_SIMNET on simnet), next to the expected one; a case no real transaction reproduces is reported NOT_REPRODUCIBLE, never a pass. Needs a workspace that runs the network as a kaspa-l1 node | false |
| `--network <network>` | With --on-node: the network (default: the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config |  |
| `--url <url>` | With --on-node: the node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet) |  |
| `--from <account>` | With --on-node: the account that funds one coin per reproducible case at the contract's P2SH (local key) |  |
| `--timeout <seconds>` | With --on-node: seconds to wait for each funding coin, each relative lock and each accepted spend to show in the node's UTXO index (default 120) |  |
| `--out <file>` | Record path (default .hardkas/artifacts/silver-vm/; with --on-node .hardkas/artifacts/silver/) |  |
| `--password-env <env>` | Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none) |  |
| `--password-stdin` | Read the keystore password of the encrypted account(s) this command signs with from stdin | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `record` |  |

---

## hardkas silver verify

Reproduce a compile record with the managed silverc (byte-for-byte)

### Usage

```bash
hardkas silver verify [options] <record>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--args <file>` | The constructor arguments the record was compiled with |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `record` |  |

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
- [hardkas simulator start](#hardkas-simulator-start)

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

Create a synthetic simulated account (a kaspa:sim_ identity without a real key, for the simulated network only) experimental

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

Fund a synthetic simulated account (the project's default network must be the simulator; synthetic UTXOs, not a Kaspa node's) experimental

### Usage

```bash
hardkas simulator fund [options] <identifier>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--amount <kas>` | Amount in KAS, up to 8 decimals, above 0 | 1000 |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `identifier` |  |

---

## hardkas simulator start

Start the in-memory Kaspa node simulator (approximate rules, not consensus-equivalent) experimental

### Usage

```bash
hardkas simulator start [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `-p, --port <port>` | Port for the RPC server (HTTP JSON-RPC and wRPC JSON) | 19110 |
| `-H, --host <host>` | Host to bind | 127.0.0.1 |
| `-n, --network <network>` | Network ID (simnet, devnet, testnet-10, testnet-11) | simnet |
| `--automine` | Automine is on by default (this flag changes nothing; --no-automine turns it off) | true |
| `--no-automine` | Disable automine mode |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

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

Run the project's tests with Vitest and the HardKAS test helpers stable

### Usage

```bash
hardkas test [options] [files...]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <network>` | The network the scenarios run on: the workspace's network (default); a different one is refused |  |
| `--watch` | No effect: the CLI exits after the first run (the watch does not persist) | false |
| `--mass-report` | No effect in this release | false |
| `--mass-snapshot <label>` | No effect in this release |  |
| `--mass-compare <label>` | No effect in this release |  |
| `--json` | Output results as JSON | false |
| `--keep-runs` | Keep temporary scenario workspaces for debugging | false |
| `--evidence` | Automatically package evidence into .hke.json | false |
| `--scenario <name>` | Only run tests whose full name matches this regular expression |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `files` |  |

---

## hardkas toolchain

Install and verify the upstream toolchains HardKAS pins (official Kaspa release assets; an installed extension adds its own, e.g. the l2 extension's foundry)

### Usage

```bash
hardkas toolchain [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas toolchain install](#hardkas-toolchain-install)
- [hardkas toolchain status](#hardkas-toolchain-status)

---

## hardkas toolchain install

Install a pinned toolchain, verifying the release asset and every file against the pin

### Usage

```bash
hardkas toolchain install [options] <id>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--from-file <asset>` | Use a release asset already on disk instead of downloading it |  |
| `--force` | Reinstall even if a verified install is present | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `id` |  |

---

## hardkas toolchain status

Show whether each pinned toolchain is installed and matches its pin

### Usage

```bash
hardkas toolchain status [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

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
- [hardkas tx verify](#hardkas-tx-verify)
- [hardkas tx wait](#hardkas-tx-wait)

---

## hardkas tx batch

Process a batch of payments: one transaction per payment, sent in order, or all of them in one transaction (--one-transaction) stable

### Usage

```bash
hardkas tx batch [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--file <path>` | Path to JSON file containing batch payments |  |
| `--network <name>` | Network name |  |
| `--one-transaction` | Pay every payment of the file in ONE transaction: one payer, one output per payment (in the file's order), one change output, one fee, one submission. Refused before anything is planned, signed or sent when the file has payments from more than one payer (TX_BATCH_MULTIPLE_PAYERS), a payment without from, to or amount (TX_BATCH_PAYMENT_INVALID), or more recipients than fit in one standard transaction (TOO_MANY_OUTPUTS, which says how many fit). Without it, each payment is its own transaction | false |
| `--workspace <path>` | Override workspace root directory |  |
| `--password-env <env>` | Read the keystore password of the batch's encrypted payers from this environment variable (read once, before the first payment) |  |
| `--password-stdin` | Read the keystore password of the batch's encrypted payers from stdin (read once, before the first payment) | false |
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
hardkas tx plan [options] [from] [to]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--target <name>` | Named execution target from hardkas.config.ts |  |
| `--from <accountOrAddress>` | Sender account name or address (default: alice) |  |
| `--to <address>` | Recipient address or account name (default: bob). Repeat it as --to <recipient>=<kas> (no --amount) to pay several recipients in one transaction: one output each, in the order given, one change output and one fee |  |
| `--amount <kas>` | Amount in KAS, up to 8 decimals (default: 1) |  |
| `--network <name>` | simulated, simnet, devnet, testnet-10, testnet-12 or mainnet (default: the config's default target) |  |
| `--fee-rate <sompiPerMass>` | Whole sompi per gram of mass, at least 1 (default: 1 in the simulator, 100 on real networks; not a live estimate) |  |
| `--max-fee <sompi>` | Total fee limit in sompi: the plan is refused (FEE_EXCEEDS_MAX) above it, and the limit is recorded in the plan and enforced again at sign and send. The workspace's networks[<net>].maxFeeSompi also applies; the lower one wins. No limit by default |  |
| `--change <accountOrAddress>` | Change destination (account name or address); default: the sender |  |
| `--lock-time-daa <n>` | Absolute lock time as a DAA score (below 500000000000): the transaction is valid only once the node's virtual DAA score is above it; `tx send` refuses to broadcast it earlier (LOCK_TIME_NOT_REACHED, nothing sent). Not with --lock-time-ms; not on the simulator |  |
| `--lock-time-ms <t>` | Absolute lock time as milliseconds since the epoch (at or above 500000000000): valid only once the node's past median time is above it; `tx send` refuses to broadcast it earlier. Not with --lock-time-daa; not on the simulator |  |
| `--confirm-distant-lock-time` | Plan a lock time more than about a day past the node's position (864000 DAA, or 86400000 ms); refused without it (LOCK_TIME_DISTANT_UNCONFIRMED) | false |
| `--provider <type>` | Provider mode (auto, rpc, simulated) | auto |
| `--url <url>` | Node wRPC URL (default: the network's rpcUrl in hardkas.config.ts; without one, ws://127.0.0.1:18210 for simnet and ws://127.0.0.1:18610 for devnet) |  |
| `--out <path>` | Save plan as artifact JSON |  |
| `--save <path>` | Alias for --out (Save plan as artifact JSON) |  |
| `--workflow-id <id>` | Optional deterministic workflow ID override |  |
| `--assumption-level <level>` | Optional assumption level override |  |
| `--wait-lock` | No effect, kept for compatibility: the command takes no lock of its own, and each store write waits for the store (up to 30 s) | false |
| `--lock-timeout <ms>` | No effect, kept for compatibility (see --wait-lock) | 30000 |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `from` |  |
| `to` |  |

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
| `--target <name>` | Named execution target from hardkas.config.ts (signed-artifact mode: it must match the artifact and never redirects the send) |  |
| `--from <accountOrAddress>` | Sender (shortcut mode) |  |
| `--to <address>` | Recipient (shortcut mode) |  |
| `--amount <kas>` | Amount in KAS (shortcut mode) |  |
| `--network <name>` | Network name |  |
| `--fee-rate <sompiPerMass>` | Fee rate in sompi per mass (shortcut mode) |  |
| `--lock-time-daa <n>` | Shortcut mode: Absolute lock time as a DAA score (below 500000000000): the transaction is valid only once the node's virtual DAA score is above it; `tx send` refuses to broadcast it earlier (LOCK_TIME_NOT_REACHED, nothing sent). Not with --lock-time-ms; not on the simulator |  |
| `--lock-time-ms <t>` | Shortcut mode: Absolute lock time as milliseconds since the epoch (at or above 500000000000): valid only once the node's past median time is above it; `tx send` refuses to broadcast it earlier. Not with --lock-time-daa; not on the simulator |  |
| `--confirm-distant-lock-time` | Shortcut mode: Plan a lock time more than about a day past the node's position (864000 DAA, or 86400000 ms); refused without it (LOCK_TIME_DISTANT_UNCONFIRMED) | false |
| `--password-env <env>` | Shortcut mode: read the sender's keystore password (an encrypted account) from this environment variable |  |
| `--password-stdin` | Shortcut mode: read the sender's keystore password (an encrypted account) from stdin | false |
| `--provider <type>` | Provider mode (auto, rpc, simulated; signed-artifact mode only) | auto |
| `--url <url>` | RPC URL (optional override) |  |
| `--wait` | After the node accepts the send, wait until the transaction is CONFIRMED, as `hardkas tx wait <txId>`, on the same node (--url, else the network's configured one). Not reaching it in time is TX_SEND_WAIT_FAILED (exit 1): the transaction was still submitted | false |
| `--wait-timeout <seconds>` | With --wait: how long to wait, in seconds or with a unit (500ms, 60s, 2m) (default: 60) |  |
| `--yes` | Confirm broadcast. Required unless the network is simulated or simnet (in shortcut mode, unless --network simulated or simnet is given): without it the send is refused (NOT EXECUTED, exit 3) and nothing is written | false |
| `--wait-lock` | No effect, kept for compatibility: the command takes no lock of its own, and each store write waits for the store (up to 30 s) | false |
| `--lock-timeout <ms>` | No effect, kept for compatibility (see --wait-lock) | 30000 |
| `--json` | Output as JSON | false |
| `--track <label>` | Signed-artifact mode: after an accepted broadcast, record a deployment with this label |  |
| `--preflight` | Payments: right before the broadcast, check every input at the node (unspent, as planned, no covenant id, not pending in its mempool) and verify each input's signature against the node's UTXO; anything it cannot verify refuses the send. One node's view, not a consensus validation | false |
| `--allow-unplanned` | Signed-artifact mode: send a signed transaction that names no plan of this workspace (signed elsewhere). HardKAS then cannot check that it is a planned transaction nor its fee limit: you take both on yourself. Without it such a send is refused (SEND_PLAN_UNRESOLVED). Never on mainnet (MAINNET_UNPLANNED_SEND_REFUSED) | false |

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
| `--fixture` | Sign with the built-in fixture test key (any network except mainnet) | false |
| `--threshold <number>` | Synthetic multisig threshold for tests (no Kaspa multisig script is produced) |  |
| `--required-signers <list>` | Comma-separated signers, no spaces (with --threshold above 1) |  |
| `--append` | Append signature to a partially signed transaction | false |
| `--target <name>` | Named execution target from hardkas.config.ts |  |
| `--password-env <env>` | Read the encrypted account's keystore password from this environment variable |  |
| `--password-stdin` | Read the encrypted account's keystore password from stdin | false |
| `--wait-lock` | No effect, kept for compatibility: the command takes no lock of its own, and each store write waits for the store (up to 30 s) | false |
| `--lock-timeout <ms>` | No effect, kept for compatibility (see --wait-lock) | 30000 |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `planPath` |  |

---

## hardkas tx status

Show the derived state of a txId (SUBMITTED, MEMPOOL_ACCEPTED, ACCEPTED, CONFIRMED, FINALIZED, REORGED, …) from the workspace evidence plus one new observation, or the signature coverage of a plan/signed artifact path

### Usage

```bash
hardkas tx status [options] <txIdOrPath>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--no-observe` | Derive from the evidence already in the workspace; take no new observation |  |
| `-n, --network <network>` | Network whose configured node observes (default: the network of the recorded submission) |  |
| `--since <chainBlockHash>` | Scan the node's virtual chain from this chain block (64 hex; it must precede the tx's acceptance) — for a tx sent outside this workspace |  |
| `--address <address>` | Locate the transaction first through the history of an address it pays or spends from (a bounded window of the node's selected chain: from --since, else the last --lookback chain blocks); found, the new look scans from the chain block before its acceptance (also when its outputs were spent since) |  |
| `--lookback <chainBlocks>` | With --address and no --since: the history's window, in chain blocks back from the node's sink (default 1000, at most 100000) |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `txIdOrPath` |  |

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

Wait until the derived state of a txId reaches ACCEPTED or CONFIRMED (blue-score depth ≥ the HardKAS policy), observing the configured node, then until that node's UTXO view reflects it stable

### Usage

```bash
hardkas tx wait [options] <txId>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--until <target>` | accepted or confirmed | confirmed |
| `--timeout <seconds>` | Timeout in seconds | 60 |
| `--interval <seconds>` | Seconds between observations | 2 |
| `-n, --network <network>` | Network whose configured node observes (default: the network of the recorded submission) |  |
| `--url <url>` | Node wRPC URL that observes, instead of the network's configured one (as tx send --url) |  |
| `--since <chainBlockHash>` | Scan the node's virtual chain from this chain block (64 hex; it must precede the tx's acceptance) on the first look — for a tx sent outside this workspace |  |
| `--address <address>` | An address the tx pays (repeatable), for a tx sent outside this workspace with no --since: the scan starts at the node's sink when the wait starts; an output of the tx listed there before that point makes the wait walk back along the node's selected chain (--lookback) and scan from there, else it ends (TX_WAIT_ACCEPTED_BEFORE_CURSOR); the UTXO view is checked there |  |
| `--lookback <chainBlocks>` | With --address: chain blocks the wait may walk back from the node's sink (getBlock, selected parent) to find a tx accepted before it started (default 1000, at most 10000, 0 = never); the acceptance is the node's own virtual-chain answer from there. Given explicitly, the wait starts at the sink even when this workspace stored looks at the txId |  |
| `--json` | Output as JSON | false |

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
| `--json` | No effect: up prints human output only | false |

### Arguments

No arguments.

---

## hardkas verify

Verify artifact integrity and lineage continuity across the workspace stable

### Usage

```bash
hardkas verify [options] [path]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output machine-readable JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` | Workspace-contained artifact file or directory to verify (default: .hardkas/artifacts) |

---

## hardkas verify-semantics

Unsupported: always refuses with VERIFY_SEMANTICS_UNSUPPORTED (no HardKAS subsystem records the semantic hashes it would compare); use 'hardkas verify' for artifact integrity and lineage

### Usage

```bash
hardkas verify-semantics [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output the refusal as a JSON envelope | false |
| `--ci-mode` | No effect: the command always refuses | false |

### Arguments

No arguments.

---

## hardkas vprogs

vProgs inspect-only builder surface (Outputs JSON by default)

### Usage

```bash
hardkas vprogs [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas vprogs capabilities](#hardkas-vprogs-capabilities)
- [hardkas vprogs inspect](#hardkas-vprogs-inspect)
- [hardkas vprogs status](#hardkas-vprogs-status)

---

## hardkas vprogs capabilities

Show vProgs inspect capabilities

### Usage

```bash
hardkas vprogs capabilities [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas vprogs inspect

Inspect a local vProgs artifact without runtime claims

### Usage

```bash
hardkas vprogs inspect [options] <artifact>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `artifact` |  |

---

## hardkas vprogs status

Show vProgs inspect status

### Usage

```bash
hardkas vprogs status [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas wallet

Wallets kept in the workspace

### Usage

```bash
hardkas wallet [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas wallet hd](#hardkas-wallet-hd)

---

## hardkas wallet hd

Recoverable HD wallets: a BIP39 recovery phrase (12 or 24 English words) and Kaspa's BIP32 derivation (m/44'/111111'/<account>'/<0 receive|1 change>/<index>), encrypted in .hardkas/wallets/; they receive on many addresses and spend from all of them. Mainnet is refused while it is locked down experimental

### Usage

```bash
hardkas wallet hd [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas wallet hd address](#hardkas-wallet-hd-address)
- [hardkas wallet hd balance](#hardkas-wallet-hd-balance)
- [hardkas wallet hd change-password](#hardkas-wallet-hd-change-password)
- [hardkas wallet hd create](#hardkas-wallet-hd-create)
- [hardkas wallet hd import](#hardkas-wallet-hd-import)
- [hardkas wallet hd import-watch-only](#hardkas-wallet-hd-import-watch-only)
- [hardkas wallet hd list](#hardkas-wallet-hd-list)
- [hardkas wallet hd reveal](#hardkas-wallet-hd-reveal)
- [hardkas wallet hd send](#hardkas-wallet-hd-send)

---

## hardkas wallet hd address

Show a receive (or --change) address. Without --index: the next unused one, and the wallet's index advances. An HD wallet is opened with its password first, so the address comes from its authenticated keys experimental

### Usage

```bash
hardkas wallet hd address [options] <wallet>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--change` | A change address instead of a receive address | false |
| `--index <n>` | This address index (the wallet's index does not move) |  |
| `--account <n>` | Account index (default 0) |  |
| `--password-env <env>` | Read the wallet password from this environment variable |  |
| `--password-stdin` | Read the wallet password from stdin | false |
| `--passphrase-env <env>` | Read the wallet's BIP39 passphrase (the optional "25th word") from this environment variable; never stored |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `wallet` |  |

---

## hardkas wallet hd balance

Scan the wallet's receive and change addresses on the node (gap limit) and show what they hold. Mainnet is refused: MAINNET_CONNECTION_DISABLED experimental

### Usage

```bash
hardkas wallet hd balance [options] <wallet>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <network>` | The workspace network to read (default: the workspace's): it must be the wallet's |  |
| `--gap-limit <n>` | Consecutive unused addresses per chain before the scan stops (default 20) |  |
| `--account <n>` | Account index (default 0) |  |
| `--password-env <env>` | Read the wallet password from this environment variable (optional: the scan then uses the authenticated keys; without it the result says verified: false) |  |
| `--password-stdin` | Read the wallet password from stdin | false |
| `--passphrase-env <env>` | Read the wallet's BIP39 passphrase (the optional "25th word") from this environment variable; never stored |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `wallet` |  |

---

## hardkas wallet hd change-password

Re-encrypt the wallet under a new password (the recovery phrase and the addresses do not change) experimental

### Usage

```bash
hardkas wallet hd change-password [options] <wallet>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--password-env <env>` | Read the CURRENT wallet password from this environment variable |  |
| `--password-stdin` | Read the CURRENT wallet password from stdin | false |
| `--new-password-env <env>` | Read the NEW wallet password (at least 8 characters) from this environment variable |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `wallet` |  |

---

## hardkas wallet hd create

Create a wallet with a new random recovery phrase, encrypted under its password (the phrase is not printed: back it up with 'wallet hd reveal') experimental

### Usage

```bash
hardkas wallet hd create [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--name <name>` | Wallet name: 1 to 64 letters, digits, _ and - |  |
| `--network <network>` | Network the wallet is declared on: a network id (simnet, devnet, testnet-<n>) or a workspace network entry (default: the workspace's network, else simnet). Mainnet, in any spelling or through a config alias, is refused: MAINNET_SIGNING_DISABLED, nothing is generated |  |
| `--words <count>` | Recovery phrase length: 12 or 24 (default 24) |  |
| `--password-env <env>` | Read the wallet password from this environment variable |  |
| `--password-stdin` | Read the wallet password from stdin | false |
| `--passphrase-env <env>` | Read the wallet's BIP39 passphrase (the optional "25th word") from this environment variable; never stored |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas wallet hd import

Recover a wallet from its BIP39 recovery phrase (12 or 24 English words) and, if it had one, its passphrase experimental

### Usage

```bash
hardkas wallet hd import [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--name <name>` | Wallet name: 1 to 64 letters, digits, _ and - |  |
| `--network <network>` | Network the wallet is declared on (as for create). Mainnet is refused: MAINNET_SIGNING_DISABLED, nothing is read or written |  |
| `--mnemonic-env <env>` | Read the recovery phrase from this environment variable |  |
| `--mnemonic-stdin` | Read the recovery phrase from stdin (then the password must come from --password-env) | false |
| `--password-env <env>` | Read the wallet password from this environment variable |  |
| `--password-stdin` | Read the wallet password from stdin | false |
| `--passphrase-env <env>` | Read the wallet's BIP39 passphrase (the optional "25th word") from this environment variable; never stored |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas wallet hd import-watch-only

Add a watch-only wallet from an account's extended public key (kpub/ktub of m/44'/111111'/<account>'): addresses and balance, no keys, nothing to sign with experimental

### Usage

```bash
hardkas wallet hd import-watch-only [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--name <name>` | Wallet name: 1 to 64 letters, digits, _ and - |  |
| `--xpub <kpub>` | The account-level extended public key (a master key is refused: HD_WALLET_XPUB_INVALID) |  |
| `--network <network>` | Network the wallet is declared on (as for create). Mainnet is refused: MAINNET_CONNECTION_DISABLED |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas wallet hd list

List the workspace's HD wallets (public header only; nothing is decrypted) experimental

### Usage

```bash
hardkas wallet hd list [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas wallet hd reveal

Print the wallet's recovery phrase (SECRET: anyone who reads it owns the funds). Needs the password and --yes experimental

### Usage

```bash
hardkas wallet hd reveal [options] <wallet>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--yes` | Confirm that the recovery phrase is printed to this terminal (or to stdout with --json) | false |
| `--password-env <env>` | Read the wallet password from this environment variable |  |
| `--password-stdin` | Read the wallet password from stdin | false |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `wallet` |  |

---

## hardkas wallet hd send

Pay from the wallet: one plan over the UTXOs of all its addresses (the payment planner), change to its next unused change address, each input signed with its own address's key, sent through the same send path as 'tx send' (synced node, one submission per txId, records). Mainnet is refused: MAINNET_BROADCAST_DISABLED, before the password is read experimental

### Usage

```bash
hardkas wallet hd send [options] <wallet>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--to <address>` | Recipient: a Kaspa address or a workspace account name |  |
| `--amount <kas>` | Amount in KAS (decimal string) |  |
| `--network <network>` | The workspace network to send on (default: the workspace's): it must be the wallet's |  |
| `--fee-rate <sompiPerGram>` | Fee rate in sompi per gram (default: the node's normal estimate) |  |
| `--max-fee-sompi <sompi>` | The most this payment may pay in fees, in sompi (the workspace's or HardKAS's default limit applies anyway) |  |
| `--gap-limit <n>` | Consecutive unused addresses per chain before the scan stops (default 20) |  |
| `--account <n>` | Account index (default 0) |  |
| `--preflight` | Check every input and signature against the node right before the broadcast (as 'tx send --preflight') | false |
| `--password-env <env>` | Read the wallet password from this environment variable |  |
| `--password-stdin` | Read the wallet password from stdin | false |
| `--passphrase-env <env>` | Read the wallet's BIP39 passphrase (the optional "25th word") from this environment variable; never stored |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `wallet` |  |

---

## hardkas watch

Watch an address's UTXOs on a Kaspa node: one line per event (outputs added, removed, matured; a resync after every reconnect; errors), covenant outputs labelled. Read-only; mainnet is refused

### Usage

```bash
hardkas watch [options] <address>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet) |  |
| `--url <url>` | Node wRPC (JSON) endpoint |  |
| `--timeout <seconds>` | Stop after this many seconds (default: until interrupted) |  |
| `--until <n>` | Stop after n events (added, removed, matured or resync) |  |
| `--json` | JSON lines: one compact JSON document per event (snapshot first, end last) | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `address` |  |

---

## hardkas why

Explain the causal lineage of an artifact resolved by exact artifactId, artifact file path, or a namespaced identifier (--plan, --signed, --tx, --workflow)

### Usage

```bash
hardkas why [options] [artifact]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--artifact <id-or-path>` | 64-hex artifactId or workspace path (same as the positional) |  |
| `--plan <planId>` | Resolve a plan by its derived label (verified against its hash) |  |
| `--signed <signedId>` | Resolve a signed transaction by its derived label (verified) |  |
| `--tx <txId>` | Resolve the submission receipt for a txId (never the signed); with no submission here, the tx as observed by this workspace (origin: observed) |  |
| `--workflow <workflowId>` | Resolve a workflow run by its correlation id |  |
| `--json` | Output lineage graph in JSON format |  |
| `--workspace <path>` | Override workspace root directory |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `artifact` | Exact 64-hex artifactId (the recomputed contentHash) or absolute/workspace-relative path to the artifact .json file |

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

- [hardkas workflow diff](#hardkas-workflow-diff)
- [hardkas workflow inspect](#hardkas-workflow-inspect)
- [hardkas workflow run](#hardkas-workflow-run)

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
| `--network <net>` | Target network (e.g. simulated, simnet, testnet-10; mainnet is blocked) |  |
| `--offline` | Force offline execution (rejects real RPC connections) | false |
| `--timeout <ms>` | Maximum execution time in milliseconds |  |
| `--json` | Output the final workflow artifact as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `file` |  |

---

## hardkas zk

Experimental local-only ZK proof artifact tools (fixture coherence, Groth16 pairing check, Toccata script building; no on-chain claims)

### Usage

```bash
hardkas zk [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas zk capabilities](#hardkas-zk-capabilities)
- [hardkas zk corpus](#hardkas-zk-corpus)
- [hardkas zk proof](#hardkas-zk-proof)
- [hardkas zk toccata](#hardkas-zk-toccata)

---

## hardkas zk capabilities

Show experimental ZK lab capabilities

### Usage

```bash
hardkas zk capabilities [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas zk corpus

Verify experimental ZK fixture corpora

### Usage

```bash
hardkas zk corpus [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas zk corpus verify](#hardkas-zk-corpus-verify)

---

## hardkas zk corpus verify

Verify a local ZK corpus (coherence of every listed fixture; pairing check where a fixture claims it, which needs the optional peer snarkjs)

### Usage

```bash
hardkas zk corpus verify [options] <path>
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

## hardkas zk proof

Inspect and verify local proof artifacts

### Usage

```bash
hardkas zk proof [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas zk proof inspect](#hardkas-zk-proof-inspect)
- [hardkas zk proof verify](#hardkas-zk-proof-verify)
- [hardkas zk proof verify-math](#hardkas-zk-proof-verify-math)

---

## hardkas zk proof inspect

Inspect a local proof fixture or artifact

### Usage

```bash
hardkas zk proof inspect [options] <path>
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

## hardkas zk proof verify

**Aliases:** verify-local

Verify local fixture coherence for a proof artifact (No cryptographic proof or on-chain claims) alpha

### Usage

```bash
hardkas zk proof verify [options] <path>
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

## hardkas zk proof verify-math

Groth16 pairing check (snarkjs, BN254; snarkjs is an optional peer of @hardkas/sdk, without it ZK_ENGINE_UNAVAILABLE) of a fixture; VERIFIED only for a pinned verification key (--expect-vk-hash or the in-code registry), otherwise VALID_UNANCHORED_VK; fixture coherence is self-attested (No on-chain claims) alpha

### Usage

```bash
hardkas zk proof verify-math [options] <path>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |
| `--timeout <ms>` | Verification timeout in milliseconds (integer, 1..600000) | 10000 |
| `--expect-vk-hash <sha256>` | Pin the verification key: its fingerprint (summary.verificationKeyFingerprint) or legacy digest, obtained from a source you trust |  |
| `--math-only` | Skip the self-attested fixture-coherence check; the result is labelled MATH_ONLY | false |
| `--allow-weak-vk` | Accept a verification key with a known trapdoor (toy fixtures only; proofs against such keys prove nothing) | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas zk toccata

Kaspa Toccata L1 Zero-Knowledge lock tools (kaspa-wasm ZkScriptBuilder): build and verify locks; `spend` sends a lock's spend through HardKAS's send (recorded, one submission per txId) and `observe` looks at it

### Usage

```bash
hardkas zk toccata [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas zk toccata build-scripts](#hardkas-zk-toccata-build-scripts)
- [hardkas zk toccata observe](#hardkas-zk-toccata-observe)
- [hardkas zk toccata rules](#hardkas-zk-toccata-rules)
- [hardkas zk toccata spend](#hardkas-zk-toccata-spend)
- [hardkas zk toccata verify-receipt](#hardkas-zk-toccata-verify-receipt)
- [hardkas zk toccata verify-scripts](#hardkas-zk-toccata-verify-scripts)

---

## hardkas zk toccata build-scripts

Build P2SH redeem and signature scripts for a RISC Zero Groth16 receipt (the receipt's claim is cross-checked against imageId/journalHash). Modes: proof-only (default; the lock binds the image id only: any holder of a valid receipt spends) or proof-and-output-bound (the redeem script also enforces the payout/change outputs by introspection). Simnet address only unless public networks are requested (proof-only also needs the acknowledgement)

### Usage

```bash
hardkas zk toccata build-scripts [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--image-id <hex>` | 32-byte hex Image ID |  |
| `--journal-hash <hex>` | 32-byte hex Journal Hash |  |
| `--receipt <pathOrHex>` | Path to receipt file (.hex) or raw receipt hex string |  |
| `--mode <mode>` | Binding mode: 'proof-only' (unbound outputs) or 'proof-and-output-bound' (consensus output introspection) | proof-only |
| `--payout-address <address>` | Consensus-bound recipient address (required if mode is proof-and-output-bound) |  |
| `--payout-amount <sompi>` | Consensus-bound payout amount in sompi (required if mode is proof-and-output-bound) |  |
| `--change-address <address>` | Optional consensus-bound change address |  |
| `--change-amount <sompi>` | Optional consensus-bound change amount in sompi |  |
| `--max-fee <sompi>` | proof-and-output-bound: the most the lock may pay as fee; a UTXO above the bound outputs plus this stays locked (default 50000000) |  |
| `--address-network <networks>` | Also return the P2SH address for testnet-10; proof-only needs --ack-image-id-only-lock, and is never built for a public test program (an output-bound lock of one is, with a warning: anyone can trigger its payout). mainnet (any spelling) is refused while mainnet is locked down (MAINNET_SIGNING_DISABLED): nothing is built |  |
| `--ack-image-id-only-lock` | Acknowledge that a proof-only lock binds only the image id (anyone with a valid receipt can spend, replay or front-run) | false |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas zk toccata observe

One look at a ZK spend through the node (as 'tx status' looks: the observation is recorded) and its ZK operation status, from the ZK fact 'zk toccata spend' recorded (or --fact). mainnet is refused

### Usage

```bash
hardkas zk toccata observe [options] <txId>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--fact <file>` | The ZK fact (hardkas.zkVerificationFact.v1) of the spend, when the workspace does not hold it |  |
| `--network <name>` | Network: simnet or testnet-10 (default: the workspace's, else simnet). mainnet is refused; testnet-10 needs experimental + network.allowPublic in the config |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet) |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `txId` |  |

---

## hardkas zk toccata rules

Show the Kaspa Toccata L1 Groth16 precompile facts HardKAS relies on (opcode, tag, costs, compute budget)

### Usage

```bash
hardkas zk toccata rules [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas zk toccata spend

Spend a RISC Zero Groth16 lock through HardKAS's send (the SDK's spendR0Groth16Lock): the lock is rebuilt from the receipt and its record (--scripts) or its parameters and checked as verify-scripts checks it; the plan, the signed transaction, the ZK fact and the submission are recorded in the workspace (one submission per txId); the node must prove its network and say it is synced. mainnet is refused; testnet-10 needs experimental + network.allowPublic

### Usage

```bash
hardkas zk toccata spend [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--receipt <pathOrHex>` | Path to receipt file (.hex) or raw receipt hex string (the lock's proof) |  |
| `--utxo <txid:index>` | The lock's UTXO to spend (its amount is read from the node) |  |
| `--scripts <file>` | The lock's record: the JSON 'zk toccata build-scripts --json' printed (its parameters are used; its scripts must be the ones the receipt rebuilds) |  |
| `--image-id <hex>` | Without --scripts: the lock's 32-byte hex Image ID |  |
| `--journal-hash <hex>` | Without --scripts: the lock's 32-byte hex Journal Hash |  |
| `--mode <mode>` | Without --scripts: the lock's binding mode, 'proof-only' (default) or 'proof-and-output-bound' |  |
| `--payout-address <address>` | Without --scripts, proof-and-output-bound: the lock's bound payout address |  |
| `--payout-amount <sompi>` | Without --scripts, proof-and-output-bound: the lock's bound payout amount in sompi |  |
| `--change-address <address>` | Without --scripts, proof-and-output-bound: the lock's bound change address |  |
| `--change-amount <sompi>` | Without --scripts, proof-and-output-bound: the lock's bound change amount in sompi |  |
| `--max-fee <sompi>` | Without --scripts, proof-and-output-bound: the lock's fee cap (default 50000000) |  |
| `--to <address>` | proof-only: where the UTXO minus the fee goes (required); proof-and-output-bound: the bound payout (default; another address is refused) |  |
| `--fee <sompi>` | proof-only: the fee in sompi (default: the recommended fee for the measured spend); proof-and-output-bound: implied by the lock (a different one is refused) |  |
| `--compute-budget <n>` | The input's compute budget (default 1600; at least what the verifier needs) |  |
| `--ack-image-id-only-lock` | testnet-10, proof-only: acknowledge that the lock binds only the image id (whoever sees the proof in the mempool can redirect the spend) | false |
| `--network <name>` | Network: simnet or testnet-10 (default: the workspace's, else simnet). mainnet is refused; testnet-10 needs experimental + network.allowPublic in the config |  |
| `--url <url>` | Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet) |  |
| `--yes` | Confirm the broadcast. Required unless the network is simnet: without it the spend is refused (NOT EXECUTED, exit 3) and nothing is written | false |
| `--wait` | After the send, wait until the node accepts the spend (observed, as 'tx wait --until accepted') | false |
| `--timeout <seconds>` | With --wait: how long to wait (integer seconds, 1..3600) | 120 |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas zk toccata verify-receipt

Verify a RISC Zero Groth16 receipt locally (snarkjs, BN254; without the optional peer snarkjs, ZK_ENGINE_UNAVAILABLE) against the pinned official RISC Zero verifying key, control root and BN254 control id, for the claim of (imageId, journalHash) (No on-chain claims) alpha

### Usage

```bash
hardkas zk toccata verify-receipt [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--image-id <hex>` | 32-byte hex Image ID |  |
| `--journal-hash <hex>` | 32-byte hex Journal Hash |  |
| `--receipt <pathOrHex>` | Path to receipt file (.hex) or raw receipt hex string |  |
| `--timeout <ms>` | Verification timeout in milliseconds (integer, 1..600000) | 10000 |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas zk toccata verify-scripts

Verify Toccata P2SH scripts: the pinned RISC Zero verifying key, control root and control id, and a redeem script byte-identical to the one HardKAS builds for the parameters it carries; consensusEnforced only for such an output-bound lock (payout, change, one input, input limit), never from the presence of opcodes

### Usage

```bash
hardkas zk toccata verify-scripts [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--redeem-script <hex>` | Redeem script hex |  |
| `--sig-script <hex>` | Signature script hex |  |
| `--image-id <hex>` | Expected 32-byte hex Image ID |  |
| `--journal-hash <hex>` | Expected 32-byte hex Journal Hash |  |
| `--expected-mode <mode>` | Expected binding mode ('proof-only' or 'proof-and-output-bound') |  |
| `--expected-payout-address <address>` | Expected consensus-bound payout address |  |
| `--expected-payout-amount <sompi>` | Expected consensus-bound payout amount in sompi |  |
| `--expected-change-address <address>` | Expected consensus-bound change address (output 1) |  |
| `--expected-change-amount <sompi>` | Expected consensus-bound change amount in sompi |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

