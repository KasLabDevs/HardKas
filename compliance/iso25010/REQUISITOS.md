# CATÁLOGO TRAZABLE DE REQUISITOS DE INGENIERÍA (`REQUISITOS.md`)

## 1. Resumen y Taxonomía de Requisitos (Fase 3 y Fase 4)

Se han extraído, documentado y procesado mediante **`Requirements-Agent`** un total de **72 requisitos atómicos (`HK-REQ-001` a `HK-REQ-072`)** que cubren los 35 paquetes, las 2 aplicaciones, los 10 laboratorios, los scripts de CI/CD y la arquitectura de 5 niveles de **HardKAS `v0.13.0-rc.2`**.

### 1.1 Distinción por Origen del Requisito
- **1. Requisito explícitamente documentado (`Explicit`: 35 requisitos)**: Extraído de especificaciones normativas del repositorio (`.agents/AGENTS.md`, `AI_ARCHITECTURE_RULES.md`, `docs/status/limitations.md`, `docs/status/send-routes-security.md`, `docs/status/versioning.md`, `README.md`) e implementado en código (`35/35 VERIFICADO`).
- **2. Requisito inferido a partir del código (`Inferred`: 16 requisitos)**: Garantía de seguridad, fiabilidad, determinismo o rendimiento implementada y verificada directamente en el código de producción y sus suites de pruebas (`16/16 VERIFICADO`).
- **3. Requisito recomendado / brecha detectada (`Recommended`: 21 requisitos)**: Requisito de calidad, seguridad o mantenibilidad aún no satisfecho o parcialmente implementado (`12 INCUMPLIDO`, `8 PARCIAL`, `1 SIN EVIDENCIA`).

### 1.2 Resumen Estadístico de Clasificación (`Requirements-Agent` + Verificación en Código)

| Dimensión | Desglose Exacto |
| :--- | :--- |
| **Total de Requisitos** | **72** (`HK-REQ-001` a `HK-REQ-072`) |
| **Por Origen** | **35 Explícitos** (48,61 %), **16 Inferidos** (22,22 %), **21 Recomendados** (29,17 %) |
| **Por Tipo (`Requirements-Agent`)** | **46 Funcionales (FR)** (63,89 %), **23 No Funcionales (NFR)** (31,94 %), **3 Restricciones Arquitectónicas (`Triage: NONE`)** (4,17 %) |
| **Por Categoría ISO (`Requirements-Agent`)** | `Functional Suitability`: **48**, `Reliability`: **8**, `Security`: **6**, `Maintainability`: **4**, `Performance Efficiency`: **3**, `Compatibility`: **3** |
| **Por Estado de Verificación Real** | `VERIFICADO`: **51** (70,83 %), `PARCIAL`: **8** (11,11 %), `INCUMPLIDO`: **12** (16,67 %), `SIN EVIDENCIA`: **1** (1,39 %) |

---

## 2. Tabla Maestra de Trazabilidad (`HK-REQ-001` a `HK-REQ-072`)

