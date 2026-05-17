# HardKAS Cockpit Dashboard

El **HardKAS Cockpit** es la interfaz visual central del Runtime de Desarrollo Local. Proporciona una consola de control unificada para monitorizar y depurar tu flujo de trabajo entre Kaspa (L1) e Igra (L2).

## Acceso
Puedes lanzar el dashboard desde la CLI:

```bash
hardkas dashboard
```

Esto iniciará el **HardKAS Dev Server** (si no está corriendo) y abrirá la UI en `http://localhost:7420`.

## Características Principales

### 1. Monitor de Identidad (Session Identity)
Muestra la sesión activa actual, resolviendo los nombres de las billeteras L1 y L2 configuradas en la CLI.

### 2. Salud de la Red (Network Health)
Monitorización en vivo de la conectividad RPC real:
- **Validación Activa**: Consulta el endpoint `/api/health` para obtener estados reales de los nodos.
- **Metadatos de Red**: Muestra Network ID de Kaspa (L1) y Chain ID de Igra (L2).
- **Indicadores de Estado**:
  - `Healthy`: El nodo responde correctamente.
  - `Warning`: El nodo responde pero con advertencias (ej. desincronizado).
  - `Offline`: No se puede contactar con el nodo.
  - `Stale`: Los datos de salud tienen más de 45 segundos de antigüedad (posible fallo del stream de eventos).

### 3. Balances en Tiempo Real
Visualización instantánea de saldos en Sompi (L1) y Wei (L2) para las cuentas de la sesión activa.

### 4. Adaptadores de Billetera (Browser Sync)
- **MetaMask Local**: Gestión de la red Igra local y sincronización de cuentas EVM.
- **KasWare Local**: Sincronización de la identidad nativa de Kaspa en el navegador.
- **Session Sync**: Indicadores visuales que confirman si tu billetera del navegador coincide con la sesión de la CLI.

### 5. Bridge Laboratory
Un entorno de pruebas para simular transferencias entre capas. Permite validar la coherencia de identidad antes de ejecutar planes de bridge.

### 6. Runtime Events (Shared SSE)
Un stream unificado de eventos en tiempo real:
- **Resiliencia**: El dashboard se reconecta automáticamente al servidor de desarrollo con un algoritmo de *backoff* exponencial (de 500ms hasta 10s) si se interrumpe la conexión.
- **Sincronización**: Todos los paneles se actualizan instantáneamente cuando el servidor emite eventos de cambio de sesión o salud.

---

## Filosofía de Diseño
El Cockpit no es un explorador de bloques ni una billetera de producción. Es un **laboratorio de desarrollo** diseñado para ser determinista, inspeccionable y local.
