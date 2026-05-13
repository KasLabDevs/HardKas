# HardKAS: Lo que realmente funciona

Este documento resume las capacidades operativas reales de HardKAS v0.2.2-alpha, separando la visión a largo plazo de la funcionalidad disponible hoy.

## Funcionalidad Core (100% Operativa)

### 1. Ciclo de Vida de Transacciones L1
- **Planificación**: `hardkas tx plan` genera artefactos JSON deterministas.
- **Firma**: Integración con el keystore para firmar planes.
- **Envío**: Broadcast robusto a través de RPC.
- **Recibos**: Seguimiento de estado y almacenamiento de `txReceipt`.

### 2. Gestión de Cuentas y Keystore
- Generación de cuentas compatibles con Kaspa.
- Almacenamiento cifrado local (`.hardkas/keystore`).
- Faucet automatizado para entornos `simnet`.

### 3. Entorno de Desarrollo Local
- Orquestación Docker de `kaspad`.
- Reset y logs integrados en el CLI.
- Diagnóstico de salud vía `hardkas doctor`.

### 4. Integración L2 (Igra)
- Soporte para transacciones EVM.
- Despliegue de contratos (planificación).
- Consulta de saldos y nonces en L2.

---

## Funcionalidad Avanzada (En Preview/Experimental)

### 1. Motor de Consultas (Query Engine)
- Búsqueda relacional de artefactos por schema/emisor/receptor.
- Seguimiento de linaje de transacciones.
- Detección de divergencias en replay.
- **Limitación**: Las consultas de "Correlation" y el comando `store index` no están activos en esta versión.

### 2. Simulación de DAG
- Monitoreo básico de estatus.
- Simulación de reorgs controlados en localnet.

---

## Lo que NO funciona todavía (Roadmap)

### 1. Test Runner (`hardkas test`)
- **Estado Actual**: Mock. Imprime un resultado estático.
- **Objetivo**: Integrar Vitest/Mocha para ejecutar pruebas reales contra el SDK.

### 2. Rastreo de Transacciones (`hardkas tx trace`)
- **Estado Actual**: Deshabilitado.
- **Objetivo**: Implementar visualización de flujo de fondos basada en el motor Query.

### 3. Persistencia de Sesión (`accounts lock/unlock`)
- **Estado Actual**: El "bloqueo" es puramente informativo.
- **Objetivo**: Implementar un daemon de sesión o scoping de variables de entorno para invalidar llaves en memoria.