| ID | ID Lote ReqAgent | Origen | Paquete(s) Afectado(s) | Tipo (ReqAgent) | Categoría ISO (ReqAgent) | Prioridad | Estado Código | Referencias de Archivos y Líneas |
| :--- | :--- | :---: | :--- | :--- | :--- | :---: | :---: | :--- |
| `HK-REQ-001` | `batch_1_foundations:FR-001` | **Explicit** | `@hardkas/core, @hardkas/kaspa-rpc, @hardkas/sdk, @hardkas/accounts, @hardkas/cli` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/core/src/mainnet-policy.ts#L34-L163; packages/kaspa-rpc/src/upstream/session.ts#L223-L225` |
| `HK-REQ-002` | `batch_1_foundations:FR-002` | **Explicit** | `@hardkas/core, @hardkas/config, @hardkas/sdk` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/core/src/semantics/execution-guard.ts#L76-L218; packages/core/src/semantics/compatibility.ts#L22-L70` |
| `HK-REQ-003` | `batch_1_foundations:NFR-001` | **Explicit** | `@hardkas/core, @hardkas/tx-builder, @hardkas/dev-server, @hardkas/cli` | Non-Functional Requirement | `Security` | Critical | **`VERIFICADO`** | `packages/core/src/security.ts#L9-L296; packages/tx-builder/src/v1-plan.ts#L189-L197` |
| `HK-REQ-004` | `batch_1_foundations:FR-003` | **Inferred** | `@hardkas/core, @hardkas/artifacts` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/core/src/lock.ts#L19-L454; packages/artifacts/src/store-mutation.ts#L12-L104` |
| `HK-REQ-005` | `batch_1_foundations:NFR-002` | **Inferred** | `@hardkas/core, @hardkas/artifacts, @hardkas/accounts` | Non-Functional Requirement | `Reliability` | Critical | **`VERIFICADO`** | `packages/core/src/fs.ts#L30-L123; packages/core/src/fs.ts#L169-L251` |
| `HK-REQ-006` | `batch_1_foundations:FR-004` | **Explicit** | `@hardkas/core, @hardkas/localnet, @hardkas/cli` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/core/src/toolchains.ts#L44-L132; packages/core/src/node-images.ts#L8-L14` |
| `HK-REQ-007` | `batch_1_foundations:NFR-003` | **Explicit** | `@hardkas/core` | Non-Functional Requirement | `Security` | Critical | **`VERIFICADO`** | `packages/core/src/silver-compiler.ts#L1-L180; scripts/check-silver-no-shell-exec.mjs#L1-L60` |
| `HK-REQ-008` | `batch_1_foundations:FR-005` | **Inferred** | `@hardkas/core` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/core/src/units.ts#L1-L95; packages/core/src/address.ts#L1-L120` |
| `HK-REQ-009` | `batch_1_foundations:FR-006` | **Explicit** | `@hardkas/config` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/config/src/index.ts#L1-L180; packages/config/src/endpoint.ts#L1-L140` |
| `HK-REQ-010` | `batch_1_foundations:FR-007` | **Inferred** | `@hardkas/observability` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/observability/src/index.ts#L1-L120` |
| `HK-REQ-011` | `batch_1_foundations:NFR-004` | **Explicit** | `All workspace packages (packages/*)` | Non-Functional Requirement | `Maintainability` | High | **`VERIFICADO`** | `.agents/AGENTS.md#L126-L132; packages/*/package.json` |
| `HK-REQ-012` | `batch_1_foundations:FR-008` | **Recommended** | `@hardkas/core, .github/workflows` | Functional Requirement | `Functional Suitability` | High | **`PARCIAL`** | `packages/core/src/toolchains.ts#L85-L132; .github/workflows/ci.yml#L76-L84` |
| `HK-REQ-013` | `batch_2_artifacts_accounts:FR-001` | **Explicit** | `@hardkas/artifacts` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/artifacts/src/canonical.ts#L87-L379` |
| `HK-REQ-014` | `batch_2_artifacts_accounts:FR-002` | **Explicit** | `@hardkas/artifacts` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/artifacts/src/store.ts#L122-L184` |
| `HK-REQ-015` | `batch_2_artifacts_accounts:NFR-001` | **Inferred** | `@hardkas/artifacts` | Non-Functional Requirement | `Security` | Critical | **`VERIFICADO`** | `packages/artifacts/src/store.ts#L28; packages/artifacts/src/store.ts#L94-L105; packages/artifacts/src/store-mutation.ts#L90-L103` |
| `HK-REQ-016` | `batch_2_artifacts_accounts:FR-003` | **Explicit** | `@hardkas/artifacts, @hardkas/sdk` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/artifacts/src/tx-status.ts#L273-L583` |
| `HK-REQ-017` | `batch_2_artifacts_accounts:FR-004` | **Explicit** | `@hardkas/artifacts` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/artifacts/src/migrate.ts#L1-L160; packages/artifacts/src/verify.ts#L1-L250` |
| `HK-REQ-018` | `batch_2_artifacts_accounts:FR-005` | **Explicit** | `@hardkas/artifacts` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/artifacts/src/evidence.ts#L1-L190` |
| `HK-REQ-019` | `batch_2_artifacts_accounts:NFR-002` | **Explicit** | `@hardkas/accounts` | Non-Functional Requirement | `Security` | Critical | **`VERIFICADO`** | `packages/accounts/src/keystore.ts#L14-L314` |
| `HK-REQ-020` | `batch_2_artifacts_accounts:NFR-003` | **Inferred** | `@hardkas/accounts` | Non-Functional Requirement | `Reliability` | High | **`VERIFICADO`** | `packages/accounts/src/kaspa-wasm-signer.ts#L244; packages/accounts/src/kaspa-wasm-signer.ts#L320-L363; packages/accounts/src/internal/wasm-rpc-serialization.ts#L2-L143` |
| `HK-REQ-021` | `batch_2_artifacts_accounts:FR-006` | **Explicit** | `@hardkas/accounts` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/accounts/src/v1-draft.ts#L1-L320; packages/accounts/src/v1-validate.ts#L1-L490` |
| `HK-REQ-022` | `batch_2_artifacts_accounts:FR-007` | **Inferred** | `@hardkas/accounts` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/accounts/src/real-accounts.ts#L1-L260` |
| `HK-REQ-023` | `batch_2_artifacts_accounts:FR-008` | **Recommended** | `@hardkas/accounts, @hardkas/tx-builder` | Functional Requirement | `Functional Suitability` | High | **`INCUMPLIDO`** | `packages/tx-builder/src/address-scheme.ts#L18-L54; packages/accounts/src/kaspa-wasm-signer.ts#L133-L139` |
| `HK-REQ-024` | `batch_2_artifacts_accounts:FR-009` | **Recommended** | `@hardkas/accounts, @hardkas/sdk, @hardkas/tx-builder` | Functional Requirement | `Functional Suitability` | High | **`INCUMPLIDO`** | `packages/accounts/src/kaspa-wasm-signer.ts#L399-L416; packages/sdk/src/tx.ts#L281-L290` |
| `HK-REQ-025` | `batch_3_tx_rpc_sim:FR-001` | **Explicit** | `@hardkas/tx-builder, @hardkas/sdk` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/tx-builder/src/generator-plan.ts#L99-L285` |
| `HK-REQ-026` | `batch_3_tx_rpc_sim:FR-002` | **Explicit** | `@hardkas/tx-builder, @hardkas/sdk` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/tx-builder/src/pending-spends.ts#L27-L136` |
| `HK-REQ-027` | `batch_3_tx_rpc_sim:FR-003` | **Inferred** | `@hardkas/tx-builder, @hardkas/accounts, @hardkas/toolkit` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/tx-builder/src/generator-plan.ts#L102-L109; packages/accounts/src/signer.ts#L75-L101` |
| `HK-REQ-028` | `batch_3_tx_rpc_sim:FR-004` | **Inferred** | `@hardkas/tx-builder` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/tx-builder/src/v1-plan.ts#L189-L440` |
| `HK-REQ-029` | `batch_3_tx_rpc_sim:FR-005` | **Explicit** | `@hardkas/tx-builder, @hardkas/sdk` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `docs/status/send-routes-security.md#L9; packages/sdk/src/tx.ts#L215-L275` |
| `HK-REQ-030` | `batch_3_tx_rpc_sim:FR-006` | **Inferred** | `@hardkas/kaspa-rpc` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/kaspa-rpc/src/upstream/session.ts#L268-L438; packages/kaspa-rpc/src/json-rpc-client.ts#L419-L488` |
| `HK-REQ-031` | `batch_3_tx_rpc_sim:NFR-001` | **Inferred** | `@hardkas/kaspa-rpc` | Non-Functional Requirement | `Reliability` | Critical | **`VERIFICADO`** | `packages/kaspa-rpc/src/upstream/node-websocket-compat.ts#L39-L55` |
| `HK-REQ-032` | `batch_3_tx_rpc_sim:FR-007` | **Explicit** | `@hardkas/localnet, @hardkas/node-runner, @hardkas/node-orchestrator` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/localnet/src/index.ts#L1-L220; packages/node-runner/src/index.ts#L1-L150` |
| `HK-REQ-033` | `batch_3_tx_rpc_sim:NFR-002` | **Explicit** | `@hardkas/simulator` | Non-Functional Requirement | `Performance Efficiency` | High | **`VERIFICADO`** | `packages/simulator/src/index.ts#L1-L180; packages/simulator/src/script/vm.ts#L1-L400` |
| `HK-REQ-034` | `batch_3_tx_rpc_sim:TRIAGE_NONE` | **Recommended** | `@hardkas/accounts, @hardkas/tx-builder` | Architectural / Process Constraint (Triage: NONE) | `Compatibility` | High | **`PARCIAL`** | `docs/status/limitations.md#L258-L269; packages/accounts/src/internal/wasm-rpc-serialization.ts#L12-L18` |
| `HK-REQ-035` | `batch_3_tx_rpc_sim:TRIAGE_NONE` | **Recommended** | `@hardkas/simulator` | Architectural / Process Constraint (Triage: NONE) | `Reliability` | High | **`PARCIAL`** | `docs/status/limitations.md#L216-L249` |
| `HK-REQ-036` | `batch_3_tx_rpc_sim:NFR-003` | **Recommended** | `@hardkas/localnet, @hardkas/cli` | Non-Functional Requirement | `Reliability` | High | **`PARCIAL`** | `merchant-compatibility-failures.md#L171-L177` |
| `HK-REQ-037` | `batch_4_sdk_silver_zk:FR-001` | **Explicit** | `@hardkas/sdk` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `docs/status/send-routes-security.md#L15-L65; packages/sdk/src/tx.ts#L450-L980` |
| `HK-REQ-038` | `batch_4_sdk_silver_zk:FR-002` | **Explicit** | `@hardkas/sdk, @hardkas/core` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/core/src/silver-compiler.ts#L1-L220; packages/sdk/src/silver.ts#L1-L310` |
| `HK-REQ-039` | `batch_4_sdk_silver_zk:FR-003` | **Explicit** | `@hardkas/sdk, @hardkas/accounts` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/accounts/src/silver-covenant.ts#L1-L260; packages/sdk/src/covenant-lineage.ts#L1-L280` |
| `HK-REQ-040` | `batch_4_sdk_silver_zk:NFR-001` | **Inferred** | `@hardkas/sdk` | Non-Functional Requirement | `Performance Efficiency` | High | **`VERIFICADO`** | `packages/sdk/src/zk/groth16-verifier.ts#L156-L800` |
| `HK-REQ-041` | `batch_4_sdk_silver_zk:FR-004` | **Inferred** | `@hardkas/sdk` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/sdk/src/zk/toccata.ts#L52-L100; packages/sdk/src/zk/toccata.ts#L758-L1600` |
| `HK-REQ-042` | `batch_4_sdk_silver_zk:FR-005` | **Explicit** | `@hardkas/sdk` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `docs/status/limitations.md#L396-L444; packages/sdk/src/waiters.ts#L1-L320` |
| `HK-REQ-043` | `batch_4_sdk_silver_zk:FR-006` | **Explicit** | `@hardkas/escrow, @hardkas/cli` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/escrow/src/index.ts#L1-L180; docs/status/send-routes-security.md#L19` |
| `HK-REQ-044` | `batch_4_sdk_silver_zk:FR-007` | **Explicit** | `@hardkas/bridge-local` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/bridge-local/src/index.ts#L1-L150` |
| `HK-REQ-045` | `batch_4_sdk_silver_zk:FR-008` | **Recommended** | `@hardkas/sdk` | Functional Requirement | `Functional Suitability` | High | **`INCUMPLIDO`** | `packages/sdk/src/covenants.ts#L494-L516` |
| `HK-REQ-046` | `batch_4_sdk_silver_zk:FR-009` | **Recommended** | `@hardkas/sdk` | Functional Requirement | `Functional Suitability` | High | **`PARCIAL`** | `docs/status/limitations.md#L140-L147; packages/sdk/src/zk/toccata.ts#L248-L280; packages/sdk/src/zk/toccata.ts#L979-L985` |
| `HK-REQ-047` | `batch_4_sdk_silver_zk:NFR-002` | **Recommended** | `@hardkas/pskt-native, @hardkas/sdk` | Non-Functional Requirement | `Compatibility` | High | **`INCUMPLIDO`** | `docs/status/limitations.md#L289-L314; packages/pskt-native/package.json` |
| `HK-REQ-048` | `batch_4_sdk_silver_zk:TRIAGE_NONE` | **Recommended** | `@hardkas/sdk` | Architectural / Process Constraint (Triage: NONE) | `Functional Suitability` | High | **`PARCIAL`** | `README.md#L179-L181; docs/status/limitations.md#L178-L182` |
| `HK-REQ-049` | `batch_5_extensions_storage:FR-001` | **Explicit** | `@hardkas/query-store, @hardkas/query` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `.agents/AGENTS.md#L135-L136; docs/status/limitations.md#L63-L73; packages/query-store/src/index.ts#L1-L200` |
| `HK-REQ-050` | `batch_5_extensions_storage:FR-002` | **Explicit** | `@hardkas/toolkit` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/toolkit/src/index.ts#L1-L120; benchmarks/utxo.bench.ts#L1-L104` |
| `HK-REQ-051` | `batch_5_extensions_storage:FR-003` | **Inferred** | `@hardkas/toolkit` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/toolkit/src/wallet.ts#L58-L67; packages/toolkit/src/wallet.ts#L190-L240` |
| `HK-REQ-052` | `batch_5_extensions_storage:FR-004` | **Explicit** | `@hardkas/jobs, @hardkas/toolkit` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `packages/jobs/src/index.ts#L1-L180; benchmarks/jobs.bench.ts#L1-L67` |
| `HK-REQ-053` | `batch_5_extensions_storage:FR-005` | **Explicit** | `@hardkas/l2, @hardkas/ext-l2` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `docs/status/limitations.md#L49; packages/l2/src/network-guard.ts#L1-L140` |
| `HK-REQ-054` | `batch_5_extensions_storage:FR-006` | **Recommended** | `@hardkas/toolkit` | Functional Requirement | `Functional Suitability` | High | **`INCUMPLIDO`** | `docs/status/send-routes-security.md#L69; packages/toolkit/src/wallet.ts#L435-L441` |
| `HK-REQ-055` | `batch_5_extensions_storage:FR-007` | **Recommended** | `@hardkas/toolkit, @hardkas/accounts` | Functional Requirement | `Functional Suitability` | High | **`INCUMPLIDO`** | `packages/toolkit/src/wallet.ts#L156-L201; packages/toolkit/src/wallet.ts#L362-L373` |
| `HK-REQ-056` | `batch_5_extensions_storage:FR-008` | **Recommended** | `@hardkas/query-store` | Functional Requirement | `Functional Suitability` | High | **`INCUMPLIDO`** | `packages/query-store/src/projection-store.ts#L35-L40` |
| `HK-REQ-057` | `batch_5_extensions_storage:NFR-001` | **Recommended** | `@hardkas/plugin-rpc-backend` | Non-Functional Requirement | `Reliability` | High | **`PARCIAL`** | `docs/status/limitations.md#L451-L457; packages/plugin-rpc-backend/src/resilience.ts#L1-L130` |
| `HK-REQ-058` | `batch_5_extensions_storage:NFR-002` | **Recommended** | `@hardkas/storage-postgres, @hardkas/storage-sqlite, @hardkas/plugin-local-indexer, @hardkas/simulator-adapters, @hardkas/wallet-adapter, @hardkas/sync-daemon` | Non-Functional Requirement | `Maintainability` | High | **`SIN EVIDENCIA`** | `PUBLIC_API_SURFACE.md#L38-L52; docs/status/versioning.md#L108-L128` |
| `HK-REQ-059` | `batch_5_extensions_storage:FR-009` | **Explicit** | `@hardkas/ext-l2, @hardkas/cli` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `docs/status/versioning.md#L111; packages/cli/src/commands/extension.ts#L1-L160` |
| `HK-REQ-060` | `batch_5_extensions_storage:NFR-003` | **Explicit** | `@hardkas/testnet-qualification, labs/testnet-runner` | Non-Functional Requirement | `Security` | Critical | **`VERIFICADO`** | `packages/testnet-qualification/src/index.ts#L1-L180; labs/testnet-runner/test/no-public-funding.test.ts#L1-L60` |
| `HK-REQ-061` | `batch_6_cli_devserver_ci_quality:FR-001` | **Explicit** | `@hardkas/cli` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `README.md#L261-L266; docs/status/versioning.md#L134-L137; packages/cli/src/index.ts#L1-L250` |
| `HK-REQ-062` | `batch_6_cli_devserver_ci_quality:NFR-001` | **Inferred** | `@hardkas/dev-server` | Non-Functional Requirement | `Security` | Critical | **`VERIFICADO`** | `packages/dev-server/src/server.ts#L44-L204; packages/dev-server/src/server.ts#L272-L282` |
| `HK-REQ-063` | `batch_6_cli_devserver_ci_quality:FR-002` | **Explicit** | `@hardkas/dev-server` | Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `docs/status/send-routes-security.md#L20; docs/status/send-routes-security.md#L45; packages/dev-server/src/server.ts#L1-L310` |
| `HK-REQ-064` | `batch_6_cli_devserver_ci_quality:NFR-002` | **Explicit** | `All 35 workspace packages` | Non-Functional Requirement | `Functional Suitability` | High | **`VERIFICADO`** | `scripts/check-release-tarballs.mjs#L54-L66; scripts/check-release-tarballs.mjs#L247-L560` |
| `HK-REQ-065` | `batch_6_cli_devserver_ci_quality:NFR-003` | **Explicit** | `All 22 published packages` | Non-Functional Requirement | `Compatibility` | High | **`VERIFICADO`** | `scripts/check-licenses.mjs#L1-L341; docs/status/dependency-licenses.md#L1-L60` |
| `HK-REQ-066` | `batch_6_cli_devserver_ci_quality:NFR-004` | **Inferred** | `@hardkas/testing, scripts` | Non-Functional Requirement | `Reliability` | High | **`VERIFICADO`** | `scripts/gate-hermetic.mjs#L1-L107; scripts/hermetic/no-network-preload.cjs#L1-L80` |
| `HK-REQ-067` | `batch_6_cli_devserver_ci_quality:NFR-005` | **Recommended** | `@hardkas/dev-server` | Non-Functional Requirement | `Performance Efficiency` | Medium | **`INCUMPLIDO`** | `packages/dev-server/src/server.ts#L74-L205` |
| `HK-REQ-068` | `batch_6_cli_devserver_ci_quality:FR-003` | **Recommended** | `@hardkas/client, @hardkas/react` | Functional Requirement | `Functional Suitability` | High | **`INCUMPLIDO`** | `docs/status/versioning.md#L116-L117; packages/client/src/index.ts#L1-L60` |
| `HK-REQ-069` | `batch_6_cli_devserver_ci_quality:NFR-006` | **Recommended** | `All workspace packages` | Non-Functional Requirement | `Maintainability` | Medium | **`INCUMPLIDO`** | `scripts/check-typescript-hygiene.mjs#L1-L90; docs/status/release-claims.md#L82` |
| `HK-REQ-070` | `batch_6_cli_devserver_ci_quality:NFR-007` | **Recommended** | `docs, scripts` | Non-Functional Requirement | `Maintainability` | Medium | **`INCUMPLIDO`** | `scripts/docs-check.mjs#L1-L120; docs/community/rc-0.13.0-rc.1/EVIDENCE_INDEX.md; docs/internal/audit/surface-2026-11-09/inventario.md` |
| `HK-REQ-071` | `batch_6_cli_devserver_ci_quality:FR-004` | **Recommended** | `@hardkas/artifacts, scripts` | Functional Requirement | `Functional Suitability` | High | **`INCUMPLIDO`** | `package.json#L60-L61; scripts/check-artifact-fixtures.mjs#L1-L90` |
| `HK-REQ-072` | `batch_6_cli_devserver_ci_quality:NFR-008` | **Recommended** | `@hardkas/cli, @hardkas/sdk, .github/workflows` | Non-Functional Requirement | `Reliability` | High | **`PARCIAL`** | `docs/status/limitations.md#L315-L364; PUBLIC_API_SURFACE.md#L12-L53` |

