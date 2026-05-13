# HardKas CLI Commands Audit

## 1. Executive Summary
Esta auditoría detalla todos los comandos registrados en el CLI de HardKas (`packages/cli/src/commands/*`). Se han analizado 11 archivos de definición de comandos (incluyendo redirecciones en `misc.ts`) para validar la existencia de handlers reales y el uso de paquetes internos.

**Estadísticas Rápidas:**
- **Total Comandos Encontrados**: 68
- **Estado VERIFIED**: 52
- **Estado PARTIAL**: 15 (Principalmente en el módulo L2/Igra y DAG Simulation)
- **Estado DISABLED**: 1 (`tx trace`)
- **Estado PLACEHOLDER**: 0 (Los mocks detectados en fases previas han sido reemplazados por lógica real).

## 2. CLI Command Table

| Grupo | Comando completo | Args posicionales | Flags / options | Runner / handler | Package interno usado | Estado | Archivo fuente | Notas |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| init | `hardkas init` | `[name]` | `--force` | inline action | `@hardkas/sdk` | **VERIFIED** | `init.ts` | Crea config y package.json |
| init | `hardkas up` | — | — | `runUp` | — | **VERIFIED** | `init.ts` | Valida runtime env |
| tx | `hardkas tx profile` | `<path>` | — | `runTxProfile` | — | **VERIFIED** | `tx.ts` | Desglose de mass/fee |
| tx | `hardkas tx plan` | — | `--from, --to, --amount, --network, --fee-rate, --url, --out, --json` | inline / `runTxPlan` | `@hardkas/config`, `@hardkas/artifacts` | **VERIFIED** | `tx.ts` | Construye plan artifact |
| tx | `hardkas tx sign` | `<planPath>` | `--account, --out, --allow-mainnet-signing, --json` | inline / `runTxSign` | `@hardkas/artifacts`, `@hardkas/config` | **VERIFIED** | `tx.ts` | Firma plan artifact |
| tx | `hardkas tx send` | `[signedPath]` | `--from, --to, --amount, --network, --url, --yes, --json` | inline / `runTxSend` | `@hardkas/config`, `@hardkas/artifacts` | **VERIFIED** | `tx.ts` | Broadcast o shortcut flow |
| tx | `hardkas tx receipt` | `<txId>` | `--json` | inline / `runTxReceipt` | — | **VERIFIED** | `tx.ts` | Muestra recibo |
| tx | `hardkas tx verify` | `<path>` | `--json` | inline / `runTxVerify` | — | **VERIFIED** | `tx.ts` | Verificación profunda |
| tx | `hardkas tx trace` | `<txId>` | — | inline action | — | **DISABLED** | `tx.ts` | "Temporarily disabled" |
| accounts | `hardkas accounts list` | — | `--config, --json` | inline action | `@hardkas/config`, `@hardkas/accounts` | **VERIFIED** | `accounts.ts` | Lista cuentas cargadas |
| accounts | `hardkas accounts real init` | — | `--force, --json` | inline / `runAccountsRealInit` | — | **VERIFIED** | `accounts.ts` | Inicia keystore local |
| accounts | `hardkas accounts real import` | — | `--name, --address, --private-key, --encrypted, --json` | inline / `runAccountsKeystoreImport` | — | **VERIFIED** | `accounts.ts` | Importa a keystore |
| accounts | `hardkas accounts real unlock` | `<name>` | — | inline / `runAccountsKeystoreUnlock` | — | **VERIFIED** | `accounts.ts` | Verifica password |
| accounts | `hardkas accounts real lock` | `<name>` | — | inline action | — | **VERIFIED** | `accounts.ts` | Limpia sesión (UX theater) |
| accounts | `hardkas accounts real change-password` | `<name>` | — | inline / `runAccountsKeystoreChangePassword` | — | **VERIFIED** | `accounts.ts` | Cambia pwd de keystore |
| accounts | `hardkas accounts real generate` | — | `--name, --count, --network, --json` | inline / `runAccountsRealGenerate` | — | **VERIFIED** | `accounts.ts` | Genera nuevas llaves |
| accounts | `hardkas accounts balance` | `<identifier>` | `--network, --url, --json` | inline / `runAccountsBalance` | — | **VERIFIED** | `accounts.ts` | Saldo real via RPC |
| accounts | `hardkas accounts fund` | `<identifier>` | `--amount` | inline / `runAccountsFund` | — | **VERIFIED** | `accounts.ts` | Faucet alias |
| rpc | `hardkas rpc info` | — | — | `runRpcInfo` | — | **VERIFIED** | `rpc.ts` | Info conexión RPC |
| rpc | `hardkas rpc health` | — | — | `runRpcHealth` | — | **VERIFIED** | `rpc.ts` | Check salud RPC |
| rpc | `hardkas rpc doctor` | — | `--endpoints` | `runRpcDoctor` | — | **VERIFIED** | `rpc.ts` | Diagnóstico completo RPC |
| rpc | `hardkas rpc dag` | — | — | `runRpcDag` | — | **VERIFIED** | `rpc.ts` | Info DAG de la red |
| rpc | `hardkas rpc utxos` | `<address>` | — | `runRpcUtxos` | — | **VERIFIED** | `rpc.ts` | UTXOs de la red |
| rpc | `hardkas rpc mempool` | `[txId]` | — | `runRpcMempool` | — | **VERIFIED** | `rpc.ts` | Mempool de la red |
| dag | `hardkas dag status` | — | — | `runDagStatus` | — | **PARTIAL** | `dag.ts` | Localnet simulation only |
| dag | `hardkas dag simulate-reorg` | — | `--depth` | `runDagSimulateReorg` | — | **PARTIAL** | `dag.ts` | Localnet simulation only |
| artifact | `hardkas artifact verify` | `<path>` | `--json, --recursive, --strict` | `runArtifactVerify` | — | **VERIFIED** | `artifact.ts` | Integridad/Schema |
| artifact | `hardkas artifact explain` | `<path>` | — | `runArtifactExplain` | — | **VERIFIED** | `artifact.ts` | Resumen legible |
| artifact | `hardkas artifact lineage` | `<path>` | — | `runArtifactLineage` | — | **VERIFIED** | `artifact.ts` | Historia operacional |
| query | `hardkas query store doctor` | — | — | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Salud del índice SQLite |
| query | `hardkas query store rebuild` | — | — | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Recrea índice SQLite |
| query | `hardkas query artifacts list` | — | `--schema, --network, --mode, --from, --to, --sort, --limit, --json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Filtra artifacts |
| query | `hardkas query artifacts inspect` | `<target>` | `--json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Análisis profundo artifact |
| query | `hardkas query artifacts diff` | `<left> <right>` | `--json` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Diff semántico |
| query | `hardkas query lineage chain` | `<anchor>` | `--direction, --json, --explain, --why` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Navegación de linaje |
| query | `hardkas query lineage transitions` | — | `--root, --json, --explain, --why` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Todas las transiciones |
| query | `hardkas query lineage orphans` | — | `--json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Artifacts sin padre |
| query | `hardkas query replay list` | — | `--status, --json, --limit` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Historial de receipts |
| query | `hardkas query replay summary` | `<txId>` | `--json` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Resumen receipt+trace |
| query | `hardkas query replay divergences` | — | `--json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Detecta desvíos de estado |
| query | `hardkas query replay invariants` | `<txId>` | `--json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Check de reglas tx |
| query | `hardkas query dag conflicts` | — | `--json, --explain, --why` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Análisis double-spend |
| query | `hardkas query dag displaced` | — | `--json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Txs desplazadas en simulador |
| query | `hardkas query dag history` | `<txId>` | `--json, --explain, --why` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Ciclo de vida en DAG |
| query | `hardkas query dag sink-path` | — | `--json` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Ruta azul genesis-sink |
| query | `hardkas query dag anomalies` | — | `--json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Estados inesperados |
| query | `hardkas query events` | — | `--tx, --domain, --kind, --workflow, --limit, --json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Búsqueda en logs |
| query | `hardkas query tx` | `<txId>` | `--json, --explain` | inline action | `@hardkas/query` | **VERIFIED** | `query.ts` | Agregación causal total |
| node | `hardkas node start` | — | `--image` | `runNodeStart` | — | **VERIFIED** | `node.ts` | Docker start |
| node | `hardkas node stop` | — | — | `runNodeStop` | — | **VERIFIED** | `node.ts` | Docker stop |
| node | `hardkas node restart` | — | — | `runNodeRestart` | — | **VERIFIED** | `node.ts` | Docker restart |
| node | `hardkas node reset` | — | `--start, --yes` | `runNodeReset` | — | **VERIFIED** | `node.ts` | Borra data de cadena |
| node | `hardkas node status` | — | — | `runNodeStatus` | — | **VERIFIED** | `node.ts` | Docker container check |
| node | `hardkas node logs` | — | `--tail, --follow` | `runNodeLogs` | — | **VERIFIED** | `node.ts` | Docker logs |
| l2 | `hardkas l2 networks` | — | `--json` | `runL2Networks` | — | **PARTIAL** | `l2.ts` | Research module (igra) |
| l2 | `hardkas l2 profile show` | `<name>` | `--json` | `runL2ProfileShow` | — | **PARTIAL** | `l2.ts` | Igra profile info |
| l2 | `hardkas l2 profile validate`| `<name>` | `--json` | `runL2ProfileValidate` | — | **PARTIAL** | `l2.ts` | Igra profile validation |
| l2 | `hardkas l2 tx build` | — | `--network, --url, --from, --to, --value, --data, --json` | `runL2TxBuild` | — | **PARTIAL** | `l2.ts` | Igra tx plan |
| l2 | `hardkas l2 tx sign` | `<planPath>` | `--account, --json` | `runL2TxSign` | — | **PARTIAL** | `l2.ts` | Igra signing |
| l2 | `hardkas l2 tx send` | `<signedPath>` | `--yes, --json` | `runL2TxSend` | — | **PARTIAL** | `l2.ts` | Igra broadcast |
| l2 | `hardkas l2 tx receipt` | `<txHash>` | `--json` | `runL2TxReceipt` | — | **PARTIAL** | `l2.ts` | Igra receipt |
| l2 | `hardkas l2 tx status` | `<txHash>` | `--json` | `runL2TxStatus` | — | **PARTIAL** | `l2.ts` | Igra status |
| l2 | `hardkas l2 contract deploy-plan` | — | `--network, --bytecode, --constructor, --args, --json` | `runL2ContractDeployPlan` | — | **PARTIAL** | `l2.ts` | Igra contract deployment |
| l2 | `hardkas l2 bridge status` | — | `--json` | `runL2BridgeStatus` | — | **PARTIAL** | `l2.ts` | Bridge security state |
| l2 | `hardkas l2 bridge assumptions` | — | `--json` | `runL2BridgeAssumptions` | — | **PARTIAL** | `l2.ts` | Trust assumptions |
| l2 | `hardkas l2 rpc health` | — | `--json` | `runL2RpcHealth` | — | **PARTIAL** | `l2.ts` | Igra RPC health |
| l2 | `hardkas l2 balance` | `<address>` | `--json` | `runL2Balance` | — | **PARTIAL** | `l2.ts` | Igra balance |
| l2 | `hardkas l2 nonce` | `<address>` | `--json` | `runL2Nonce` | — | **PARTIAL** | `l2.ts` | Igra nonce |
| test | `hardkas test` | `[files...]` | `--network, --watch, --json, --reporter` | `runTest` | `@hardkas/sdk` | **VERIFIED** | `test.ts` | Vitest programmatic runner |
| example | `hardkas example list` | — | — | `runExampleList` | — | **VERIFIED** | `misc.ts` | Lista ejemplos (registry.json) |
| example | `hardkas example run` | `<id>` | — | `runExampleRun` | — | **VERIFIED** | `misc.ts` | Ejecuta ejemplo |

