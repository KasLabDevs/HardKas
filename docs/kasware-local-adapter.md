# HardKAS KasWare Local Adapter

El **KasWare Local Adapter** permite integrar la billetera nativa de Kaspa en tu flujo de desarrollo local con HardKAS. Mientras que el adaptador de MetaMask se encarga del lado L2 (Igra), KasWare se encarga de la identidad en la L1 (Kaspa).

## Filosofía: Local-First
Este adaptador está diseñado exclusivamente para entornos de desarrollo local (`localhost`, `localnet`, `simnet`).

- **Solo Lectura (Sincronización)**: En esta versión, el adaptador se centra en la detección y sincronización de identidades. El firmado de transacciones desde el navegador no está habilitado para mantener la seguridad del entorno local.
- **Explícito**: No realiza conexiones automáticas. El usuario debe autorizar explícitamente la conexión.
- **Coherencia de Identidad**: Su función principal es asegurar que la cuenta activa en el navegador sea la misma que la sesión activa en la CLI.

## Hooks Disponibles (`@hardkas/react`)

### `useKasWareLocal()`
Detecta la instalación y el estado de KasWare.
```ts
const { state, refresh } = useKasWareLocal();
// state: installed, connected, address, network, localNetworkDetected...
```

### `useConnectKasWareLocal()`
Solicita permiso al usuario para conectar la billetera.
```ts
const { connect } = useConnectKasWareLocal();
```

### `useKasWareSessionMatch()`
Compara la cuenta de KasWare con la sesión activa de HardKAS L1.
```ts
const { matches, reason } = useKasWareSessionMatch(sessionL1Address);
```

## Integración en el Cockpit
El dashboard visual incluye ahora un panel de **KasWare Local** que muestra:
- Estado de instalación y conexión.
- Red activa (con validación de red local).
- Indicador de **"L1 Session Sync"**.

### Coherencia en el Bridge Lab
El laboratorio de bridge utiliza ambos adaptadores (KasWare y MetaMask) para mostrar de forma visual si las identidades del navegador coinciden con la sesión local antes de realizar simulaciones.

## Limitaciones Conocidas
- Solo soporta KasWare (proveedor inyectado `window.kasware`).
- No permite firmar transacciones ni enviar KAS desde el navegador en esta versión.
- No soporta el cambio de red automático (limitación de la API actual de KasWare).
