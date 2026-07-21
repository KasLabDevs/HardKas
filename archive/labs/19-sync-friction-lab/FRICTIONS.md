# Lab 19: Sync Frictions Captured

This lab reveals the immense boilerplate and brittleness required to consume Kaspa state manually without a Sync Daemon.

## 1. Cuándo considerar un bloque nuevo
El desarrollador debe programar un bucle manual (`while(true)`) que lanza peticiones RPC (`getVirtualSelectedParentBlueScoreRequest`) a intervalos fijos. Comparar el `blueScore` local con el de red no es trivial, porque si el nodo se reconecta, el blueScore podría no ser lineal (reorgs). La lógica de "qué hacer si el nuevo score es mayor" requiere mantener un estado local mutante (`lastProcessedBlueScore`) que es susceptible a *race conditions* si otra petición se solapa.

## 2. Cómo evitar doble ingesta
Al detectar un salto de `blueScore`, el desarrollador tiene que obtener los bloques intermedios manualmente. Si un proceso de ingestión al `IndexerToolkit` falla a medias, o si el proceso se reinicia, el desarrollador corre el riesgo de inyectar el mismo bloque dos veces. No hay idempotencia nativa sin escribir un gestor transaccional manual.

## 3. Cómo recuperar desde último blueScore
El desarrollador tiene que persistir el último `blueScore` procesado en disco (ej. `sync-checkpoint.json`). Esto exige manejar el sistema de archivos (`fs.writeFileSync`), crear directorios (`mkdirSync`), e interpretar si el checkpoint local es válido al arrancar. Durante la ejecución del Lab 19, un simple reinicio brusco falló en grabar el checkpoint, corrompiendo la recuperación.

## 4. Cómo rehidratar después de disconnect
Aunque el plugin RPC (P56) tiene resiliencia y reconecta, el bucle principal de la aplicación necesita un monitor de estado (`isConnected`). Si la conexión se pierde, el desarrollador tiene que atrapar errores (ej. `HardkasRpcConnectionError`) en medio del bloque de lógica de negocio, detener la ingesta, esperar, y reevaluar todo el estado desde cero cuando la conexión vuelve (ya que pudieron pasar bloques mientras estaba desconectado).

## 5. Cómo coordinar Wallet/Indexer/Jobs
Por cada bloque nuevo, el desarrollador debe recorrer manualmente **todas** las direcciones observadas (ej. 13 wallets/merchants), invocar `plugin.utxos(addr)`, y enviar los resultados a `IndexerToolkit` y a las colas de `JobsToolkit`. Esto acopla fuertemente el bucle de red con el almacenamiento, haciendo el código inmanejable y propenso a sobrecargar el nodo con miles de peticiones individuales en lugar de batching.

## 6. Cómo apagar sin corrupción
Atrapar `SIGINT` y `SIGTERM` es mandatorio. Si el proceso recibe una señal de apagado en medio de la ingesta de un bloque, abortar instantáneamente corrompe el estado. El script manual requirió *flags* de apagado (`isShuttingDown`), detener el loop de forma segura y esperar a que el archivo de checkpoint se guardara antes de llamar a `process.exit()`. Aún así falló porque la gestión pura es frágil.

---
**Conclusión:** Un *Sync Daemon* es arquitectónicamente obligatorio.
