# HardKAS 0.10.x - App Labs Roadmap (P27)

Este roadmap define el camino a seguir para dotar a HardKAS de las capacidades necesarias para construir el espectro completo de aplicaciones Kaspa, estructurado por fases de prioridad.

## Fase 1: Foundation & Dev Ex (Prioridad 1)
Objetivo: Soportar la creación fluida de wallets, integraciones de pagos e indexadores locales.

* **[Helper] SDK Wallet Core:** Implementar `CoinSelector`, `FeeEstimator` y `AddressManager`.
* **[Plugin] Local Indexer Mock:** Crear `hardkas-indexer-plugin` para proveer un endpoint GraphQL local que simule Kaspa Graph Node (KGI) o similar, permitiendo historiales de tx.
* **[Helper] Payments Toolkit:** Desarrollar `KaspaURIBuilder` para estándar de facturas y `PaymentTracker` para detección robusta de 0-conf.
* **[Templates] "npx hardkas init":**
  * `wallet-backend-template` (Node.js/Express).
  * `merchant-checkout-template`.
  * `hardkas-plugin-template` (para fomentar el ecosistema de plugins).
* **[Infra] Plugin DevKit:** Consolidar utilidades de testing para creadores de plugins de la comunidad.

## Fase 2: Deep Protocol Tooling (Prioridad 2)
Objetivo: Habilitar herramientas avanzadas de UTXO, simulación de escenarios DAG y testing de servicios pesados.

* **[Helper] Advanced UTXO & Sighash:** APIs de alto nivel para consolidación masiva y scripts complejos.
* **[Plugin] DAG Visualizer:** `hardkas-dag-visualizer`, un servidor local que renderice el GhostDAG en el navegador y permita inyectar bloques huérfanos/dobles gastos.
* **[Infra] Snapshot & Time-Travel:** Añadir a la red local la capacidad de guardar/restaurar el estado de la cadena y saltar en el tiempo para probar expensas de locktime.
* **[Examples] Conflict & Oracle Labs:** Examples de resolución de conflictos en el DAG y servicios backend con mocking RPC.

## Fase 3: Scale & Future Readiness (Prioridad 3)
Objetivo: Preparar el terreno para L2s y testing de red a nivel de infraestructura.

* **[Plugin] Multi-Node Orchestrator:** `hardkas-node-cluster` para levantar redes locales con múltiples nodos, latencia inducida y simulador de particiones de red.
* **[Helper] L2 SPV & Data Availability:** `SPVVerifier` mockeado y helpers para construir experimentación L2 sobre la red local.
* **[Templates] Rollup Labs:** `rollup-base-template` para constructores investigando L2 en Kaspa.

## Resumen Estratégico
Con estas tres fases implementadas, HardKAS dejará de ser una herramienta puramente centrada en el contrato inteligente/script para convertirse en el **"Hardhat para TODO Kaspa"**, siendo la puerta de entrada indispensable para cualquier builder, sin importar si construye una wallet, un merchant checkout, o experimenta con L2s.
