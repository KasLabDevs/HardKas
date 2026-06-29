# Kaspa App Surface Map (P27)

Este documento mapea la superficie de aplicaciones que se pueden construir en el ecosistema Kaspa y evalúa cómo HardKAS puede dar soporte a cada una.

## 1. Wallets
* **Qué tipo de apps se pueden construir:** Wallet backends, wallet CLIs, integraciones de custodia, multi-sig vaults.
* **Qué necesita un builder:** Gestión de HD keys, balance aggregation, tx history, fee estimation, UTXO selection (coin control).
* **Qué ya cubre HardKAS:** Deploy de scripts simples (SilverScript), mocking de keys (`@hardkas/keys`), signing de txs básicas.
* **Qué falta:** Indexación de historial de txs por address, coin control avanzado en el SDK, listeners de balance en real-time.
* **Qué debe ser SDK helper:** `CoinSelector`, `FeeEstimator`, `AddressManager`.
* **Qué debe ser plugin:** `hardkas-indexer-plugin` (para simular el indexer local).
* **Qué debe ser template:** `wallet-backend-template` (Node.js).
* **Qué debe ser example:** `examples/simple-wallet`.
* **Qué debe quedar fuera de scope:** Frontend UI/UX, hardware wallet USB drivers.

## 2. Indexers
* **Qué tipo de apps se pueden construir:** Exploradores locales, query APIs personalizadas, dashboards de red.
* **Qué necesita un builder:** Escuchar DAG events, guardar bloques/txs en DB, proyectar saldos, exponer GraphQL/REST.
* **Qué ya cubre HardKAS:** `query-store` básico, mock network.
* **Qué falta:** Block/DAG model real en la red local, simulación de block templates, webhooks de nuevos bloques.
* **Qué debe ser SDK helper:** DAG parsers, block decoders.
* **Qué debe ser plugin:** `hardkas-subgraph` o `hardkas-indexer-sync`.
* **Qué debe ser template:** `indexer-graphql-template`.
* **Qué debe ser example:** `examples/local-explorer`.
* **Qué debe quedar fuera de scope:** Producción de indexers pesados a escala global (ej. KGI scale).

## 3. Payments
* **Qué tipo de apps se pueden construir:** Pasarelas de pago (merchant checkout), tipping bots, point of sale (PoS) backends.
* **Qué necesita un builder:** Generación de invoices (URIs/QR), detección de depósitos (0-conf), confirmación de finalidad.
* **Qué ya cubre HardKAS:** Generación de txs y parseo básico de evidencias.
* **Qué falta:** Payment URI standards (KIPs), helper para trackear 0-conf vs full-conf, expiración de invoices.
* **Qué debe ser SDK helper:** `KaspaURIBuilder`, `PaymentTracker`.
* **Qué debe ser plugin:** `hardkas-pay-server` (simulador local).
* **Qué debe ser template:** `merchant-checkout-template`.
* **Qué debe ser example:** `examples/payment-processor`.
* **Qué debe quedar fuera de scope:** Fiat on/off ramps, regulaciones AML/KYC.

## 4. UTXO Tooling
* **Qué tipo de apps se pueden construir:** UTXO consolidators, air-gapped signers, timelock managers, coin mixing.
* **Qué necesita un builder:** Manipulación profunda de inputs/outputs, locktimes, signature hashes (sighash) custom.
* **Qué ya cubre HardKAS:** RPC bindings y core tx builder, SilverScript UTXO abstractions.
* **Qué falta:** Helpers para merge/split masivo, visualizador de UTXOs en la consola de debug.
* **Qué debe ser SDK helper:** `UTXOBuilder`, `SighashHelper`.
* **Qué debe ser plugin:** `hardkas-utxo-debugger`.
* **Qué debe ser template:** Ninguno (muy bajo nivel).
* **Qué debe ser example:** `examples/utxo-consolidator`.
* **Qué debe quedar fuera de scope:** Implementación en Rust del node consensus.

## 5. Localnet / Node Tooling
* **Qué tipo de apps se pueden construir:** Scripts de stress test, monitorización de nodos, network topology simulators.
* **Qué necesita un builder:** Levantar N nodos interconectados localmente, inyectar latencia, simular reorgs y netsplits.
* **Qué ya cubre HardKAS:** Levantar un simulador mock simple (una sola instancia).
* **Qué falta:** Orquestación de multi-nodos (Docker/podman), control programático del P2P.
* **Qué debe ser SDK helper:** `NetworkSimulatorClient`.
* **Qué debe ser plugin:** `hardkas-node-cluster`.
* **Qué debe ser template:** `custom-network-lab`.
* **Qué debe ser example:** `examples/network-stress-test`.
* **Qué debe quedar fuera de scope:** Despliegue de nodos en la red principal (Mainnet ops).

