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
| `--network <name>` | Network name (simnet, localnet, etc.) |  |
| `--url <rpc-url>` | Explicit RPC URL |  |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `identifier` |  |

---

## hardkas accounts fund

Fund an account (Faucet)

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
| `--password-env <env>` | Read keystore password from environment variable |  |
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

- [hardkas artifact explain](#hardkas-artifact-explain)
- [hardkas artifact lineage](#hardkas-artifact-lineage)
- [hardkas artifact verify](#hardkas-artifact-verify)

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

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

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

### Arguments

| Argument | Description |
| :--- | :--- |
| `path` |  |

---

## hardkas bridge

Kaspa -> Igra bridge developer tools

### Usage

```bash
hardkas bridge [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas bridge local](#hardkas-bridge-local)

---

## hardkas bridge local

Local bridge entry simulation (deterministic)

### Usage

```bash
hardkas bridge local [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas bridge local inspect](#hardkas-bridge-local-inspect)
- [hardkas bridge local plan](#hardkas-bridge-local-plan)
- [hardkas bridge local simulate](#hardkas-bridge-local-simulate)

---

## hardkas bridge local inspect

Inspect a local bridge transaction artifact stable

### Usage

```bash
hardkas bridge local inspect [options] <txid>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `txid` |  |

---

## hardkas bridge local plan

Plan a local bridge entry transaction stable

### Usage

```bash
hardkas bridge local plan [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--session <name>` | Link to a specific developer session |  |
| `--from <name>` | Source Kaspa wallet name (overrides session) |  |
| `--to-igra <address>` | Target Igra EVM address (overrides session) |  |
| `--amount <kas>` | Amount in KAS to bridge |  |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas bridge local simulate

Simulate a bridge entry with prefix mining stable

### Usage

```bash
hardkas bridge local simulate [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--session <name>` | Link to a specific developer session |  |
| `--from <name>` | Source Kaspa wallet name (overrides session) |  |
| `--to-igra <address>` | Target Igra EVM address (overrides session) |  |
| `--amount <kas>` | Amount in KAS to bridge |  |
| `--prefix <hex>` | Prefix to mine for | abc |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

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

- [hardkas config show](#hardkas-config-show)

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

## hardkas dashboard

Open the HardKas Local Dashboard stable

### Usage

```bash
hardkas dashboard [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--port <number>` | Port to bind to | 7420 |
| `--start-server` | Start the dev server if not running | false |

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

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas dev doctor](#hardkas-dev-doctor)
- [hardkas dev server](#hardkas-dev-server)

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
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas dev server

Start the local HardKas Dev Server stable

### Usage

```bash
hardkas dev server [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--port <number>` | Port to bind to | 7420 |
| `--host <string>` | Host to bind to | localhost |
| `--open` | Open dashboard in browser automatically | false |
| `--unsafe-external` | Allow external access (binds to 0.0.0.0 if host not specified) | false |
| `--json` | Output status as JSON | false |

### Arguments

No arguments.

---

## hardkas doctor

Perform a full system diagnostic and health report stable

### Usage

```bash
hardkas doctor [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results as stable JSON schema | false |

### Arguments

No arguments.

---

## hardkas example

Manage HardKAS examples

### Usage

```bash
hardkas example [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas example list](#hardkas-example-list)
- [hardkas example run](#hardkas-example-run)

---

## hardkas example list

List available HardKAS examples

### Usage

```bash
hardkas example list [options]
```

### Options

No options.

### Arguments

No arguments.

---

## hardkas example run

Run a HardKAS example

### Usage

```bash
hardkas example run [options] <id>
```

### Options

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `id` |  |

---

## hardkas faucet

Fund an account with KAS (Local only) stable

### Usage

```bash
hardkas faucet [options] <identifier>
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

## hardkas init

Initialize a new HardKAS project stable

### Usage

```bash
hardkas init [options] [name]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--force` | Overwrite existing hardkas.config.ts | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` | Project name or directory |

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

## hardkas l2

Layer 2 (Igra) management

### Usage

```bash
hardkas l2 [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas l2 balance](#hardkas-l2-balance)
- [hardkas l2 bridge](#hardkas-l2-bridge)
- [hardkas l2 contract](#hardkas-l2-contract)
- [hardkas l2 networks](#hardkas-l2-networks)
- [hardkas l2 nonce](#hardkas-l2-nonce)
- [hardkas l2 profile](#hardkas-l2-profile)
- [hardkas l2 rpc](#hardkas-l2-rpc)
- [hardkas l2 tx](#hardkas-l2-tx)

---

## hardkas l2 balance

Check Igra L2 balance

### Usage

```bash
hardkas l2 balance [options] <address>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | L2 network name |  |
| `--url <url>` | RPC URL override |  |
| `--chain-id <id>` | Chain ID override |  |
| `--json` | Output as JSON |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `address` |  |

---

## hardkas l2 bridge

Igra bridge awareness

### Usage

```bash
hardkas l2 bridge [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas l2 bridge assumptions](#hardkas-l2-bridge-assumptions)
- [hardkas l2 bridge status](#hardkas-l2-bridge-status)

---

## hardkas l2 bridge assumptions

Show bridge security assumptions

### Usage

```bash
hardkas l2 bridge assumptions [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON |  |

### Arguments

No arguments.

---

## hardkas l2 bridge status

Show bridge security status

### Usage

```bash
hardkas l2 bridge status [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | L2 network name |  |
| `--url <url>` | RPC URL override |  |
| `--json` | Output as JSON |  |

### Arguments

No arguments.

---

## hardkas l2 contract

Igra contract management

### Usage

```bash
hardkas l2 contract [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas l2 contract deploy-plan](#hardkas-l2-contract-deploy-plan)

---

## hardkas l2 contract deploy-plan

Build L2 contract deployment plan

### Usage

```bash
hardkas l2 contract deploy-plan [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | L2 network name |  |
| `--url <url>` | RPC URL override |  |
| `--chain-id <id>` | Chain ID override |  |
| `--bytecode <hex>` | Contract bytecode |  |
| `--constructor <sig>` | Constructor signature |  |
| `--args <csv>` | Constructor arguments |  |
| `--json` | Output as JSON |  |

### Arguments

No arguments.

---

## hardkas l2 networks

List available L2 network profiles

### Usage

```bash
hardkas l2 networks [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output results in JSON format |  |

### Arguments

No arguments.

---

## hardkas l2 nonce

Check Igra L2 nonce

### Usage

```bash
hardkas l2 nonce [options] <address>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | L2 network name |  |
| `--url <url>` | RPC URL override |  |
| `--chain-id <id>` | Chain ID override |  |
| `--json` | Output as JSON |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `address` |  |

---

## hardkas l2 profile

L2 profile management

### Usage

```bash
hardkas l2 profile [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas l2 profile show](#hardkas-l2-profile-show)
- [hardkas l2 profile validate](#hardkas-l2-profile-validate)

---

## hardkas l2 profile show

Show L2 profile details

### Usage

```bash
hardkas l2 profile show [options] [name]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | L2 network name |  |
| `--url <url>` | RPC URL override |  |
| `--chain-id <id>` | Chain ID override |  |
| `--json` | Output results in JSON format |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas l2 profile validate

Validate L2 profile

### Usage

```bash
hardkas l2 profile validate [options] [name]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | L2 network name |  |
| `--url <url>` | Override RPC URL for validation |  |
| `--json` | Output results in JSON format |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas l2 rpc

Igra RPC diagnostics

### Usage

```bash
hardkas l2 rpc [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas l2 rpc health](#hardkas-l2-rpc-health)

---

## hardkas l2 rpc health

Check L2 RPC health

### Usage

```bash
hardkas l2 rpc health [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | L2 network name |  |
| `--url <url>` | RPC URL override |  |
| `--json` | Output as JSON |  |

### Arguments

No arguments.

---

## hardkas l2 tx

Igra transaction management

### Usage

```bash
hardkas l2 tx [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas l2 tx build](#hardkas-l2-tx-build)
- [hardkas l2 tx receipt](#hardkas-l2-tx-receipt)
- [hardkas l2 tx send](#hardkas-l2-tx-send)
- [hardkas l2 tx sign](#hardkas-l2-tx-sign)
- [hardkas l2 tx status](#hardkas-l2-tx-status)

---

## hardkas l2 tx build

Build L2 transaction plan

### Usage

```bash
hardkas l2 tx build [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--network <name>` | L2 network name |  |
| `--url <url>` | RPC URL override |  |
| `--chain-id <id>` | Chain ID override |  |
| `--from <address>` | From address |  |
| `--to <address>` | To address |  |
| `--value <wei>` | Value in wei | 0 |
| `--data <hex>` | Call data | 0x |
| `--json` | Output as JSON |  |

### Arguments

No arguments.

---

## hardkas l2 tx receipt

Get L2 transaction receipt

### Usage

```bash
hardkas l2 tx receipt [options] <txHash>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `txHash` |  |

---

## hardkas l2 tx send

Send L2 transaction

### Usage

```bash
hardkas l2 tx send [options] <signedPath>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--yes` | Confirm submission |  |
| `--json` | Output as JSON |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `signedPath` |  |

---

## hardkas l2 tx sign

Sign L2 transaction plan

### Usage

```bash
hardkas l2 tx sign [options] <planPath>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--account <name>` | Account to sign with |  |
| `--json` | Output as JSON |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `planPath` |  |

---

## hardkas l2 tx status

Check L2 transaction status via RPC

### Usage

```bash
hardkas l2 tx status [options] <txHash>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `txHash` |  |

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

- [hardkas localnet fork](#hardkas-localnet-fork)

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
| `--at-daa-score <score>` | Fork at specific DAA score (default: latest) |  |
| `--output <path>` | Save fork snapshot to file |  |
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

## hardkas metamask

MetaMask onboarding and account export (local-dev only)

### Usage

```bash
hardkas metamask [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas metamask account](#hardkas-metamask-account)
- [hardkas metamask network](#hardkas-metamask-network)
- [hardkas metamask snippet](#hardkas-metamask-snippet)

---

## hardkas metamask account

Export a local EVM account for MetaMask import stable

### Usage

```bash
hardkas metamask account [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--show-private-key` | Reveal the private key (LOCAL DEV ONLY) | false |
| `--json` | Output as JSON | false |
| `--include-secret` | Include secret in JSON output (UNSAFE) | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas metamask network

Show local Igra network parameters for MetaMask stable

### Usage

```bash
hardkas metamask network [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--profile <name>` | L2 network profile name | igra |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas metamask snippet

Generate JS snippet to add local network to MetaMask stable

### Usage

```bash
hardkas metamask snippet [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--profile <name>` | L2 network profile name | igra |

### Arguments

No arguments.

---

## hardkas networks

List configured networks stable

### Usage

```bash
hardkas networks [options]
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--json` | Output as JSON | false |

### Arguments

No arguments.

---

## hardkas new

Create a new HardKAS project stable

### Usage

```bash
hardkas new [options] <name>
```

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--template <type>` | Project template | basic |
| `--network <name>` | Default network | simnet |
| `--accounts <n>` | Number of simulated accounts | 3 |
| `--skip-install` | Skip pnpm install | false |

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

### Arguments

No arguments.

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

- [hardkas replay verify](#hardkas-replay-verify)

---

## hardkas replay verify

Verify replay invariants for a directory of artifacts stable

### Usage

```bash
hardkas replay verify [options] <path>
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

No options.

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

### Arguments

| Argument | Description |
| :--- | :--- |
| `script` |  |

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

No options.

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

No options.

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

No options.

### Arguments

| Argument | Description |
| :--- | :--- |
| `name` |  |

---

## hardkas snapshot

Manage HardKAS localnet snapshots

### Usage

```bash
hardkas snapshot [options] [command]
```

### Options

No options.

### Arguments

No arguments.

### Subcommands

- [hardkas snapshot restore](#hardkas-snapshot-restore)
- [hardkas snapshot verify](#hardkas-snapshot-verify)

---

## hardkas snapshot restore

Restore localnet state from a snapshot preview

### Usage

```bash
hardkas snapshot restore [options] <idOrName>
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

## hardkas snapshot verify

Verify the integrity of a snapshot preview

### Usage

```bash
hardkas snapshot verify [options] <idOrName>
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
| `--json` | Output results as JSON | false |
| `--mass-report` | Show mass/fee report after test run | false |
| `--mass-snapshot <label>` | Save mass snapshot for regression detection |  |
| `--mass-compare <label>` | Compare against saved mass snapshot |  |

### Arguments

| Argument | Description |
| :--- | :--- |
| `files` |  |

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

- [hardkas tx plan](#hardkas-tx-plan)
- [hardkas tx profile](#hardkas-tx-profile)
- [hardkas tx receipt](#hardkas-tx-receipt)
- [hardkas tx send](#hardkas-tx-send)
- [hardkas tx sign](#hardkas-tx-sign)
- [hardkas tx trace](#hardkas-tx-trace)
- [hardkas tx verify](#hardkas-tx-verify)

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
| `--from <accountOrAddress>` | Sender account name or address |  |
| `--to <address>` | Recipient address |  |
| `--amount <kas>` | Amount in KAS |  |
| `--network <name>` | Kaspa network name | simnet |
| `--fee-rate <sompiPerMass>` | Fee rate in sompi per mass | 1 |
| `--url <url>` | RPC URL (optional override) |  |
| `--out <path>` | Save plan as artifact JSON |  |
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
| `--from <accountOrAddress>` | Sender (shortcut mode) |  |
| `--to <address>` | Recipient (shortcut mode) |  |
| `--amount <kas>` | Amount in KAS (shortcut mode) |  |
| `--network <name>` | Network name | simnet |
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
| `--allow-mainnet-signing` | Allow signing for mainnet | false |
| `--wait-lock` | Wait for workspace lock if held | false |
| `--lock-timeout <ms>` | Lock wait timeout in ms | 30000 |
| `--json` | Output as JSON | false |

### Arguments

| Argument | Description |
| :--- | :--- |
| `planPath` |  |

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

## hardkas up

Boot or validate the HardKAS developer runtime environment stable

### Usage

```bash
hardkas up [options]
```

### Options

No options.

### Arguments

No arguments.

