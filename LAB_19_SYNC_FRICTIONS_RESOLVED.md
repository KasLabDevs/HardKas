# Lab 19: Sync Frictions Resolved

By introducing `@hardkas/sync-daemon`, we have successfully removed the massive boilerplate and structural fragility associated with polling the Kaspa Node.

## 1. Cuándo considerar un bloque nuevo
El daemon ahora se encarga de abstraer el polling (`virtualSelectedParentBlueScore`). Oculta por completo al desarrollador la lógica temporal de la red y emite un estado limpio y transaccional cuando corresponde.

## 2. Cómo evitar doble ingesta
El daemon actúa como compuerta de sincronización unidireccional. Asegura que el `blueScore` no avance a menos que el procesamiento en batch de todas las actualizaciones (Indexer y Wallets) se complete exitosamente para esa altura.

## 3. Cómo recuperar desde último blueScore
El guardado de Checkpoints ahora es robusto: el daemon graba el estado en un `.tmp` y lo renombra de forma atómica (`fs.renameSync`). Esto asegura tolerancia a cortes abruptos de energía/`kill -9` sin pérdida ni corrupción de datos.

## 4. Cómo rehidratar después de disconnect
El `SyncDaemon` traga cualquier `HardkasRpcConnectionError` derivado de caídas del nodo o red, aplicando un fallback backoff y retomando el polling exactamente donde lo dejó sin desestabilizar la aplicación principal. 

## 5. Cómo coordinar Wallet/Indexer/Jobs
Al instanciar el Daemon, se le inyecta la lista de `wallets` observadas. Internamente, extrae de forma automática (y paralelizada) las direcciones a observar e invoca el backend mediante *batching*, eliminando el anti-patrón de N+1 peticiones.

## 6. Cómo apagar sin corrupción
Llamar a `daemon.stop()` es una operación *promise-based* segura. Bloquea el proceso hasta que la iteración de polling actual termina y el checkpoint se escribe exitosamente.

---
**Resultado Final:**
Las más de 120 líneas de código doloroso en el laboratorio original se han reducido a apenas la instancia del Daemon:
```typescript
const daemon = SyncDaemon.open({ backend, indexer, wallets, jobs, checkpointPath: ".hardkas/sync.json" });
await daemon.start();
```
