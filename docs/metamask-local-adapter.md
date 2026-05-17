# HardKAS MetaMask Local Adapter

El **MetaMask Local Adapter** permite conectar de forma determinista y segura tu billetera del navegador al entorno de desarrollo local de HardKAS e Igra L2.

## Filosofía: Local-First
Este adaptador NO es un SDK de producción. Está diseñado exclusivamente para flujos de desarrollo local (`localhost`).

- **Determinista**: Usa configuraciones fijas para la red Igra local.
- **Seguro**: Nunca pide claves privadas ni mnemonics. Solo utiliza el proveedor inyectado (`window.ethereum`).
- **Explícito**: No realiza conexiones ni cambios de red automáticos. Todo debe ser activado por el desarrollador.

## Arquitectura
1. **Dev Server**: Expone `/api/metamask` con la configuración de la red local y la dirección de la sesión activa.
2. **React Hooks**: `@hardkas/react` proporciona hooks para interactuar con MetaMask sin la sobrecarga de wagmi.
3. **Cockpit**: El dashboard visual utiliza estos hooks para mostrar el estado de sincronización.

## Hooks Disponibles (`@hardkas/react`)

### `useMetaMaskLocal()`
Detecta el estado de MetaMask.
```ts
const { state, refresh } = useMetaMaskLocal();
// state: installed, connected, chainId, localIgraDetected, account...
```

### `useSwitchToLocalIgra()`
Añade o cambia a la red Igra local (Chain ID: 19416).
```ts
const { switchChain } = useSwitchToLocalIgra();
```

### `useIgraInjectedAccount()`
Compara la cuenta de MetaMask con la sesión activa de HardKAS.
```ts
const { matches } = useIgraInjectedAccount(sessionAddress);
```

## Flujo de Trabajo
1. Inicia HardKAS Cockpit: `hardkas dashboard`.
2. En el panel de MetaMask, verás si la red local está detectada.
3. Si no es así, haz clic en **"Switch to Igra"**.
4. MetaMask te pedirá permiso para añadir/cambiar a la red local (127.0.0.1:8545).
5. Una vez conectado, el cockpit mostrará si tu cuenta de MetaMask coincide con la cuenta de la sesión de HardKAS (**Session Sync**).

## Limitaciones
- Solo soporta MetaMask (proveedor inyectado `window.ethereum`).
- No soporta WalletConnect ni otros protocolos en esta versión local.
- No persiste el estado de la billetera; se basa puramente en el estado actual del proveedor.
