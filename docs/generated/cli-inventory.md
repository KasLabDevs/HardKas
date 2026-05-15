# CLI Command Inventory

| Command | Description | Aliases | Options |
|:---|:---|:---|:---|
| `hardkas init` | Initialize a new HardKAS project stable | - | `--force` |
| `hardkas up` | Boot or validate the HardKAS developer runtime environment stable | - | - |
| `hardkas tx profile` | Show detailed mass and fee breakdown for a transaction plan stable | - | `--json` |
| `hardkas tx plan` | Build a transaction plan artifact stable | - | `--from <accountOrAddress>`<br>`--to <address>`<br>`--amount <kas>`<br>`--network <name>`<br>`--fee-rate <sompiPerMass>`<br>`--url <url>`<br>`--out <path>`<br>`--wait-lock`<br>`--lock-timeout <ms>`<br>`--json` |
| `hardkas tx sign` | Sign a transaction plan artifact stable | - | `--account <name>`<br>`--out <path>`<br>`--allow-mainnet-signing`<br>`--wait-lock`<br>`--lock-timeout <ms>`<br>`--json` |
| `hardkas tx send` | Broadcast a signed transaction or send directly stable | - | `--from <accountOrAddress>`<br>`--to <address>`<br>`--amount <kas>`<br>`--network <name>`<br>`--url <url>`<br>`--yes`<br>`--wait-lock`<br>`--lock-timeout <ms>`<br>`--json`<br>`--track <label>` |
| `hardkas tx receipt` | Show transaction receipt stable | - | `--json` |
| `hardkas tx verify` | Perform deep semantic verification of a transaction plan preview | - | `--json` |
| `hardkas tx trace` | Reconstruct the full operational trace of a transaction research | - | - |
| `hardkas artifact verify` | Verify an artifact's integrity and schema stable | - | `--json`<br>`--recursive`<br>`--strict` |
| `hardkas artifact explain` | Provide a human-readable operational summary of an artifact stable | - | `--json` |
| `hardkas artifact lineage` | Show the provenance and operational history of an artifact stable | - | `--json` |
| `hardkas replay verify` | Verify replay invariants for a directory of artifacts stable | - | `--json` |
| `hardkas snapshot verify` | Verify the integrity of a snapshot preview | - | `--json` |
| `hardkas snapshot restore` | Restore localnet state from a snapshot preview | - | `--json` |
| `hardkas rpc info` | Show RPC connection info | - | - |
| `hardkas rpc health` | Check RPC health | - | - |
| `hardkas rpc doctor` | Run comprehensive RPC diagnostics | - | `--endpoints <urls...>` |
| `hardkas rpc dag` | Show DAG information from node | - | - |
| `hardkas rpc utxos` | Show UTXOs for an address from node | - | - |
| `hardkas rpc mempool` | Show mempool status from node | - | - |
| `hardkas dag status` | View current DAG status | - | - |
| `hardkas dag simulate-reorg` | Simulate a DAG reorg | - | `--depth <n>` |
| `hardkas accounts list` | List available HardKAS accounts stable | - | `--config <path>`<br>`--json` |
| `hardkas accounts real init` | Initialize real dev account store stable | - | `--force`<br>`--wait-lock`<br>`--lock-timeout <ms>`<br>`--json` |
| `hardkas accounts real import` | Import an account into the persistent store stable | - | `--name <name>`<br>`--address <address>`<br>`--private-key <hex>`<br>`--private-key-stdin`<br>`--private-key-env <env>`<br>`--password-stdin`<br>`--password-env <env>`<br>`--unsafe-plaintext`<br>`--yes`<br>`--wait-lock`<br>`--lock-timeout <ms>`<br>`--json` |
| `hardkas accounts real session-open` | Verify keystore access and record signing intent internal | unlock | `--password-stdin`<br>`--password-env <env>`<br>`--wait-lock`<br>`--lock-timeout <ms>` |
| `hardkas accounts real session-close` | Clear the local dev signing session marker internal | lock | - |
| `hardkas accounts real change-password` | Change password for an encrypted account stable | - | `--wait-lock`<br>`--lock-timeout <ms>` |
| `hardkas accounts real generate` | Generate new real dev account(s) using Kaspa SDK stable | - | `--name <name>`<br>`--count <number>`<br>`--network <network>`<br>`--password-stdin`<br>`--password-env <env>`<br>`--unsafe-plaintext`<br>`--yes`<br>`--wait-lock`<br>`--lock-timeout <ms>`<br>`--json` |
| `hardkas accounts balance` | Show account balance stable | - | `--network <name>`<br>`--url <rpc-url>`<br>`--json` |
| `hardkas accounts fund` | Fund an account (Faucet) | - | `--amount <kas>` |
| `hardkas l2 networks` | List available L2 network profiles | - | `--json` |
| `hardkas l2 profile show` | Show L2 profile details | - | `--network <name>`<br>`--url <url>`<br>`--chain-id <id>`<br>`--json` |
| `hardkas l2 profile validate` | Validate L2 profile | - | `--network <name>`<br>`--url <url>`<br>`--json` |
| `hardkas l2 tx build` | Build L2 transaction plan | - | `--network <name>`<br>`--url <url>`<br>`--chain-id <id>`<br>`--from <address>`<br>`--to <address>`<br>`--value <wei>`<br>`--data <hex>`<br>`--json` |
| `hardkas l2 tx sign` | Sign L2 transaction plan | - | `--account <name>`<br>`--json` |
| `hardkas l2 tx send` | Send L2 transaction | - | `--yes`<br>`--json` |
| `hardkas l2 tx receipt` | Get L2 transaction receipt | - | `--json` |
| `hardkas l2 tx status` | Check L2 transaction status via RPC | - | `--json` |
| `hardkas l2 contract deploy-plan` | Build L2 contract deployment plan | - | `--network <name>`<br>`--url <url>`<br>`--chain-id <id>`<br>`--bytecode <hex>`<br>`--constructor <sig>`<br>`--args <csv>`<br>`--json` |
| `hardkas l2 bridge status` | Show bridge security status | - | `--network <name>`<br>`--url <url>`<br>`--json` |
| `hardkas l2 bridge assumptions` | Show bridge security assumptions | - | `--json` |
| `hardkas l2 rpc health` | Check L2 RPC health | - | `--network <name>`<br>`--url <url>`<br>`--json` |
| `hardkas l2 balance` | Check Igra L2 balance | - | `--network <name>`<br>`--url <url>`<br>`--chain-id <id>`<br>`--json` |
| `hardkas l2 nonce` | Check Igra L2 nonce | - | `--network <name>`<br>`--url <url>`<br>`--chain-id <id>`<br>`--json` |
| `hardkas node start` | Start local node stable | - | `--image <image>`<br>`--allow-floating-image`<br>`--wait-lock`<br>`--lock-timeout <ms>` |
| `hardkas node stop` | Stop local node stable | - | `--wait-lock`<br>`--lock-timeout <ms>` |
| `hardkas node restart` | Restart local node stable | - | `--wait-lock`<br>`--lock-timeout <ms>` |
| `hardkas node reset` | Stop node and remove all local chain data preview | - | `--start`<br>`--yes`<br>`--wait-lock`<br>`--lock-timeout <ms>` |
| `hardkas node status` | Check node status | - | `--json` |
| `hardkas node logs` | View node logs preview | - | `--tail <n>`<br>`--follow` |
| `hardkas config show` | Show the current HardKAS configuration | - | `--config <path>`<br>`--json` |
| `hardkas example list` | List available HardKAS examples | - | - |
| `hardkas example run` | Run a HardKAS example | - | - |
| `hardkas dev` | Start development environment | - | `--mode <mode>` |
| `hardkas query artifacts list` | List artifacts matching filters | - | `--schema <schema>`<br>`--network <network>`<br>`--mode <mode>`<br>`--from <address>`<br>`--to <address>`<br>`--sort <field:dir>`<br>`--limit <n>`<br>`--json`<br>`--explain [level]` |
| `hardkas query artifacts inspect` | Deep structural analysis of an artifact (path or contentHash) | - | `--json`<br>`--explain [level]` |
| `hardkas query artifacts diff` | Semantic diff between two artifacts | - | `--json` |
| `hardkas query store doctor` | Integrity and freshness check of the query store index | - | `--migrate`<br>`--wait-lock`<br>`--lock-timeout <ms>` |
| `hardkas query store migrate` | Apply pending schema migrations to the query store | - | `--wait-lock`<br>`--lock-timeout <ms>` |
| `hardkas query store sync` | Synchronize the filesystem artifacts with the query store index | index | `--strict`<br>`--wait-lock`<br>`--lock-timeout <ms>`<br>`--json` |
| `hardkas query store rebuild` | Force a complete rebuild of the query store index | - | `--strict`<br>`--wait-lock`<br>`--lock-timeout <ms>`<br>`--json` |
| `hardkas query store sql` | Run a raw SQL query against the query store | - | `--json` |
| `hardkas query store export` | Export logical store state to JSON | - | `--output <path>` |
| `hardkas query lineage chain` | Reconstruct lineage chain from an artifact (contentHash or artifactId) | - | `--direction <dir>`<br>`--json`<br>`--explain [level]`<br>`--why` |
| `hardkas query lineage transitions` | List all lineage transitions | - | `--root <hash>`<br>`--json`<br>`--explain [level]`<br>`--why` |
| `hardkas query lineage orphans` | Find artifacts with broken lineage references | - | `--json`<br>`--explain [level]` |
| `hardkas query replay list` | List all stored receipts | - | `--status <status>`<br>`--json`<br>`--limit <n>` |
| `hardkas query replay summary` | Detailed receipt + trace summary for a transaction | - | `--json` |
| `hardkas query replay divergences` | Detect receipts with replay divergence indicators | - | `--json`<br>`--explain [level]` |
| `hardkas query replay invariants` | Check replay invariants for a specific transaction | - | `--json`<br>`--explain [level]` |
| `hardkas query dag conflicts` | Show double-spend conflict analysis | - | `--json`<br>`--explain [level]`<br>`--why` |
| `hardkas query dag displaced` | Show displaced transactions | - | `--json`<br>`--explain [level]` |
| `hardkas query dag history` | Full lifecycle of a transaction through the DAG | - | `--json`<br>`--explain [level]`<br>`--why` |
| `hardkas query dag sink-path` | Show current selected path from genesis to sink | - | `--json` |
| `hardkas query dag anomalies` | Find transactions or blocks in unexpected states | - | `--json`<br>`--explain [level]` |
| `hardkas query events` | Query event log | - | `--tx <txId>`<br>`--domain <domain>`<br>`--kind <kind>`<br>`--workflow <workflowId>`<br>`--limit <n>`<br>`--json`<br>`--explain [level]` |
| `hardkas query tx` | Aggregate all data for a transaction stable | - | `--json`<br>`--explain [level]` |
| `hardkas test` | Run HardKAS tests against localnet stable | - | `--network <network>`<br>`--watch`<br>`--json`<br>`--mass-report`<br>`--mass-snapshot <label>`<br>`--mass-compare <label>` |
| `hardkas doctor` | Perform a full system diagnostic and health report | - | `--json` |
| `hardkas faucet` | Fund an account with KAS (Local only) stable | - | `--amount <kas>` |
| `hardkas run` | Execute a TypeScript or JavaScript file with HardKAS SDK injected | - | `--network <name>`<br>`--accounts <n>`<br>`--balance <sompi>`<br>`--no-harness` |
| `hardkas lock list` | List all active workspace locks | - | `--json` |
| `hardkas lock status` | Show status of one or all locks | - | - |
| `hardkas lock doctor` | Analyze locks and identify stale or corrupted ones | - | - |
| `hardkas lock clear` | Safely or forcibly clear a lock | - | `--if-dead`<br>`--force`<br>`--yes` |
| `hardkas capabilities` | Show HardKAS capabilities and maturity level | - | `--json` |
| `hardkas new` | Create a new HardKAS project | - | `--template <type>`<br>`--network <name>`<br>`--accounts <n>`<br>`--skip-install` |
| `hardkas console` | Open an interactive REPL with HardKAS SDK pre-loaded | - | `--network <name>`<br>`--accounts <n>`<br>`--balance <sompi>` |
| `hardkas networks` | List configured networks | - | `--json` |
| `hardkas localnet fork` | Fork state from a real Kaspa network for local simulation preview | - | `--network <name>`<br>`--addresses <addrs...>`<br>`--at-daa-score <score>`<br>`--output <path>`<br>`--json` |
| `hardkas deploy track` | Create a deployment record for a transaction stable | - | `--network <name>`<br>`--tx-id <txId>`<br>`--plan <artifactId>`<br>`--receipt <artifactId>`<br>`--status <status>`<br>`--notes <text>`<br>`--json` |
| `hardkas deploy list` | List all tracked deployments stable | - | `--network <name>`<br>`--status <status>`<br>`--json` |
| `hardkas deploy inspect` | Show full details of a deployment stable | - | `--network <name>`<br>`--json` |
| `hardkas deploy status` | Check deployment status (query RPC if available) stable | - | `--network <name>`<br>`--verify`<br>`--json` |
| `hardkas deploy history` | Show deployment history across all networks stable | - | `--json` |