## 6. DAG Tools
* **Qué tipo de apps se pueden construir:** Simuladores de conflictos (double spends), analizadores de blue score, orphan block visualizers.
* **Qué necesita un builder:** Forzar escenarios de ramificación, minar bloques en paralelo, visualizar el grafo (GhostDAG).
* **Qué ya cubre HardKAS:** Parcial simulator (mock) de estado final, pero no la topología DAG.
* **Qué falta:** Modelo visual del DAG, API para inyectar bloques con parenteskos específicos.
* **Qué debe ser SDK helper:** `GhostDAGAnalyzer`.
* **Qué debe ser plugin:** `hardkas-dag-visualizer` (UI local en el navegador).
* **Qué debe ser template:** Ninguno.
* **Qué debe ser example:** `examples/conflict-resolution-lab`.
* **Qué debe quedar fuera de scope:** Modificar las reglas del algoritmo GhostDAG.

## 7. Services / Backends
* **Qué tipo de apps se pueden construir:** Oráculos, cron jobs blockchain, APIs de custodia B2B.
* **Qué necesita un builder:** Integración CI/CD, fixtures deterministas, mocking de RPC, testing unitario rápido (vitest/jest).
* **Qué ya cubre HardKAS:** Base de testing con Vitest, tareas programables.
* **Qué falta:** Fixtures complejos precargados (estado de red "congelado"), time-travel en la red local.
* **Qué debe ser SDK helper:** `MockRPCClient`, `SnapshotManager`.
* **Qué debe ser plugin:** `hardkas-fixtures`.
* **Qué debe ser template:** `backend-service-template`.
* **Qué debe ser example:** `examples/oracle-service`.
* **Qué debe quedar fuera de scope:** Alojamiento (hosting) de bases de datos.

## 8. L2 Readiness
* **Qué tipo de apps se pueden construir:** Rollups experimentales, state channels, bridges.
* **Qué necesita un builder:** SPV proofs, cross-chain adapters, configuraciones deterministas, L1 data availability mocks.
* **Qué ya cubre HardKAS:** Experimental L2 adapters.
* **Qué falta:** Verificadores de SPV locales, hooks de rollup sequencer.
* **Qué debe ser SDK helper:** `SPVVerifier`, `L1DataClient`.
* **Qué debe ser plugin:** `hardkas-l2-bridge-mock`.
* **Qué debe ser template:** `rollup-base-template`.
* **Qué debe ser example:** `examples/simple-state-channel`.
* **Qué debe quedar fuera de scope:** Implementación productiva de una L2 (HardKAS provee solo la base de dev).

## 9. Plugins
* **Qué tipo de apps se pueden construir:** Extensiones para el propio ecosistema HardKAS (linters, formatters, deployers custom).
* **Qué necesita un builder:** API robusta del HRE (HardKAS Runtime Environment), hooks en el lifecycle de tareas.
* **Qué ya cubre HardKAS:** Arquitectura modular de plugins y tasks, `extendEnvironment`.
* **Qué falta:** Plugin SDK documentado, test utils para plugins.
* **Qué debe ser SDK helper:** `PluginTestingFactory`.
* **Qué debe ser plugin:** (Este es el meta-nivel, los plugins hacen plugins).
* **Qué debe ser template:** `hardkas-plugin-template`.
* **Qué debe ser example:** `examples/custom-linter-plugin`.
* **Qué debe quedar fuera de scope:** Tienda centralizada de plugins (usar npm).

## 10. Real Examples
* **Qué tipo de apps se pueden construir:** Demos funcionales E2E para onboarding de devs.
* **Qué necesita un builder:** Repos clonables (`npx hardkas init --example X`).
* **Qué ya cubre HardKAS:** Ejemplos básicos de SilverScript y despliegue.
* **Qué falta:** Aplicaciones full-stack realistas (Kaspa Next.js dApp).
* **Qué debe ser SDK helper:** N/A.
* **Qué debe ser plugin:** N/A.
* **Qué debe ser template:** N/A.
* **Qué debe ser example:** Todos los mencionados arriba.
* **Qué debe quedar fuera de scope:** Mantener apps de producción (los examples son educativos).