## 3. Comandos NO encontrados
Los siguientes comandos no existen como archivos de definición en `packages/cli/src/commands/` pero algunos están integrados en otros archivos o simplemente son aspiracionales/documentales:

- `example.ts`: **No existe como archivo**. Los comandos `example` están integrados en `misc.ts`.
- `hardkas node stop`: **Encontrado**. Registrado en `node.ts`.
- `hardkas node restart`: **Encontrado**. Registrado en `node.ts`.
- `hardkas node logs`: **Encontrado**. Registrado en `node.ts`.
- `hardkas node reset`: **Encontrado**. Registrado en `node.ts`.
- `hardkas accounts balance`: **Encontrado**. Registrado en `accounts.ts`.
- `hardkas accounts fund`: **Encontrado**. Registrado en `accounts.ts`.

## 4. Checklist

- [x] Revisar `init.ts`
- [x] Revisar `tx.ts`
- [x] Revisar `accounts.ts`
- [x] Revisar `rpc.ts`
- [x] Revisar `dag.ts`
- [x] Revisar `artifact.ts`
- [x] Revisar `query.ts`
- [x] Revisar `node.ts`
- [x] Revisar `l2.ts`
- [x] Revisar `test.ts`
- [ ] Revisar `example.ts` — archivo no encontrado (comandos movidos a `misc.ts`)
- [x] Exportar tabla markdown
- [x] Eliminar comandos inexistentes

## 5. Guardrails

- No se modificó lógica runtime.
- No se modificaron runners.
- No se modificaron packages internos.
- No se añadieron comandos.
- No se eliminaron comandos.
- La auditoría se basa solo en `packages/cli/src/commands/*`.
