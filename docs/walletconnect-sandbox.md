# HardKAS WalletConnect Sandbox (Local Dev Only)

> [!IMPORTANT]
> **Este NO es el WalletConnect oficial.**
> Se trata de un simulador determinista local diseñado para probar flujos de emparejamiento por QR y UX multidispositivo sin depender de infraestructuras en la nube o relays externos.

El **WalletConnect Sandbox** permite a los desarrolladores experimentar con el ciclo de vida de una conexión de billetera móvil dentro del Cockpit de HardKAS.

## Filosofía: El Laboratorio de Emparejamiento
HardKAS prioriza el control total del entorno. El Sandbox actúa como un "Relay Local" que gestiona sesiones efímeras en memoria.

- **Determinista**: Las URIs y los estados de pairing siguen un flujo predecible.
- **Privado**: Ningún dato sale de tu máquina. No utiliza los servidores de WalletConnect.
- **Efímero**: Las sesiones desaparecen al reiniciar el `dev-server`.

## Cómo funciona
1. **Generación**: Creas una nueva sesión en el Cockpit. Se genera una URI con el esquema `hardkas://sandbox/...`.
2. **Visualización**: El Cockpit muestra un código QR simulado (representación visual del pairing).
3. **Simulación de Emparejamiento**: El botón **"Pair Locally"** actúa como el dispositivo móvil, aprobando la conexión y vinculando las identidades de tu sesión activa de HardKAS al Sandbox.
4. **Sincronización**: Una vez emparejado, el estado se propaga a través de SSE a todos los componentes interesados.

## Hooks Disponibles (`@hardkas/react`)

### `useSandboxSessions()`
Obtiene la lista de sesiones activas y se suscribe a actualizaciones en tiempo real.
```ts
const { data: sessions } = useSandboxSessions();
```

### `useCreateSandboxSession()` / `usePairSandboxSession()`
Acciones para orquestar el flujo del laboratorio.

## Casos de Uso
- **Test de UX**: Verificar cómo responde tu aplicación cuando una billetera se conecta o desconecta.
- **Demos**: Mostrar flujos de onboarding multidispositivo sin complicaciones de red.
- **Debugging de Sesión**: Inspeccionar las transiciones de estado (`pending` -> `paired` -> `expired`).

## Limitaciones
- No es compatible con aplicaciones móviles reales de WalletConnect (requiere el esquema `hardkas://`).
- No cifra el tráfico del relay (ya que es local y para desarrollo).
- No soporta el firmado de transacciones reales en esta versión.
