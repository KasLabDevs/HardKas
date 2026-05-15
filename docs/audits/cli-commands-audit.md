# HardKas CLI Commands Audit

## 1. Executive Summary
This audit details all the commands registered in the HardKas CLI (`packages/cli/src/commands/*`). 11 command definition files (including redirections in `misc.ts`) have been analyzed to validate the existence of real handlers and the use of internal packages.

**Quick Stats:**
- **Total Commands Found**: 69
- **VERIFIED Status**: 54
- **PARTIAL Status**: 14 (Mainly in the L2/Igra module)
- **DISABLED Status**: 1 (`tx trace`)
- **PLACEHOLDER Status**: 0 (Mocks detected in previous phases have been replaced by real logic).

## 2. CLI Command Table

| Group | Full Command | Positional Args | Flags / options | Runner / handler | Internal package used | Status | Source file | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| init | `hardkas init` | `[name]` | `--force` | inline action | `@hardkas/sdk` | **VERIFIED** | `init.ts` | Creates config and package.json |
| init | `hardkas up` | — | — | `runUp` | — | **VERIFIED** | `init.ts` | Validates runtime env |
| tx | `hardkas tx profile` | `<path>` | — | `runTxProfile` | — | **VERIFIED** | `tx.ts` | Mass/fee breakdown & snapshots [UPDATED] |
| tx | `hardkas tx plan` | — | `--from, --to, --amount, --network, --fee-rate, --url, --out, --json` | inline / `runTxPlan` | `@hardkas/config`, `@hardkas/artifacts` | **VERIFIED** | `tx.ts` | Constructs plan artifact |
| tx | `hardkas tx sign` | `<planPath>` | `--account, --out, --allow-mainnet-signing, --json` | inline / `runTxSign` | `@hardkas/artifacts`, `@hardkas/config` | **VERIFIED** | `tx.ts` | Signs plan artifact |
| tx | `hardkas tx send` | `[signedPath]` | `--from, --to, --amount, --network, --url, --yes, --json` | inline / `runTxSend` | `@hardkas/config`, `@hardkas/artifacts` | **VERIFIED** | `tx.ts` | Broadcast or shortcut flow |
| tx | `hardkas tx receipt` | `<txId>` | `--json` | inline / `runTxReceipt` | — | **VERIFIED** | `tx.ts` | Shows receipt |
| tx | `hardkas tx verify` | `<path>` | `--json` | inline / `runTxVerify` | — | **VERIFIED** | `tx.ts` | Deep verification |
| tx | `hardkas tx trace` | `<txId>` | — | inline action | — | **DISABLED** | `tx.ts` | "Temporarily disabled" |
| accounts | `hardkas accounts list` | — | `--config, --json` | inline action | `@hardkas/config`, `@hardkas/accounts` | **VERIFIED** | `accounts.ts` | Lists loaded accounts |
| accounts | `hardkas accounts real init` | — | `--force, --json` | inline / `runAccountsRealInit` | — | **VERIFIED** | `accounts.ts` | Starts local keystore |
| accounts | `hardkas accounts real import` | — | `--name, --address, --private-key, --encrypted, --json` | inline / `runAccountsKeystoreImport` | — | **VERIFIED** | `accounts.ts` | Imports to keystore |
| accounts | `hardkas accounts real unlock` | `<name>` | — | inline / `runAccountsKeystoreUnlock` | — | **VERIFIED** | `accounts.ts` | Verifies password |
| accounts | `hardkas accounts real lock` | `<name>` | — | inline action | — | **VERIFIED** | `accounts.ts` | Clears session (UX theater) |
| accounts | `hardkas accounts real change-password` | `<name>` | — | inline / `runAccountsKeystoreChangePassword` | — | **VERIFIED** | `accounts.ts` | Changes keystore pwd |
| accounts | `hardkas accounts real generate` | — | `--name, --count, --network, --json` | inline / `runAccountsRealGenerate` | — | **VERIFIED** | `accounts.ts` | Generates new keys |
| accounts | `hardkas accounts balance` | `<identifier>` | `--network, --url, --json` | inline / `runAccountsBalance` | — | **VERIFIED** | `accounts.ts` | Real balance via RPC |
| accounts | `hardkas accounts fund` | `<identifier>` | `--amount` | inline / `runAccountsFund` | — | **VERIFIED** | `accounts.ts` | Faucet alias |
| rpc | `hardkas rpc info` | — | — | `runRpcInfo` | — | **VERIFIED** | `rpc.ts` | RPC connection info |
| rpc | `hardkas rpc health` | — | — | `runRpcHealth` | — | **VERIFIED** | `rpc.ts` | RPC health check |
| rpc | `hardkas rpc doctor` | — | `--endpoints` | `runRpcDoctor` | — | **VERIFIED** | `rpc.ts` | Full RPC diagnosis |
| rpc | `hardkas rpc dag` | — | — | `runRpcDag` | — | **VERIFIED** | `rpc.ts` | Network DAG info |
| rpc | `hardkas rpc utxos` | `<address>` | — | `runRpcUtxos` | — | **VERIFIED** | `rpc.ts` | Network UTXOs |
| rpc | `hardkas rpc mempool` | `[txId]` | — | `runRpcMempool` | — | **VERIFIED** | `rpc.ts` | Network mempool |
| dag | `hardkas dag status` | — | — | `runDagStatus` | — | **VERIFIED** | `dag.ts` | GHOSTDAG approximation [UPDATED] |
| dag | `hardkas dag simulate-reorg` | — | `--depth` | `runDagSimulateReorg` | — | **VERIFIED** | `dag.ts` | GHOSTDAG approximation [UPDATED] |
| artifact | `hardkas artifact verify` | `<path>` | `--json, --recursive, --strict` | `runArtifactVerify` | — | **VERIFIED** | `artifact.ts` | Integrity/Schema |
| artifact | `hardkas artifact explain` | `<path>` | — | `runArtifactExplain` | — | **VERIFIED** | `artifact.ts` | Readable summary |
| artifact | `hardkas artifact lineage` | `<path>` | — | `runArtifactLineage` | — | **VERIFIED** | `artifact.ts` | Operational history |
| query | `hardkas query store doctor` | — | — | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | SQLite index health |
| query | `hardkas query store rebuild` | — | — | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Rebuilds SQLite index |
| query | `hardkas query artifacts list` | — | `--schema, --network, --mode, --from, --to, --sort, --limit, --json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Filters artifacts |
| query | `hardkas query artifacts inspect` | `<target>` | `--json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Deep artifact analysis |
| query | `hardkas query artifacts diff` | `<left> <right>` | `--json` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Semantic diff |
| query | `hardkas query lineage chain` | `<anchor>` | `--direction, --json, --explain, --why` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Lineage navigation |
| query | `hardkas query lineage transitions` | — | `--root, --json, --explain, --why` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | All transitions |
| query | `hardkas query lineage orphans` | — | `--json, --explain` | inline action | `@hardkas/query" | **VERIFIED** | `query.ts` | Artifacts without parent |
| query | `hardkas query replay list` | — | `--status, --json, --limit` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Receipt history |
| query | `hardkas query replay summary` | `<txId>` | `--json` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Receipt+trace summary |
| query | `hardkas query replay divergences` | — | `--json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Detects state deviations |
| query | `hardkas query replay invariants` | `<txId>` | `--json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Tx rules check |
| query | `hardkas query dag conflicts` | — | `--json, --explain, --why` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Double-spend analysis |
| query | `hardkas query dag displaced` | — | `--json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Displaced txs in simulator |
| query | `hardkas query dag history` | `<txId>` | `--json, --explain, --why` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Life cycle in DAG |
| query | `hardkas query dag sink-path` | — | `--json` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Genesis-sink blue path |
| query | `hardkas query dag anomalies` | — | `--json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Unexpected states |
| query | `hardkas query events` | — | `--tx, --domain, --kind, --workflow, --limit, --json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Search in logs |
| query | `hardkas query tx` | `<txId>` | `--json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Total causal aggregation |
| node | `hardkas node start` | — | `--image` | `runNodeStart` | — | **VERIFIED** | `node.ts` | Docker start |
| node | `hardkas node stop` | — | — | `runNodeStop" | — | **VERIFIED** | `node.ts` | Docker stop |
| node | `hardkas node restart` | — | — | `runNodeRestart` | — | **VERIFIED** | `node.ts` | Docker restart |
| node | `hardkas node reset` | — | `--start, --yes` | `runNodeReset` | — | **VERIFIED** | `node.ts` | Clears chain data |
| node | `hardkas node status` | — | — | `runNodeStatus` | — | **VERIFIED** | `node.ts` | Docker container check |
| node | `hardkas node logs` | — | `--tail, --follow` | `runNodeLogs` | — | **VERIFIED** | `node.ts` | Docker logs |
| l2 | `hardkas l2 networks` | — | `--json` | `runL2Networks` | — | **PARTIAL** | `l2.ts` | Research module (igra) |
| l2 | `hardkas l2 profile show` | `<name>` | `--json` | `runL2ProfileShow` | — | **PARTIAL** | `l2.ts` | Igra profile info |
| l2 | `hardkas l2 profile validate`| `<name>` | `--json` | `runL2ProfileValidate` | — | **PARTIAL** | `l2.ts` | Igra profile validation |
| l2 | `hardkas l2 tx build` | — | `--network, --url, --from, --to, --value, --data, --json` | `runL2TxBuild` | — | **PARTIAL** | `l2.ts` | Igra tx plan |
| l2 | `hardkas l2 tx sign` | `<planPath>` | `--account, --json` | `runL2TxSign` | — | **PARTIAL** | `l2.ts` | Igra signing |
| l2 | `hardkas l2 tx send` | `<signedPath>` | `--yes, --json` | `runL2TxSend` | — | **PARTIAL** | `l2.ts` | Igra broadcast |
| l2 | `hardkas l2 tx receipt` | `<txHash>` | `--json` | `runL2TxReceipt` | — | **PARTIAL** | `l2.ts" | Igra receipt |
| l2 | `hardkas l2 tx status` | `<txHash>` | `--json` | `runL2TxStatus` | — | **PARTIAL** | `l2.ts` | Igra status |
| l2 | `hardkas l2 contract deploy-plan` | — | `--network, --bytecode, --constructor, --args, --json` | `runL2ContractDeployPlan` | — | **PARTIAL** | `l2.ts` | Igra contract deployment |
| l2 | `hardkas l2 bridge status` | — | `--json` | `runL2BridgeStatus` | — | **PARTIAL** | `l2.ts` | Bridge security state |
| l2 | `hardkas l2 bridge assumptions` | — | `--json` | `runL2BridgeAssumptions` | — | **PARTIAL** | `l2.ts` | Trust assumptions |
| l2 | `hardkas l2 rpc health` | — | `--json` | `runL2RpcHealth` | — | **PARTIAL** | `l2.ts` | Igra RPC health |
| l2 | `hardkas l2 balance` | `<address>` | `--json` | `runL2Balance` | — | **PARTIAL** | `l2.ts` | Igra balance |
| l2 | `hardkas l2 nonce` | `<address>` | `--json` | `runL2Nonce` | — | **PARTIAL** | `l2.ts` | Igra nonce |
| test | `hardkas test` | `[files...]` | `--network, --watch, --json, --reporter` | `runTest` | `@hardkas/sdk` | **VERIFIED** | `test.ts` | Vitest programmatic runner |
| example | `hardkas example list` | — | — | `runExampleList` | — | **VERIFIED** | `misc.ts` | Lists examples (registry.json) |
| example | `hardkas example run` | `<id>` | — | `runExampleRun` | — | **VERIFIED** | `misc.ts` | Executes example |
| run | `hardkas run` | `<script>` | `--network, --accounts, --balance, --no-harness` | `runScript` | `@hardkas/testing` | **VERIFIED** | `run.ts` | Executes TS scripts with SDK [NEW] |

## 3. Commands NOT found
The following commands do not exist as definition files in `packages/cli/src/commands/` but some are integrated into other files or are simply aspirational/documentary:

- `example.ts`: **Does not exist as a file**. `example` commands are integrated into `misc.ts`.
- `hardkas node stop`: **Found**. Registered in `node.ts`.
- `hardkas node restart`: **Found**. Registered in `node.ts`.
- `hardkas node logs`: **Found**. Registered in `node.ts`.
- `hardkas node reset`: **Found**. Registered in `node.ts`.
- `hardkas accounts balance`: **Found**. Registered in `accounts.ts`.
- `hardkas accounts fund`: **Found**. Registered in `accounts.ts`.

## 4. Checklist

- [x] Review `init.ts`
- [x] Review `tx.ts`
- [x] Review `accounts.ts`
- [x] Review `rpc.ts`
- [x] Review `dag.ts`
- [x] Review `artifact.ts`
- [x] Review `query.ts`
- [x] Review `node.ts`
- [x] Review `l2.ts`
- [x] Review `test.ts`
- [ ] Review `example.ts` — file not found (commands moved to `misc.ts`)
- [x] Export markdown table
- [x] Remove non-existent commands

## 5. Guardrails

- Runtime logic was not modified.
- Runners were not modified.
- Internal packages were not modified.
- No commands were added.
- No commands were removed.
- The audit is based only on `packages/cli/src/commands/*`.