---

## 3. Especificación Detallada y Refinamiento SMART por Requisito

### `HK-REQ-001` — @hardkas/core, @hardkas/kaspa-rpc, @hardkas/sdk, @hardkas/accounts, @hardkas/cli (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_1_foundations:FR-001` (Foundations & Architecture (core, config, observability))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/core/src/mainnet-policy.ts#L34-L163; packages/kaspa-rpc/src/upstream/session.ts#L223-L225`
- **Enunciado Original Extraído**: The system must strictly block all mainnet network connections, mainnet private key signing, and mainnet transaction broadcasting before opening any socket or unlocking any key.
- **Enunciado Refinado (`Requirements-Agent`)**: The system must strictly block all mainnet network connections, mainnet private key signing, and mainnet transaction broadcasting before opening any socket or unlocking any key.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-002` — @hardkas/core, @hardkas/config, @hardkas/sdk (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_1_foundations:FR-002` (Foundations & Architecture (core, config, observability))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/core/src/semantics/execution-guard.ts#L76-L218; packages/core/src/semantics/compatibility.ts#L22-L70`
- **Enunciado Original Extraído**: The system shall resolve the ExecutionTarget tuple (mode, domain, network) first and validate account, artifact, and receipt compatibility before executing any operation.
- **Enunciado Refinado (`Requirements-Agent`)**: The system shall resolve the ExecutionTarget tuple (mode, domain, network) first and validate account, artifact, and receipt compatibility before executing any operation.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-003` — @hardkas/core, @hardkas/tx-builder, @hardkas/dev-server, @hardkas/cli (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_1_foundations:NFR-001` (Foundations & Architecture (core, config, observability))
- **Origen**: `Explicit` | **Prioridad**: `Critical` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Security`
- **Referencias de Código y Documentación**: `packages/core/src/security.ts#L9-L296; packages/tx-builder/src/v1-plan.ts#L189-L197`
- **Enunciado Original Extraído**: The security module must strip ANSI escape sequences and redact all 64-hex private keys, extended keys, mnemonics, secret fields, and URL credentials before logging or persisting artifacts.
- **Enunciado Refinado (`Requirements-Agent`)**: The security module shall sanitize 100% of outbound log and persistent artifact streams by stripping ANSI escape sequences and redacting 64-hex private keys, extended keys, mnemonics, secret fields, and URL credentials.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-004` — @hardkas/core, @hardkas/artifacts (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_1_foundations:FR-003` (Foundations & Architecture (core, config, observability))
- **Origen**: `Inferred` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/core/src/lock.ts#L19-L454; packages/artifacts/src/store-mutation.ts#L12-L104`
- **Enunciado Original Extraído**: The lock manager must acquire workspace file locks in a strict hierarchical rank order using AsyncLocalStorage reentrancy, recover stale dead-PID locks after 30 seconds, and omit CLI arguments from lockfiles.
- **Enunciado Refinado (`Requirements-Agent`)**: The lock manager must acquire workspace file locks in a strict hierarchical rank order using AsyncLocalStorage reentrancy, recover stale dead-PID locks after 30 seconds, and omit CLI arguments from lockfiles.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-005` — @hardkas/core, @hardkas/artifacts, @hardkas/accounts (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_1_foundations:NFR-002` (Foundations & Architecture (core, config, observability))
- **Origen**: `Inferred` | **Prioridad**: `Critical` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Reliability`
- **Referencias de Código y Documentación**: `packages/core/src/fs.ts#L30-L123; packages/core/src/fs.ts#L169-L251`
- **Enunciado Original Extraído**: All durable state writes must write to a unique temporary sibling file, flush to disk with fsyncSync, and atomically rename with up to 5 backoff retries on Windows EPERM or EBUSY errors.
- **Enunciado Refinado (`Requirements-Agent`)**: All durable state writes shall execute via a unique temporary sibling file, execute fsyncSync to flush to disk, and complete an atomic rename supporting up to 5 exponential backoff retries upon encountering Windows EPERM or EBUSY errors.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-006` — @hardkas/core, @hardkas/localnet, @hardkas/cli (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_1_foundations:FR-004` (Foundations & Architecture (core, config, observability))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/core/src/toolchains.ts#L44-L132; packages/core/src/node-images.ts#L8-L14`
- **Enunciado Original Extraído**: The toolchain manager must verify exact SHA-256 digests and byte sizes for external kaspa-wasm v2.1.0 and silverc v1.0.0 binaries and pin Docker images rusty-kaspad v2.1.0 and cpuminer by immutable SHA-256 digest.
- **Enunciado Refinado (`Requirements-Agent`)**: The toolchain manager must verify exact SHA-256 digests and byte sizes for external kaspa-wasm v2.1.0 and silverc v1.0.0 binaries and pin Docker images rusty-kaspad v2.1.0 and cpuminer by immutable SHA-256 digest.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-007` — @hardkas/core (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_1_foundations:NFR-003` (Foundations & Architecture (core, config, observability))
- **Origen**: `Explicit` | **Prioridad**: `Critical` | **Método de Verificación**: `Inspection`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Security`
- **Referencias de Código y Documentación**: `packages/core/src/silver-compiler.ts#L1-L180; scripts/check-silver-no-shell-exec.mjs#L1-L60`
- **Enunciado Original Extraído**: External binary execution for the SilverScript compiler must use child_process.execFile without shell interpolation to prevent command injection.
- **Enunciado Refinado (`Requirements-Agent`)**: External binary execution for the SilverScript compiler shall exclusively use child_process.execFile with shell interpolation disabled (shell: false) to prevent command injection vulnerabilities across 100% of execution paths.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-008` — @hardkas/core (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_1_foundations:FR-005` (Foundations & Architecture (core, config, observability))
- **Origen**: `Inferred` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/core/src/units.ts#L1-L95; packages/core/src/address.ts#L1-L120`
- **Enunciado Original Extraído**: The system shall convert between KAS decimal strings and bigint Sompi units (100,000,000 sompi per KAS) without floating-point precision loss and validate network-specific Bech32 address prefixes.
- **Enunciado Refinado (`Requirements-Agent`)**: The system shall convert between KAS decimal strings and bigint Sompi units (100,000,000 sompi per KAS) without floating-point precision loss and validate network-specific Bech32 address prefixes.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-009` — @hardkas/config (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_1_foundations:FR-006` (Foundations & Architecture (core, config, observability))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/config/src/index.ts#L1-L180; packages/config/src/endpoint.ts#L1-L140`
- **Enunciado Original Extraído**: The configuration loader shall load TypeScript and JavaScript hardkas.config files via jiti and resolve network endpoints, execution targets, and fee policies deterministically.
- **Enunciado Refinado (`Requirements-Agent`)**: The configuration loader shall load TypeScript and JavaScript hardkas.config files via jiti and resolve network endpoints, execution targets, and fee policies deterministically.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-010` — @hardkas/observability (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_1_foundations:FR-007` (Foundations & Architecture (core, config, observability))
- **Origen**: `Inferred` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/observability/src/index.ts#L1-L120`
- **Enunciado Original Extraído**: The observability package shall provide structured logging, metric counters, Prometheus text export formatting, and distributed trace spans with zero external runtime dependencies.
- **Enunciado Refinado (`Requirements-Agent`)**: The observability package shall provide structured logging, metric counters, Prometheus text export formatting, and distributed trace spans with zero external runtime dependencies.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-011` — All workspace packages (packages/*) (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_1_foundations:NFR-004` (Foundations & Architecture (core, config, observability))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Analysis`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Maintainability`
- **Referencias de Código y Documentación**: `.agents/AGENTS.md#L126-L132; packages/*/package.json`
- **Enunciado Original Extraído**: The monorepo package dependency graph must strictly obey the five-tier hierarchy from Level 0 Foundations through Level 4 Presentation without upward circular dependencies.
- **Enunciado Refinado (`Requirements-Agent`)**: The monorepo package dependency graph shall statically enforce the strict five-tier hierarchy from Level 0 Foundations to Level 4 Presentation with 0 upward or circular dependencies detected during static analysis checks.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-012` — @hardkas/core, .github/workflows (`PARCIAL`)
- **Lote y ID `Requirements-Agent`**: `batch_1_foundations:FR-008` (Foundations & Architecture (core, config, observability))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/core/src/toolchains.ts#L85-L132; .github/workflows/ci.yml#L76-L84`
- **Enunciado Original Extraído**: The toolchain manager should support pinned silverc v1.0.0 compiler binaries on macOS (darwin-arm64 and darwin-x64) in addition to Windows and Linux, and provide a signed binary for the SilverScript VM runner.
- **Enunciado Refinado (`Requirements-Agent`)**: The toolchain manager should support pinned silverc v1.0.0 compiler binaries on macOS (darwin-arm64 and darwin-x64) in addition to Windows and Linux, and provide a signed binary for the SilverScript VM runner.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-013` — @hardkas/artifacts (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_2_artifacts_accounts:FR-001` (Artifacts, Reproducibility & Cryptographic Accounts (artifacts, accounts, sessions))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/artifacts/src/canonical.ts#L87-L379`
- **Enunciado Original Extraído**: The artifact engine must compute deterministic SHA-256 content hashes (hashVersion 5) over canonicalized JSON with NFC Unicode normalization, LF line endings, and UTF-16 lexicographically sorted keys.
- **Enunciado Refinado (`Requirements-Agent`)**: The artifact engine must compute deterministic SHA-256 content hashes (hashVersion 5) over canonicalized JSON with NFC Unicode normalization, LF line endings, and UTF-16 lexicographically sorted keys.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-014` — @hardkas/artifacts (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_2_artifacts_accounts:FR-002` (Artifacts, Reproducibility & Cryptographic Accounts (artifacts, accounts, sessions))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/artifacts/src/store.ts#L122-L184`
- **Enunciado Original Extraído**: The artifact store must enforce write-once immutability per artifact identity and reject any attempt to overwrite an existing artifact ID with modified content using ARTIFACT_IDENTITY_CONFLICT.
- **Enunciado Refinado (`Requirements-Agent`)**: The artifact store must enforce write-once immutability per artifact identity and reject any attempt to overwrite an existing artifact ID with modified content using ARTIFACT_IDENTITY_CONFLICT.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-015` — @hardkas/artifacts (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_2_artifacts_accounts:NFR-001` (Artifacts, Reproducibility & Cryptographic Accounts (artifacts, accounts, sessions))
- **Origen**: `Inferred` | **Prioridad**: `Critical` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Security`
- **Referencias de Código y Documentación**: `packages/artifacts/src/store.ts#L28; packages/artifacts/src/store.ts#L94-L105; packages/artifacts/src/store-mutation.ts#L90-L103`
- **Enunciado Original Extraído**: The artifact store must confine all file reads and writes inside the workspace directory, reject relative path traversal sequences, block symlink or junction escapes, and cap lineage graph traversal at 64 hops.
- **Enunciado Refinado (`Requirements-Agent`)**: The artifact store shall restrict all file I/O operations strictly within the designated workspace directory, reject any relative path traversal sequences (e.g., ../), block symlink and junction escapes, and enforce a hard limit of ≤ 64 hops for lineage graph traversal.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-016` — @hardkas/artifacts, @hardkas/sdk (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_2_artifacts_accounts:FR-003` (Artifacts, Reproducibility & Cryptographic Accounts (artifacts, accounts, sessions))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/artifacts/src/tx-status.ts#L273-L583`
- **Enunciado Original Extraído**: The deriveTxStatus function must be a pure deterministic function that derives transaction lifecycle states from immutable submission and observation facts per observer, detecting DAG reorgs and conflicting observations.
- **Enunciado Refinado (`Requirements-Agent`)**: The deriveTxStatus function must be a pure deterministic function that derives transaction lifecycle states from immutable submission and observation facts per observer, detecting DAG reorgs and conflicting observations.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-017` — @hardkas/artifacts (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_2_artifacts_accounts:FR-004` (Artifacts, Reproducibility & Cryptographic Accounts (artifacts, accounts, sessions))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/artifacts/src/migrate.ts#L1-L160; packages/artifacts/src/verify.ts#L1-L250`
- **Enunciado Original Extraído**: Strict artifact verification must reject legacy artifacts with hashVersion 4 or lower using MIGRATION_REQUIRED unless explicitly migrated through the auditable artifact migration command.
- **Enunciado Refinado (`Requirements-Agent`)**: Strict artifact verification must reject legacy artifacts with hashVersion 4 or lower using MIGRATION_REQUIRED unless explicitly migrated through the auditable artifact migration command.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-018` — @hardkas/artifacts (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_2_artifacts_accounts:FR-005` (Artifacts, Reproducibility & Cryptographic Accounts (artifacts, accounts, sessions))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/artifacts/src/evidence.ts#L1-L190`
- **Enunciado Original Extraído**: The EvidenceBatchExporter shall package transaction plans, signed transactions, receipts, and lineage proofs into tamper-evident evidence bundles that can be verified offline without a live node.
- **Enunciado Refinado (`Requirements-Agent`)**: The EvidenceBatchExporter shall package transaction plans, signed transactions, receipts, and lineage proofs into tamper-evident evidence bundles that can be verified offline without a live node.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-019` — @hardkas/accounts (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_2_artifacts_accounts:NFR-002` (Artifacts, Reproducibility & Cryptographic Accounts (artifacts, accounts, sessions))
- **Origen**: `Explicit` | **Prioridad**: `Critical` | **Método de Verificación**: `Inspection`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Security`
- **Referencias de Código y Documentación**: `packages/accounts/src/keystore.ts#L14-L314`
- **Enunciado Original Extraído**: The KeystoreManager must encrypt real private keys at rest using AES-256-GCM with keys derived via Argon2id (minimum 19,456 KiB memory, 2 iterations, 16-byte salt), bind identity metadata in GCM AAD, enforce 0600 file permissions, and zero derived key buffers in finally blocks.
- **Enunciado Refinado (`Requirements-Agent`)**: The KeystoreManager shall encrypt all private keys at rest using AES-256-GCM with keys derived via Argon2id using a minimum of 19,456 KiB memory, 2 iterations, and a 16-byte salt; bind identity metadata in GCM AAD; enforce strict 0600 file permissions; and securely zero out all derived key buffers within finally blocks upon execution completion.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-020` — @hardkas/accounts (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_2_artifacts_accounts:NFR-003` (Artifacts, Reproducibility & Cryptographic Accounts (artifacts, accounts, sessions))
- **Origen**: `Inferred` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Reliability`
- **Referencias de Código y Documentación**: `packages/accounts/src/kaspa-wasm-signer.ts#L244; packages/accounts/src/kaspa-wasm-signer.ts#L320-L363; packages/accounts/src/internal/wasm-rpc-serialization.ts#L2-L143`
- **Enunciado Original Extraído**: The KaspaWasmPrivateKeySigner must never return raw WASM PrivateKey pointers across boundaries, must construct a fresh WASM Transaction per input signing pass, and must reject RPC integers exceeding Number.MAX_SAFE_INTEGER.
- **Enunciado Refinado (`Requirements-Agent`)**: The KaspaWasmPrivateKeySigner shall encapsulate memory management to prevent returning raw WASM PrivateKey pointers across boundaries, instantiate a fresh WASM Transaction object per input signing pass, and reject any RPC integers exceeding Number.MAX_SAFE_INTEGER (9,007,199,254,740,991).
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-021` — @hardkas/accounts (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_2_artifacts_accounts:FR-006` (Artifacts, Reproducibility & Cryptographic Accounts (artifacts, accounts, sessions))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/accounts/src/v1-draft.ts#L1-L320; packages/accounts/src/v1-validate.ts#L1-L490`
- **Enunciado Original Extraído**: The accounts package shall support multilateral V1 transaction drafts (V1TxDraft) allowing independent preparation, per-slot signature verification, draft combination, and finalization.
- **Enunciado Refinado (`Requirements-Agent`)**: The accounts package shall support multilateral V1 transaction drafts (V1TxDraft) allowing independent preparation, per-slot signature verification, draft combination, and finalization.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-022` — @hardkas/accounts (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_2_artifacts_accounts:FR-007` (Artifacts, Reproducibility & Cryptographic Accounts (artifacts, accounts, sessions))
- **Origen**: `Inferred` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/accounts/src/real-accounts.ts#L1-L260`
- **Enunciado Original Extraído**: When loading real account stores, the system must detect legacy plaintext private keys, emit security migration warnings, and block importing or generating mainnet keys.
- **Enunciado Refinado (`Requirements-Agent`)**: When loading real account stores, the system must detect legacy plaintext private keys, emit security migration warnings, and block importing or generating mainnet keys.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-023` — @hardkas/accounts, @hardkas/tx-builder (`INCUMPLIDO`)
- **Lote y ID `Requirements-Agent`**: `batch_2_artifacts_accounts:FR-008` (Artifacts, Reproducibility & Cryptographic Accounts (artifacts, accounts, sessions))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/tx-builder/src/address-scheme.ts#L18-L54; packages/accounts/src/kaspa-wasm-signer.ts#L133-L139`
- **Enunciado Original Extraído**: The transaction planner and signer should support spending from ECDSA P2PK addresses (currently refused fail-closed with ECDSA_SPEND_NOT_SUPPORTED; only Schnorr P2PK spending is implemented).
- **Enunciado Refinado (`Requirements-Agent`)**: The transaction planner and signer should support spending from ECDSA P2PK addresses (currently refused fail-closed with ECDSA_SPEND_NOT_SUPPORTED; only Schnorr P2PK spending is implemented).
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-024` — @hardkas/accounts, @hardkas/sdk, @hardkas/tx-builder (`INCUMPLIDO`)
- **Lote y ID `Requirements-Agent`**: `batch_2_artifacts_accounts:FR-009` (Artifacts, Reproducibility & Cryptographic Accounts (artifacts, accounts, sessions))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/accounts/src/kaspa-wasm-signer.ts#L399-L416; packages/sdk/src/tx.ts#L281-L290`
- **Enunciado Original Extraído**: The transaction planner and signer should support non-zero absolute lockTime (CLTV) values on planned transactions (currently refused fail-closed with LOCK_TIME_NOT_SUPPORTED when lockTime is not 0).
- **Enunciado Refinado (`Requirements-Agent`)**: The transaction planner and signer should support non-zero absolute lockTime (CLTV) values on planned transactions (currently refused fail-closed with LOCK_TIME_NOT_SUPPORTED when lockTime is not 0).
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-025` — @hardkas/tx-builder, @hardkas/sdk (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_3_tx_rpc_sim:FR-001` (Transaction Builder, RPC Transport, Localnet & Simulator (tx-builder, kaspa-rpc, simulator, localnet))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/tx-builder/src/generator-plan.ts#L99-L285`
- **Enunciado Original Extraído**: Standard V0 payment and consolidation plans must delegate UTXO selection, mass calculation, KIP-9 storage mass validation, and fee estimation to the official kaspa-wasm Generator and verify strict value conservation.
- **Enunciado Refinado (`Requirements-Agent`)**: Standard V0 payment and consolidation plans must delegate UTXO selection, mass calculation, KIP-9 storage mass validation, and fee estimation to the official kaspa-wasm Generator and verify strict value conservation.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-026` — @hardkas/tx-builder, @hardkas/sdk (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_3_tx_rpc_sim:FR-002` (Transaction Builder, RPC Transport, Localnet & Simulator (tx-builder, kaspa-rpc, simulator, localnet))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/tx-builder/src/pending-spends.ts#L27-L136`
- **Enunciado Original Extraído**: When planning RPC transactions, the UTXO provider must query the node mempool to exclude pending-spent inputs and fail closed with PENDING_SPEND_EVIDENCE_UNAVAILABLE if mempool visibility is unavailable.
- **Enunciado Refinado (`Requirements-Agent`)**: When planning RPC transactions, the UTXO provider must query the node mempool to exclude pending-spent inputs and fail closed with PENDING_SPEND_EVIDENCE_UNAVAILABLE if mempool visibility is unavailable.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-027` — @hardkas/tx-builder, @hardkas/accounts, @hardkas/toolkit (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_3_tx_rpc_sim:FR-003` (Transaction Builder, RPC Transport, Localnet & Simulator (tx-builder, kaspa-rpc, simulator, localnet))
- **Origen**: `Inferred` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/tx-builder/src/generator-plan.ts#L102-L109; packages/accounts/src/signer.ts#L75-L101`
- **Enunciado Original Extraído**: The payment planner and signer must automatically exclude covenant UTXOs from ordinary payment selection and reject any attempt to spend a covenant UTXO in a V0 payment with COVENANT_UTXO_NOT_PAYMENT_INPUT.
- **Enunciado Refinado (`Requirements-Agent`)**: The payment planner and signer must automatically exclude covenant UTXOs from ordinary payment selection and reject any attempt to spend a covenant UTXO in a V0 payment with COVENANT_UTXO_NOT_PAYMENT_INPUT.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-028` — @hardkas/tx-builder (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_3_tx_rpc_sim:FR-004` (Transaction Builder, RPC Transport, Localnet & Simulator (tx-builder, kaspa-rpc, simulator, localnet))
- **Origen**: `Inferred` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/tx-builder/src/v1-plan.ts#L189-L440`
- **Enunciado Original Extraído**: Version-1 transaction plans must validate non-empty inputs and outputs, value conservation, fee ceiling bounds (maxFeeSompi), u16 compute budgets (0 to 65535), covenant group invariants, and zero embedded secrets.
- **Enunciado Refinado (`Requirements-Agent`)**: Version-1 transaction plans must validate non-empty inputs and outputs, value conservation, fee ceiling bounds (maxFeeSompi), u16 compute budgets (0 to 65535), covenant group invariants, and zero embedded secrets.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-029` — @hardkas/tx-builder, @hardkas/sdk (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_3_tx_rpc_sim:FR-005` (Transaction Builder, RPC Transport, Localnet & Simulator (tx-builder, kaspa-rpc, simulator, localnet))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `docs/status/send-routes-security.md#L9; packages/sdk/src/tx.ts#L215-L275`
- **Enunciado Original Extraído**: Every planned payment must enforce a maximum fee ceiling (defaulting to 10,000,000 sompi / 0.1 KAS) and reject node fee-rate estimates exceeding maxFeeRate (default 10,000 sompi/gram) with FEE_RATE_ABOVE_BOUND.
- **Enunciado Refinado (`Requirements-Agent`)**: Every planned payment must enforce a maximum fee ceiling (defaulting to 10,000,000 sompi / 0.1 KAS) and reject node fee-rate estimates exceeding maxFeeRate (default 10,000 sompi/gram) with FEE_RATE_ABOVE_BOUND.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-030` — @hardkas/kaspa-rpc (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_3_tx_rpc_sim:FR-006` (Transaction Builder, RPC Transport, Localnet & Simulator (tx-builder, kaspa-rpc, simulator, localnet))
- **Origen**: `Inferred` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/kaspa-rpc/src/upstream/session.ts#L268-L438; packages/kaspa-rpc/src/json-rpc-client.ts#L419-L488`
- **Enunciado Original Extraído**: The Kaspa RPC client must verify node network identity and sync status (isSynced: true) on connect and right before broadcast, implement a 3-state circuit breaker for reads, and never auto-retry submitTransaction broadcasts.
- **Enunciado Refinado (`Requirements-Agent`)**: The Kaspa RPC client must verify node network identity and sync status (isSynced: true) on connect and right before broadcast, implement a 3-state circuit breaker for reads, and never auto-retry submitTransaction broadcasts.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-031` — @hardkas/kaspa-rpc (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_3_tx_rpc_sim:NFR-001` (Transaction Builder, RPC Transport, Localnet & Simulator (tx-builder, kaspa-rpc, simulator, localnet))
- **Origen**: `Inferred` | **Prioridad**: `Critical` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Reliability`
- **Referencias de Código y Documentación**: `packages/kaspa-rpc/src/upstream/node-websocket-compat.ts#L39-L55`
- **Enunciado Original Extraído**: On Windows Node.js environments, the RPC transport must wrap the ws package WebSocket in GuardedWebSocket to prevent native libuv UV_HANDLE_CLOSING assertion crashes on repeated connection teardown.
- **Enunciado Refinado (`Requirements-Agent`)**: The Windows Node.js RPC transport shall wrap the ws package WebSocket in GuardedWebSocket to achieve 0 native libuv UV_HANDLE_CLOSING assertion crashes during 10,000 consecutive connection teardowns.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-032` — @hardkas/localnet, @hardkas/node-runner, @hardkas/node-orchestrator (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_3_tx_rpc_sim:FR-007` (Transaction Builder, RPC Transport, Localnet & Simulator (tx-builder, kaspa-rpc, simulator, localnet))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/localnet/src/index.ts#L1-L220; packages/node-runner/src/index.ts#L1-L150`
- **Enunciado Original Extraído**: The managed localnet controller shall orchestrate a Dockerized rusty-kaspad v2.1.0 simnet node with container and image digest verification, automated CPU miner coinbase maturity funding, and local UTXO snapshot/restore.
- **Enunciado Refinado (`Requirements-Agent`)**: The managed localnet controller shall orchestrate a Dockerized rusty-kaspad v2.1.0 simnet node with container and image digest verification, automated CPU miner coinbase maturity funding, and local UTXO snapshot/restore.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-033` — @hardkas/simulator (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_3_tx_rpc_sim:NFR-002` (Transaction Builder, RPC Transport, Localnet & Simulator (tx-builder, kaspa-rpc, simulator, localnet))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Performance Efficiency`
- **Referencias de Código y Documentación**: `packages/simulator/src/index.ts#L1-L180; packages/simulator/src/script/vm.ts#L1-L400`
- **Enunciado Original Extraído**: The in-memory simulator shall execute synthetic Kaspa transactions, GHOSTDAG topology approximations, and ScriptVM checks in sub-milliseconds while identifying itself as 2.1.0-kaspa-simulator so it is never mistaken for a real consensus node.
- **Enunciado Refinado (`Requirements-Agent`)**: The in-memory simulator shall execute synthetic Kaspa transactions, GHOSTDAG topology approximations, and ScriptVM checks with a execution latency of ≤ 0.9 ms per operation, and shall return the exact version string '2.1.0-kaspa-simulator' in its node identification handshake.
- **Términos Vagos Detectados**: `['sub-milliseconds']` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-034` — @hardkas/accounts, @hardkas/tx-builder (`PARCIAL`)
- **Lote y ID `Requirements-Agent`**: `batch_3_tx_rpc_sim:TRIAGE_NONE` (Transaction Builder, RPC Transport, Localnet & Simulator (tx-builder, kaspa-rpc, simulator, localnet))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Inspection`
- **Clasificación `Requirements-Agent`**: `Architectural / Process Constraint (Triage: NONE)` -> Categoría ISO/IEC 25010: `Compatibility`
- **Referencias de Código y Documentación**: `docs/status/limitations.md#L258-L269; packages/accounts/src/internal/wasm-rpc-serialization.ts#L12-L18`
- **Enunciado Original Extraído**: Signed V0 payment artifacts currently commit storageMass 0 by design while the node mempool computes and mines the KIP-9 storage mass under the same txId; a future versioned format should align the signed V0 artifact's storageMass field byte-for-byte with the mined transaction.
- **Enunciado Refinado (`Requirements-Agent`)**: Signed V0 payment artifacts currently commit storageMass 0 by design while the node mempool computes and mines the KIP-9 storage mass under the same txId; a future versioned format should align the signed V0 artifact's storageMass field byte-for-byte with the mined transaction.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-035` — @hardkas/simulator (`PARCIAL`)
- **Lote y ID `Requirements-Agent`**: `batch_3_tx_rpc_sim:TRIAGE_NONE` (Transaction Builder, RPC Transport, Localnet & Simulator (tx-builder, kaspa-rpc, simulator, localnet))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Inspection`
- **Clasificación `Requirements-Agent`**: `Architectural / Process Constraint (Triage: NONE)` -> Categoría ISO/IEC 25010: `Reliability`
- **Referencias de Código y Documentación**: `docs/status/limitations.md#L216-L249`
- **Enunciado Original Extraído**: The in-memory simulator is an approximate model where OpZkPrecompile and OpChainblockSeqCommit fail closed and block-level WrongMass commitment has no real-node vector; consensus-critical covenants and timelocks must be verified on Docker simnet.
- **Enunciado Refinado (`Requirements-Agent`)**: The in-memory simulator is an approximate model where OpZkPrecompile and OpChainblockSeqCommit fail closed and block-level WrongMass commitment has no real-node vector; consensus-critical covenants and timelocks must be verified on Docker simnet.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-036` — @hardkas/localnet, @hardkas/cli (`PARCIAL`)
- **Lote y ID `Requirements-Agent`**: `batch_3_tx_rpc_sim:NFR-003` (Transaction Builder, RPC Transport, Localnet & Simulator (tx-builder, kaspa-rpc, simulator, localnet))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Reliability`
- **Referencias de Código y Documentación**: `merchant-compatibility-failures.md#L171-L177`
- **Enunciado Original Extraído**: Background localnet CPU mining should enforce a bounded block cap or target balance watchdog so unbounded mining over many hours does not accumulate hundreds of thousands of UTXOs and exceed the 100 MiB WebSocket frame limit on getUtxosByAddresses.
- **Enunciado Refinado (`Requirements-Agent`)**: The background localnet CPU mining module shall enforce a bounded block cap or target balance watchdog to ensure UTXO accumulation never exceeds 50,000 items and `getUtxosByAddresses` WebSocket payloads remain strictly ≤ 100 MiB during continuous 24-hour mining operations.
- **Términos Vagos Detectados**: `['many hours', 'hundreds of thousands']` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-037` — @hardkas/sdk (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_4_sdk_silver_zk:FR-001` (SDK Composition, SilverScript Covenants & Zero-Knowledge (sdk, escrow, bridge-local))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `docs/status/send-routes-security.md#L15-L65; packages/sdk/src/tx.ts#L450-L980`
- **Enunciado Original Extraído**: The SDK tx.send method must verify that the signed transaction matches its workspace plan (SIGNED_PLAN_MISMATCH), enforce idempotent submission (ALREADY_SUBMITTED) by checking node mempool and virtual chain before broadcast, and support optional preflight signature and input verification.
- **Enunciado Refinado (`Requirements-Agent`)**: The SDK tx.send method must verify that the signed transaction matches its workspace plan (SIGNED_PLAN_MISMATCH), enforce idempotent submission (ALREADY_SUBMITTED) by checking node mempool and virtual chain before broadcast, and support optional preflight signature and input verification.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-038` — @hardkas/sdk, @hardkas/core (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_4_sdk_silver_zk:FR-002` (SDK Composition, SilverScript Covenants & Zero-Knowledge (sdk, escrow, bridge-local))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/core/src/silver-compiler.ts#L1-L220; packages/sdk/src/silver.ts#L1-L310`
- **Enunciado Original Extraído**: The SilverScript integration shall compile contracts using the managed silverc v1.0.0 binary, validate canonical ABI types, compute P2SH lock and unlock scripts, and verify byte-for-byte artifact reproducibility.
- **Enunciado Refinado (`Requirements-Agent`)**: The SilverScript integration shall compile contracts using the managed silverc v1.0.0 binary, validate canonical ABI types, compute P2SH lock and unlock scripts, and verify byte-for-byte artifact reproducibility.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-039` — @hardkas/sdk, @hardkas/accounts (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_4_sdk_silver_zk:FR-003` (SDK Composition, SilverScript Covenants & Zero-Knowledge (sdk, escrow, bridge-local))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/accounts/src/silver-covenant.ts#L1-L260; packages/sdk/src/covenant-lineage.ts#L1-L280`
- **Enunciado Original Extraído**: The covenant engine shall build Toccata V1 genesis and 1:1 auth-bound state transition transactions, iteratively converge V1 compute-budget fee floors, and reconstruct historical covenant lineage from workspace artifacts.
- **Enunciado Refinado (`Requirements-Agent`)**: The covenant engine shall build Toccata V1 genesis and 1:1 auth-bound state transition transactions, iteratively converge V1 compute-budget fee floors, and reconstruct historical covenant lineage from workspace artifacts.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-040` — @hardkas/sdk (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_4_sdk_silver_zk:NFR-001` (SDK Composition, SilverScript Covenants & Zero-Knowledge (sdk, escrow, bridge-local))
- **Origen**: `Inferred` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Performance Efficiency`
- **Referencias de Código y Documentación**: `packages/sdk/src/zk/groth16-verifier.ts#L156-L800`
- **Enunciado Original Extraído**: The off-chain Groth16 verifier must validate BN254 field elements, curve membership, G2 subgroup membership, weak verification-key trapdoor heuristics, and verification-key fingerprint anchoring inside an isolated child process with a 15-second timeout and concurrency cap of 4.
- **Enunciado Refinado (`Requirements-Agent`)**: The off-chain Groth16 verifier shall validate BN254 field elements, curve membership, G2 subgroup membership, verification-key trapdoor heuristics, and fingerprint anchoring within an isolated child process, enforcing a strict timeout of ≤ 15.0 seconds and a maximum concurrency cap of 4 simultaneous processes.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-041` — @hardkas/sdk (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_4_sdk_silver_zk:FR-004` (SDK Composition, SilverScript Covenants & Zero-Knowledge (sdk, escrow, bridge-local))
- **Origen**: `Inferred` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/sdk/src/zk/toccata.ts#L52-L100; packages/sdk/src/zk/toccata.ts#L758-L1600`
- **Enunciado Original Extraído**: The Toccata RISC Zero Groth16 builder must cross-check the receipt claim digest against (imageId, journalHash), enforce computeBudget >= 1550 and computeMass <= 500,000, and in proof-and-output-bound mode enforce output count, recipient SPKs, exact amounts, single input, and maxFeeSompi via L1 introspection opcodes.
- **Enunciado Refinado (`Requirements-Agent`)**: The Toccata RISC Zero Groth16 builder must cross-check the receipt claim digest against (imageId, journalHash), enforce computeBudget >= 1550 and computeMass <= 500,000, and in proof-and-output-bound mode enforce output count, recipient SPKs, exact amounts, single input, and maxFeeSompi via L1 introspection opcodes.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-042` — @hardkas/sdk (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_4_sdk_silver_zk:FR-005` (SDK Composition, SilverScript Covenants & Zero-Knowledge (sdk, escrow, bridge-local))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `docs/status/limitations.md#L396-L444; packages/sdk/src/waiters.ts#L1-L320`
- **Enunciado Original Extraído**: When waiting for a transaction accepted before the wait cursor (tx wait --address), the SDK shall walk backward along the node's selected parent chain up to a bounded lookback limit (default 1000, max 10000 blocks) and scan the virtual chain forward to confirm acceptance.
- **Enunciado Refinado (`Requirements-Agent`)**: When waiting for a transaction accepted before the wait cursor (tx wait --address), the SDK shall walk backward along the node's selected parent chain up to a bounded lookback limit (default 1000, max 10000 blocks) and scan the virtual chain forward to confirm acceptance.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-043` — @hardkas/escrow, @hardkas/cli (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_4_sdk_silver_zk:FR-006` (SDK Composition, SilverScript Covenants & Zero-Knowledge (sdk, escrow, bridge-local))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/escrow/src/index.ts#L1-L180; docs/status/send-routes-security.md#L19`
- **Enunciado Original Extraído**: The escrow package and rescue-v1 flow shall generate 2-of-3 multisig and dispute-timeout SilverScript escrow contracts and verify destination, amounts, outpoint, network, and a 500,000 sompi fee cap before signing or broadcasting.
- **Enunciado Refinado (`Requirements-Agent`)**: The escrow package and rescue-v1 flow shall generate 2-of-3 multisig and dispute-timeout SilverScript escrow contracts and verify destination, amounts, outpoint, network, and a 500,000 sompi fee cap before signing or broadcasting.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-044` — @hardkas/bridge-local (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_4_sdk_silver_zk:FR-007` (SDK Composition, SilverScript Covenants & Zero-Knowledge (sdk, escrow, bridge-local))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/bridge-local/src/index.ts#L1-L150`
- **Enunciado Original Extraído**: The bridge-local package shall serialize and deserialize L1-to-L2 bridge entry payloads and simulate deterministic prefix mining for local bridge laboratory workflows.
- **Enunciado Refinado (`Requirements-Agent`)**: The bridge-local package shall serialize and deserialize L1-to-L2 bridge entry payloads and simulate deterministic prefix mining for local bridge laboratory workflows.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-045` — @hardkas/sdk (`INCUMPLIDO`)
- **Lote y ID `Requirements-Agent`**: `batch_4_sdk_silver_zk:FR-008` (SDK Composition, SilverScript Covenants & Zero-Knowledge (sdk, escrow, bridge-local))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/sdk/src/covenants.ts#L494-L516`
- **Enunciado Original Extraído**: The deprecated SDK methods HardkasCovenants.planDeploy and HardkasCovenants.planSpend currently throw COVENANT_PLAN_UNSUPPORTED at runtime and should be either implemented or removed from the public SDK surface.
- **Enunciado Refinado (`Requirements-Agent`)**: The deprecated SDK methods HardkasCovenants.planDeploy and HardkasCovenants.planSpend currently throw COVENANT_PLAN_UNSUPPORTED at runtime and should be either implemented or removed from the public SDK surface.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-046` — @hardkas/sdk (`PARCIAL`)
- **Lote y ID `Requirements-Agent`**: `batch_4_sdk_silver_zk:FR-009` (SDK Composition, SilverScript Covenants & Zero-Knowledge (sdk, escrow, bridge-local))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `docs/status/limitations.md#L140-L147; packages/sdk/src/zk/toccata.ts#L248-L280; packages/sdk/src/zk/toccata.ts#L979-L985`
- **Enunciado Original Extraído**: Because a P2SH redeem script cannot commit to its own funding outpoint (ZK_UTXO_BINDING_UNSATISFIABLE) and does not parse the HKZ1 journal on-chain, repeated identical funding of a proof-and-output-bound ZK P2SH address should be protected against receipt replay by composing a Toccata V1 stateful covenant.
- **Enunciado Refinado (`Requirements-Agent`)**: Because a P2SH redeem script cannot commit to its own funding outpoint (ZK_UTXO_BINDING_UNSATISFIABLE) and does not parse the HKZ1 journal on-chain, repeated identical funding of a proof-and-output-bound ZK P2SH address should be protected against receipt replay by composing a Toccata V1 stateful covenant.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-047` — @hardkas/pskt-native, @hardkas/sdk (`INCUMPLIDO`)
- **Lote y ID `Requirements-Agent`**: `batch_4_sdk_silver_zk:NFR-002` (SDK Composition, SilverScript Covenants & Zero-Knowledge (sdk, escrow, bridge-local))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Inspection`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Compatibility`
- **Referencias de Código y Documentación**: `docs/status/limitations.md#L289-L314; packages/pskt-native/package.json`
- **Enunciado Original Extraído**: The native PSKT addon (@hardkas/pskt-native) is currently on hold, built against rusty-kaspa 2.0.1 for win32-x64 only with an empty index.d.ts and no binary provenance hash, and must remain unpublished until upgraded to rusty-kaspa 2.1.0 across all supported platforms.
- **Enunciado Refinado (`Requirements-Agent`)**: The native PSKT addon (@hardkas/pskt-native) shall remain unpublished until upgraded to dependency rusty-kaspa 2.1.0 across all supported target platforms (win32-x64, linux-x64, darwin-x64/arm64) with a complete index.d.ts type definition and a verified cryptographic binary provenance hash; furthermore, real-node SilverScript deploy/spend execution via the high-level SDK and testnet-10 certification for multi-input N:M covenant topologies shall be fully implemented.
- **Términos Vagos Detectados**: `['on hold', 'should be completed']` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-048` — @hardkas/sdk (`PARCIAL`)
- **Lote y ID `Requirements-Agent`**: `batch_4_sdk_silver_zk:TRIAGE_NONE` (SDK Composition, SilverScript Covenants & Zero-Knowledge (sdk, escrow, bridge-local))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Inspection`
- **Clasificación `Requirements-Agent`**: `Architectural / Process Constraint (Triage: NONE)` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `README.md#L179-L181; docs/status/limitations.md#L178-L182`
- **Enunciado Original Extraído**: Real-node SilverScript deploy/spend execution via the high-level SDK surface (SDK_SILVER_REAL_LIFECYCLE_UNSUPPORTED) and testnet-10 certification for multi-input N:M covenant topologies should be completed beyond the current CLI localnet baseline.
- **Enunciado Refinado (`Requirements-Agent`)**: Real-node SilverScript deploy/spend execution via the high-level SDK surface (SDK_SILVER_REAL_LIFECYCLE_UNSUPPORTED) and testnet-10 certification for multi-input N:M covenant topologies should be completed beyond the current CLI localnet baseline.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-049` — @hardkas/query-store, @hardkas/query (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_5_extensions_storage:FR-001` (Extensions, Query Store, Toolkit, Jobs & L2 (query, query-store, toolkit, jobs, l2, plugins, storage))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `.agents/AGENTS.md#L135-L136; docs/status/limitations.md#L63-L73; packages/query-store/src/index.ts#L1-L200`
- **Enunciado Original Extraído**: The SQLite query-store must operate strictly as a read-only rebuildable projection over the authoritative filesystem artifacts and event ledgers, providing sync, doctor drift detection, and full rebuild capabilities.
- **Enunciado Refinado (`Requirements-Agent`)**: The SQLite query-store must operate strictly as a read-only rebuildable projection over the authoritative filesystem artifacts and event ledgers, providing sync, doctor drift detection, and full rebuild capabilities.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-050` — @hardkas/toolkit (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_5_extensions_storage:FR-002` (Extensions, Query Store, Toolkit, Jobs & L2 (query, query-store, toolkit, jobs, l2, plugins, storage))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/toolkit/src/index.ts#L1-L120; benchmarks/utxo.bench.ts#L1-L104`
- **Enunciado Original Extraído**: The toolkit package shall provide high-throughput UTXO coin control, dust analysis, batch payment splitting, consolidation planning, invoice tracking, and local state snapshots capable of indexing up to 50,000 UTXOs in memory.
- **Enunciado Refinado (`Requirements-Agent`)**: The toolkit package shall provide high-throughput UTXO coin control, dust analysis, batch payment splitting, consolidation planning, invoice tracking, and local state snapshots capable of indexing up to 50,000 UTXOs in memory.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-051` — @hardkas/toolkit (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_5_extensions_storage:FR-003` (Extensions, Query Store, Toolkit, Jobs & L2 (query, query-store, toolkit, jobs, l2, plugins, storage))
- **Origen**: `Inferred` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/toolkit/src/wallet.ts#L58-L67; packages/toolkit/src/wallet.ts#L190-L240`
- **Enunciado Original Extraído**: Because WalletToolkit uses deterministic synthetic keys derived from the wallet name, it must block wallet creation, address derivation, and spending on any network other than simnet using WALLET_SYNTHETIC_NETWORK_BLOCKED.
- **Enunciado Refinado (`Requirements-Agent`)**: Because WalletToolkit uses deterministic synthetic keys derived from the wallet name, it must block wallet creation, address derivation, and spending on any network other than simnet using WALLET_SYNTHETIC_NETWORK_BLOCKED.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-052` — @hardkas/jobs, @hardkas/toolkit (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_5_extensions_storage:FR-004` (Extensions, Query Store, Toolkit, Jobs & L2 (query, query-store, toolkit, jobs, l2, plugins, storage))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/jobs/src/index.ts#L1-L180; benchmarks/jobs.bench.ts#L1-L67`
- **Enunciado Original Extraído**: The jobs package shall execute asynchronous background tasks with durable checkpoint persistence, progress reporting, and configurable retry backoff policies.
- **Enunciado Refinado (`Requirements-Agent`)**: The jobs package shall execute asynchronous background tasks with durable checkpoint persistence, progress reporting, and configurable retry backoff policies.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-053` — @hardkas/l2, @hardkas/ext-l2 (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_5_extensions_storage:FR-005` (Extensions, Query Store, Toolkit, Jobs & L2 (query, query-store, toolkit, jobs, l2, plugins, storage))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `docs/status/limitations.md#L49; packages/l2/src/network-guard.ts#L1-L140`
- **Enunciado Original Extraído**: The L2 client and CLI extension must block all connections and writes to Igra mainnet (chain ID 38833 or any mainnet-marked profile) with MAINNET_CONNECTION_DISABLED and L2_MAINNET_WRITE_BLOCKED regardless of caller flags.
- **Enunciado Refinado (`Requirements-Agent`)**: The L2 client and CLI extension must block all connections and writes to Igra mainnet (chain ID 38833 or any mainnet-marked profile) with MAINNET_CONNECTION_DISABLED and L2_MAINNET_WRITE_BLOCKED regardless of caller flags.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-054` — @hardkas/toolkit (`INCUMPLIDO`)
- **Lote y ID `Requirements-Agent`**: `batch_5_extensions_storage:FR-006` (Extensions, Query Store, Toolkit, Jobs & L2 (query, query-store, toolkit, jobs, l2, plugins, storage))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `docs/status/send-routes-security.md#L69; packages/toolkit/src/wallet.ts#L435-L441`
- **Enunciado Original Extraído**: WalletToolkit.signAndBroadcast must call assertBroadcastNodeSynced to verify that the target node reports isSynced: true before planning, signing, or broadcasting a transaction (currently omitted in verifySpendNetwork).
- **Enunciado Refinado (`Requirements-Agent`)**: WalletToolkit.signAndBroadcast must call assertBroadcastNodeSynced to verify that the target node reports isSynced: true before planning, signing, or broadcasting a transaction (currently omitted in verifySpendNetwork).
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-055` — @hardkas/toolkit, @hardkas/accounts (`INCUMPLIDO`)
- **Lote y ID `Requirements-Agent`**: `batch_5_extensions_storage:FR-007` (Extensions, Query Store, Toolkit, Jobs & L2 (query, query-store, toolkit, jobs, l2, plugins, storage))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/toolkit/src/wallet.ts#L156-L201; packages/toolkit/src/wallet.ts#L362-L373`
- **Enunciado Original Extraído**: WalletToolkit should replace its legacy name-derived synthetic identity with real encrypted BIP-39/BIP-32 HD keystores from @hardkas/accounts and remove the deprecated throwing planSend and dummy sendSimulated stubs.
- **Enunciado Refinado (`Requirements-Agent`)**: WalletToolkit should replace its legacy name-derived synthetic identity with real encrypted BIP-39/BIP-32 HD keystores from @hardkas/accounts and remove the deprecated throwing planSend and dummy sendSimulated stubs.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-056` — @hardkas/query-store (`INCUMPLIDO`)
- **Lote y ID `Requirements-Agent`**: `batch_5_extensions_storage:FR-008` (Extensions, Query Store, Toolkit, Jobs & L2 (query, query-store, toolkit, jobs, l2, plugins, storage))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `packages/query-store/src/projection-store.ts#L35-L40`
- **Enunciado Original Extraído**: ProjectionStoreJson.setAll in @hardkas/query-store must use writeFileAtomicSync with fsyncSync, Windows EPERM rename retries, and LOCK_ORDER.index lock acquisition instead of writing directly to a fixed .tmp filename.
- **Enunciado Refinado (`Requirements-Agent`)**: ProjectionStoreJson.setAll in @hardkas/query-store must use writeFileAtomicSync with fsyncSync, Windows EPERM rename retries, and LOCK_ORDER.index lock acquisition instead of writing directly to a fixed .tmp filename.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-057` — @hardkas/plugin-rpc-backend (`PARCIAL`)
- **Lote y ID `Requirements-Agent`**: `batch_5_extensions_storage:NFR-001` (Extensions, Query Store, Toolkit, Jobs & L2 (query, query-store, toolkit, jobs, l2, plugins, storage))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Reliability`
- **Referencias de Código y Documentación**: `docs/status/limitations.md#L451-L457; packages/plugin-rpc-backend/src/resilience.ts#L1-L130`
- **Enunciado Original Extraído**: The @hardkas/plugin-rpc-backend package should implement connection pooling, automatic reconnect on WebSocket drop, and randomized retry jitter before being promoted from private workspace status to a published package.
- **Enunciado Refinado (`Requirements-Agent`)**: The @hardkas/plugin-rpc-backend package shall implement connection pooling with a maximum pool size of 50, automatic WebSocket reconnection within ≤ 2 seconds of drop, and randomized retry jitter with a range of 100-500 ms prior to package publication.
- **Términos Vagos Detectados**: `['automatic reconnect', 'randomized retry jitter']` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-058` — @hardkas/storage-postgres, @hardkas/storage-sqlite, @hardkas/plugin-local-indexer, @hardkas/simulator-adapters, @hardkas/wallet-adapter, @hardkas/sync-daemon (`SIN EVIDENCIA`)
- **Lote y ID `Requirements-Agent`**: `batch_5_extensions_storage:NFR-002` (Extensions, Query Store, Toolkit, Jobs & L2 (query, query-store, toolkit, jobs, l2, plugins, storage))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Analysis`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Maintainability`
- **Referencias de Código y Documentación**: `PUBLIC_API_SURFACE.md#L38-L52; docs/status/versioning.md#L108-L128`
- **Enunciado Original Extraído**: The internal storage and adapter packages (@hardkas/storage-postgres, @hardkas/storage-sqlite, @hardkas/plugin-local-indexer, @hardkas/simulator-adapters) currently have 0 dedicated unit test files and should be covered by automated tests before publication.
- **Enunciado Refinado (`Requirements-Agent`)**: The internal storage and adapter packages (@hardkas/storage-postgres, @hardkas/storage-sqlite, @hardkas/plugin-local-indexer, @hardkas/simulator-adapters) shall achieve a minimum of 80% code line coverage with automated unit tests prior to package publication.
- **Términos Vagos Detectados**: `['covered by automated tests']` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-059` — @hardkas/ext-l2, @hardkas/cli (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_5_extensions_storage:FR-009` (Extensions, Query Store, Toolkit, Jobs & L2 (query, query-store, toolkit, jobs, l2, plugins, storage))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `docs/status/versioning.md#L111; packages/cli/src/commands/extension.ts#L1-L160`
- **Enunciado Original Extraído**: Installing the unpublished L2 extension from a remote package registry must be refused with EXTENSION_NOT_PUBLISHED before any package manager runs, allowing installation only from a local tarball verified by an explicit --sha256 digest.
- **Enunciado Refinado (`Requirements-Agent`)**: Installing the unpublished L2 extension from a remote package registry must be refused with EXTENSION_NOT_PUBLISHED before any package manager runs, allowing installation only from a local tarball verified by an explicit --sha256 digest.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-060` — @hardkas/testnet-qualification, labs/testnet-runner (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_5_extensions_storage:NFR-003` (Extensions, Query Store, Toolkit, Jobs & L2 (query, query-store, toolkit, jobs, l2, plugins, storage))
- **Origen**: `Explicit` | **Prioridad**: `Critical` | **Método de Verificación**: `Inspection`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Security`
- **Referencias de Código y Documentación**: `packages/testnet-qualification/src/index.ts#L1-L180; labs/testnet-runner/test/no-public-funding.test.ts#L1-L60`
- **Enunciado Original Extraído**: The internal testnet qualification runner shall enforce fail-closed UTXO reservations, ambiguity-guarded transaction submissions, secret-redacted receipts, and zero automated public faucet or funding requests.
- **Enunciado Refinado (`Requirements-Agent`)**: The internal testnet qualification runner shall enforce fail-closed UTXO reservation handling upon resource contention, reject ambiguous transaction submissions with a non-zero error code, redact all known private keys and secrets from generated logs and receipts, and maintain a hard limit of zero automated public faucet or funding requests.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-061` — @hardkas/cli (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_6_cli_devserver_ci_quality:FR-001` (CLI, Dev-Server, Testing, Supply Chain & CI/CD (cli, dev-server, client, react, testing, scripts, .github))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `README.md#L261-L266; docs/status/versioning.md#L134-L137; packages/cli/src/index.ts#L1-L250`
- **Enunciado Original Extraído**: Every CLI command description in hardkas --help must explicitly state its maturity level (stable, preview, alpha, experimental, research, or internal) and support structured --json output for machine consumption.
- **Enunciado Refinado (`Requirements-Agent`)**: Every CLI command description in hardkas --help must explicitly state its maturity level (stable, preview, alpha, experimental, research, or internal) and support structured --json output for machine consumption.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-062` — @hardkas/dev-server (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_6_cli_devserver_ci_quality:NFR-001` (CLI, Dev-Server, Testing, Supply Chain & CI/CD (cli, dev-server, client, react, testing, scripts, .github))
- **Origen**: `Inferred` | **Prioridad**: `Critical` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Security`
- **Referencias de Código y Documentación**: `packages/dev-server/src/server.ts#L44-L204; packages/dev-server/src/server.ts#L272-L282`
- **Enunciado Original Extraído**: The local dev-server must bind to 127.0.0.1 by default, validate Host headers against DNS rebinding, restrict CORS to localhost origins, require a 32-byte random Bearer token on /api/* routes, enforce X-Hardkas-Request: true on state-changing methods, and set Cache-Control: no-store.
- **Enunciado Refinado (`Requirements-Agent`)**: The local dev-server shall bind exclusively to 127.0.0.1 by default, validate Host headers against DNS rebinding, restrict CORS headers to localhost origins, enforce a 32-byte cryptographically random Bearer token on all /api/* routes, require the header X-Hardkas-Request: true on all state-changing HTTP methods, and respond with Cache-Control: no-store.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-063` — @hardkas/dev-server (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_6_cli_devserver_ci_quality:FR-002` (CLI, Dev-Server, Testing, Supply Chain & CI/CD (cli, dev-server, client, react, testing, scripts, .github))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `docs/status/send-routes-security.md#L20; docs/status/send-routes-security.md#L45; packages/dev-server/src/server.ts#L1-L310`
- **Enunciado Original Extraído**: Dev-server automatic signing with development accounts must be disabled by default (DEV_AUTOSIGN_NOT_ALLOWED) unless HARDKAS_DEV_SERVER_AUTOSIGN=1 is set in the server environment, and must refuse any non-loopback or non-simnet network.
- **Enunciado Refinado (`Requirements-Agent`)**: Dev-server automatic signing with development accounts must be disabled by default (DEV_AUTOSIGN_NOT_ALLOWED) unless HARDKAS_DEV_SERVER_AUTOSIGN=1 is set in the server environment, and must refuse any non-loopback or non-simnet network.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-064` — All 35 workspace packages (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_6_cli_devserver_ci_quality:NFR-002` (CLI, Dev-Server, Testing, Supply Chain & CI/CD (cli, dev-server, client, react, testing, scripts, .github))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Inspection`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `scripts/check-release-tarballs.mjs#L54-L66; scripts/check-release-tarballs.mjs#L247-L560`
- **Enunciado Original Extraído**: The release tarball gate must verify that only the 22 approved MIT packages are published, that all 14 held-back packages remain private, and that packed tarballs contain zero workspace:* references, zero install scripts, zero private paths, and zero unreferenced dist files.
- **Enunciado Refinado (`Requirements-Agent`)**: The release tarball verification gate shall validate that exactly 22 approved MIT-licensed packages are published, 14 held-back packages remain private, and packed tarballs contain 0 workspace:* references, 0 install scripts, 0 private paths, and 0 unreferenced distribution files.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-065` — All 22 published packages (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_6_cli_devserver_ci_quality:NFR-003` (CLI, Dev-Server, Testing, Supply Chain & CI/CD (cli, dev-server, client, react, testing, scripts, .github))
- **Origen**: `Explicit` | **Prioridad**: `High` | **Método de Verificación**: `Inspection`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Compatibility`
- **Referencias de Código y Documentación**: `scripts/check-licenses.mjs#L1-L341; docs/status/dependency-licenses.md#L1-L60`
- **Enunciado Original Extraído**: The offline license gate must verify that the required production dependency tree of all 22 published packages contains zero GPL, AGPL, LGPL, or unknown licenses, keeping snarkjs (GPL-3.0) strictly as an optional peer dependency.
- **Enunciado Refinado (`Requirements-Agent`)**: The offline license verification gate shall verify that the production dependency tree of all 22 published packages contains 0 GPL, AGPL, LGPL, or unknown licenses, and shall restrict snarkjs (GPL-3.0) exclusively to an optional peer dependency.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-066` — @hardkas/testing, scripts (`VERIFICADO`)
- **Lote y ID `Requirements-Agent`**: `batch_6_cli_devserver_ci_quality:NFR-004` (CLI, Dev-Server, Testing, Supply Chain & CI/CD (cli, dev-server, client, react, testing, scripts, .github))
- **Origen**: `Inferred` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Reliability`
- **Referencias de Código y Documentación**: `scripts/gate-hermetic.mjs#L1-L107; scripts/hermetic/no-network-preload.cjs#L1-L80`
- **Enunciado Original Extraído**: The hermetic test gate must execute with an isolated HARDKAS_HOME, block all non-loopback network connections via no-network-preload.cjs, and refuse loopback connections to canonical Kaspa wRPC ports 16210, 17210, 18210, and 18211.
- **Enunciado Refinado (`Requirements-Agent`)**: The hermetic test gate shall execute with an isolated HARDKAS_HOME environment variable, block 100% of non-loopback network connections via no-network-preload.cjs, and reject all loopback connections targeting Kaspa wRPC ports 16210, 17210, 18210, and 18211.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-067` — @hardkas/dev-server (`INCUMPLIDO`)
- **Lote y ID `Requirements-Agent`**: `batch_6_cli_devserver_ci_quality:NFR-005` (CLI, Dev-Server, Testing, Supply Chain & CI/CD (cli, dev-server, client, react, testing, scripts, .github))
- **Origen**: `Recommended` | **Prioridad**: `Medium` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Performance Efficiency`
- **Referencias de Código y Documentación**: `packages/dev-server/src/server.ts#L74-L205`
- **Enunciado Original Extraído**: The @hardkas/dev-server HTTP API should implement request rate limiting on /api/* endpoints to prevent local brute-force or denial-of-service floods, especially when --unsafe-external is enabled.
- **Enunciado Refinado (`Requirements-Agent`)**: The @hardkas/dev-server HTTP API shall enforce a rate limit of ≤ 60 requests per minute per IP address on all /api/* endpoints when --unsafe-external is enabled.
- **Términos Vagos Detectados**: `['prevent local brute-force or denial-of-service floods', 'especially when']` | **Riesgo de Alucinación**: `Medium`

### `HK-REQ-068` — @hardkas/client, @hardkas/react (`INCUMPLIDO`)
- **Lote y ID `Requirements-Agent`**: `batch_6_cli_devserver_ci_quality:FR-003` (CLI, Dev-Server, Testing, Supply Chain & CI/CD (cli, dev-server, client, react, testing, scripts, .github))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `docs/status/versioning.md#L116-L117; packages/client/src/index.ts#L1-L60`
- **Enunciado Original Extraído**: The @hardkas/client and @hardkas/react packages currently have 0% test coverage and @hardkas/client cannot send the dev-server Bearer authentication token required by /api/*; both must remain private until Bearer token support and unit tests are added.
- **Enunciado Refinado (`Requirements-Agent`)**: The @hardkas/client and @hardkas/react packages currently have 0% test coverage and @hardkas/client cannot send the dev-server Bearer authentication token required by /api/*; both must remain private until Bearer token support and unit tests are added.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-069` — All workspace packages (`INCUMPLIDO`)
- **Lote y ID `Requirements-Agent`**: `batch_6_cli_devserver_ci_quality:NFR-006` (CLI, Dev-Server, Testing, Supply Chain & CI/CD (cli, dev-server, client, react, testing, scripts, .github))
- **Origen**: `Recommended` | **Prioridad**: `Medium` | **Método de Verificación**: `Analysis`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Maintainability`
- **Referencias de Código y Documentación**: `scripts/check-typescript-hygiene.mjs#L1-L90; docs/status/release-claims.md#L82`
- **Enunciado Original Extraído**: The codebase should replace the remaining catch (e: any) clauses (flagged by scripts/check-typescript-hygiene.mjs with 2,448 total any occurrences across packages) with typed catch (e: unknown) error handling.
- **Enunciado Refinado (`Requirements-Agent`)**: The codebase shall replace 100% of catch (e: any) clauses across all packages with typed catch (e: unknown) error handling, reducing flagged occurrences to 0 as verified by scripts/check-typescript-hygiene.mjs.
- **Términos Vagos Detectados**: `['should']` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-070` — docs, scripts (`INCUMPLIDO`)
- **Lote y ID `Requirements-Agent`**: `batch_6_cli_devserver_ci_quality:NFR-007` (CLI, Dev-Server, Testing, Supply Chain & CI/CD (cli, dev-server, client, react, testing, scripts, .github))
- **Origen**: `Recommended` | **Prioridad**: `Medium` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Maintainability`
- **Referencias de Código y Documentación**: `scripts/docs-check.mjs#L1-L120; docs/community/rc-0.13.0-rc.1/EVIDENCE_INDEX.md; docs/internal/audit/surface-2026-11-09/inventario.md`
- **Enunciado Original Extraído**: All internal and community markdown documentation files must pass scripts/docs-check.mjs with zero broken relative links or local C:\Users\... filesystem references (4 broken links currently cause pnpm docs:check to fail).
- **Enunciado Refinado (`Requirements-Agent`)**: All internal and community markdown documentation files shall pass scripts/docs-check.mjs with exactly 0 broken relative links and 0 local filesystem references matching C:\Users\...
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `Low`

### `HK-REQ-071` — @hardkas/artifacts, scripts (`INCUMPLIDO`)
- **Lote y ID `Requirements-Agent`**: `batch_6_cli_devserver_ci_quality:FR-004` (CLI, Dev-Server, Testing, Supply Chain & CI/CD (cli, dev-server, client, react, testing, scripts, .github))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Functional Requirement` -> Categoría ISO/IEC 25010: `Functional Suitability`
- **Referencias de Código y Documentación**: `package.json#L60-L61; scripts/check-artifact-fixtures.mjs#L1-L90`
- **Enunciado Original Extraído**: The valid artifact fixture gate (pnpm check:artifacts / packages/artifacts/test/fixtures/valid) must be populated with current hashVersion 5 valid fixtures so that check-artifact-fixtures.mjs does not fail with an empty corpus error.
- **Enunciado Refinado (`Requirements-Agent`)**: The valid artifact fixture gate (pnpm check:artifacts / packages/artifacts/test/fixtures/valid) must be populated with current hashVersion 5 valid fixtures so that check-artifact-fixtures.mjs does not fail with an empty corpus error.
- **Términos Vagos Detectados**: `[]` | **Riesgo de Alucinación**: `N/A`

### `HK-REQ-072` — @hardkas/cli, @hardkas/sdk, .github/workflows (`PARCIAL`)
- **Lote y ID `Requirements-Agent`**: `batch_6_cli_devserver_ci_quality:NFR-008` (CLI, Dev-Server, Testing, Supply Chain & CI/CD (cli, dev-server, client, react, testing, scripts, .github))
- **Origen**: `Recommended` | **Prioridad**: `High` | **Método de Verificación**: `Test`
- **Clasificación `Requirements-Agent`**: `Non-Functional Requirement` -> Categoría ISO/IEC 25010: `Reliability`
- **Referencias de Código y Documentación**: `docs/status/limitations.md#L315-L364; PUBLIC_API_SURFACE.md#L12-L53`
- **Enunciado Original Extraído**: The 11 skipped [known gap] tests documented in limitations.md should be resolved, Windows 8.3 short temp paths (~) should be normalized via fs.realpathSync.native in the CLI test runner, and public API test coverage should be expanded beyond 35.2% (500 of 1,422 symbols).
- **Enunciado Refinado (`Requirements-Agent`)**: The system shall resolve all 11 skipped [known gap] tests in limitations.md, normalize Windows 8.3 short temp paths (~) using fs.realpathSync.native in the CLI test runner, and achieve a public API test coverage of ≥ 50.0% (at least 711 of 1,422 symbols).
- **Términos Vagos Detectados**: `['should be resolved', 'should be normalized']` | **Riesgo de Alucinación**: `Low`

