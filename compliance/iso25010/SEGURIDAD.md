# AUDITORÍA DE SEGURIDAD BLOCKCHAIN Y CRIPTOGRÁFICA (`SEGURIDAD.md`)

## 1. Resumen Ejecutivo de Seguridad

El diseño de seguridad de **HardKAS `v0.13.0-rc.2`** adopta un modelo **fail-closed (fallo cerrado)** con defensa en profundidad orientada específicamente a la arquitectura UTXO/BlockDAG de Kaspa. Se han auditado **10 dominios críticos de seguridad**, verificando directamente el código fuente y ejecutando los scripts de control de seguridad del repositorio.

- **Controles verificados satisfactoriamente (`VERIFICADO`)**: Bloqueo total de Mainnet en L1 y L2, separación estricta de mundos de ejecución (`ExecutionTarget`), cifrado de keystores con **Argon2id + AES-256-GCM + AAD**, limpieza de buffers de claves en memoria (`fill(0)`), límites de memoria WASM y protección contra contaminación de prototipos (`__proto__`), endurecimiento del servidor local (`@hardkas/dev-server`), inmutabilidad criptográfica de artefactos (`hashVersion: 5` RFC-8785), aislamiento en subprocesos del verificador ZK Groth16 con validación de subgrupos en BN254 y anclaje de clave de verificación (VK), y ausencia total de ejecución de shell (`child_process`) en el compilador SilverScript.
- **Brechas y riesgos de seguridad detectados (`INCUMPLIDO` / `PARCIAL`)**:
  1. **Omisión de `assertBroadcastNodeSynced` en `WalletToolkit.verifySpendNetwork` (`HK-REQ-054`, Riesgo Alto)**.
  2. **Escritura no atómica y sin bloqueo en `ProjectionStoreJson.setAll` (`HK-REQ-056`, Riesgo Alto de corrupción por concurrencia)**.
  3. **Identidad sintética derivada del nombre en `WalletToolkit` (`HK-REQ-055`, Riesgo Medio — mitigado fuera de `simnet` por `WALLET_SYNTHETIC_NETWORK_BLOCKED`)**.
  4. **Ausencia de limitación de tasa (rate limiting) en `/api/*` de `@hardkas/dev-server` (`HK-REQ-067`, Riesgo Medio/Bajo)**.
  5. **Limitación estructural de scripts P2SH en Kaspa L1 ante reutilización de dirección ZK con idéntico importe (`HK-REQ-046`, Riesgo Medio — documentado en `limitations.md`)**.
  6. **Firmante permisivo (`HK-13`) en el paquete nativo retenido `@hardkas/pskt-native` (`HK-REQ-047`, Riesgo Medio — mitigado al mantenerse `"private": true`)**.

---

## 2. Evaluación por Dominio de Seguridad

### 2.1 Bloqueo Total de Mainnet en L1 y L2 (`HK-REQ-001`, `HK-REQ-053`) — `VERIFICADO`
- **Implementación verificada**:
  - En `packages/core/src/mainnet-policy.ts#L34-L40`, las constantes `MAINNET_TRANSACTIONS_ENABLED = false` y `MAINNET_CONNECTIONS_ENABLED = false` están fijadas en código.
  - Las funciones `assertMainnetConnectionAllowed()` (`packages/core/src/mainnet-policy.ts#L94-L115`) y `assertMainnetTransactionAllowed()` (`packages/core/src/mainnet-policy.ts#L117-L162`) lanzan `MAINNET_CONNECTION_DISABLED` y `MAINNET_TRANSACTION_DISABLED` **antes** de abrir sockets RPC, desbloquear keystores o construir scripts, ignorando cualquier flag `--force` o variable de entorno.
  - En L2 (`packages/l2/src/network-guard.ts#L1-L140`), cualquier conexión o escritura hacia Igra Mainnet (`chainId: 38833` o perfil marcado como mainnet) es rechazada inmediatamente con `MAINNET_CONNECTION_DISABLED` y `L2_MAINNET_WRITE_BLOCKED`.

### 2.2 Separación de Mundos de Ejecución (`HK-REQ-002`) — `VERIFICADO`
- **Implementación verificada**:
  - `packages/core/src/semantics/execution-guard.ts#L76-L218` resuelve primero el `ExecutionTarget` (`mode: 'simulator' | 'localnet' | 'rpc'`, `domain`, `network`) antes de cualquier operación.
  - Impide que recibos o UTXOs del simulador en memoria contaminen ejecuciones reales (`SIM_TO_REAL_LEAK`) y que datos de redes reales se inyecten en simulaciones deterministas (`REAL_TO_SIM_POLLUTION`).

### 2.3 Criptografía de Keystores, Derivación HD y Limpieza de Memoria (`HK-REQ-018`, `HK-REQ-019`, `HK-REQ-020`) — `VERIFICADO`
- **Implementación verificada**:
  - **KDF y Cifrado Autenticado**: `packages/accounts/src/keystore.ts#L14-L314` implementa el esquema `hardkas.keystore` (`v2.1.0`) utilizando **Argon2id** (vía `hash-wasm`, exigiendo `memorySize >= 19456` KiB, `iterations >= 2`, `parallelism >= 1`, sal aleatoria de 16 a 64 bytes) combinado con **AES-256-GCM** (IV de 12 bytes, authTag de 16 bytes) y datos adicionales autenticados (**AAD**: `hardkas.keystore.aad.v1`) que vinculan criptográficamente el texto cifrado a los metadatos de la cuenta y la red.
  - **Permisos y Escritura Atómica**: Los archivos de keystore se escriben con modo `0o600` mediante `writeFileAtomicSync` (`fsyncSync` + renombrado atómico con reintentos exponenciales ante `EPERM`/`EACCES` en Windows en `packages/accounts/src/atomic-write.ts#L18-L65`).
  - **Zeroing de Secretos**: El buffer `derivedKey` se sobrescribe explícitamente con ceros (`derivedKey.fill(0)`) dentro de bloques `finally` tanto en el cifrado como en el descifrado (`packages/accounts/src/keystore.ts#L168-L170`, `#L246-L248`).
  - **Aislamiento de Cuentas por Red**: Las cuentas creadas para `simnet` o `testnet-10` rechazan firmar transacciones dirigidas a otra red (`ACCOUNT_NETWORK_MISMATCH`).

### 2.4 Fronteras de Memoria WASM y Validación de Entradas (`HK-REQ-003`, `HK-REQ-006`, `HK-REQ-007`) — `VERIFICADO`
- **Implementación verificada**:
  - `packages/core/src/wasm-boundary.ts#L28-L215` impone límites estrictos antes de cruzar la frontera FFI hacia WASM (`kaspa-wasm` / `secp256k1`): máximo **1 MB** por cadena de entrada, **10 MB** por buffer binario, profundidad máxima de recursión JSON de **32 niveles**, y rechazo explícito de claves peligrosas (`__proto__`, `constructor`, `prototype`).
  - `packages/core/src/validation.ts#L14-L162` valida prefijos Bech32m de Kaspa (`kaspa:`, `kaspatest:`, `kaspasim:`, `kaspadev:`) verificando longitud y polimorfismo del checksum, y restringe importes a enteros `bigint` no negativos dentro de `MAX_SOMPI` ($29.000.000.000 \times 10^8$ sompi).
  - `packages/core/src/redaction.ts#L1-L148` redacta claves privadas hexadecimales de 64 caracteres, frases mnemotécnicas BIP-39, tokens Bearer y credenciales embebidas en URLs (`user:pass@host`) en todos los errores y logs.

### 2.5 Seguridad en Transacciones, RPC y Rutas de Envío (`HK-REQ-026`, `HK-REQ-029`, `HK-REQ-030`, `HK-REQ-054`) — `PARCIAL`
- **Controles verificados (`VERIFICADO`)**:
  - En `sdk.tx.send`, CLI `tx send`, `workflow` y `rescue-v1` (documentados en `docs/status/send-routes-security.md`), antes de transmitir cualquier transacción a un nodo RPC se invocan `assertBroadcastNodeIdentity` (que comprueba que el `networkId` del nodo coincide exactamente con el objetivo) y `assertBroadcastNodeSynced` (`packages/kaspa-rpc/src/broadcast-guards.ts#L1-L160`, que exige `isSynced: true` y `isUtxoIndexed: true`).
  - `RpcUtxoProvider` (`packages/kaspa-rpc/src/utxo-provider.ts#L1-L195`) filtra entradas ya gastadas en el mempool local para evitar dobles gastos accidentales dado que `getUtxosByAddresses` de `kaspad` solo refleja el estado del DAG.
- **Incumplimiento detectado (`HK-REQ-054` — `INCUMPLIDO`, Riesgo Alto)**:
  - En `@hardkas/toolkit`, el método `WalletToolkit.verifySpendNetwork` (`packages/toolkit/src/wallet.ts#L435-L441`) invoca `assertBroadcastNodeIdentity` pero **omite invocar `assertBroadcastNodeSynced`**. Si un desarrollador utiliza `WalletToolkit.signAndBroadcast` contra un nodo `kaspad` aún en sincronización, el toolkit planificará y firmará sobre un conjunto UTXO obsoleto sin abortar previamente.

### 2.6 Seguridad de Artefactos y Almacenamiento (`HK-REQ-013`, `HK-REQ-014`, `HK-REQ-015`, `HK-REQ-056`) — `PARCIAL`
- **Controles verificados (`VERIFICADO`)**:
  - `packages/artifacts/src/canonical.ts#L87-L379` implementa canonicalización determinista RFC-8785 (`hashVersion: 5`) con rechazo de `NaN`/`Infinity`, normalización Unicode NFC y ordenación lexicográfica UTF-16 de claves.
  - `packages/artifacts/src/store.ts#L1-L340` aplica inmutabilidad write-once (`ARTIFACT_IDENTITY_CONFLICT` si un artefacto existente difiere en su hash canónico), confinamiento de rutas contra traversal (`..`), rechazo de enlaces simbólicos (`lstatSync().isSymbolicLink()`) y límite de linaje (`MAX_LINEAGE_PARENT_HOPS = 64`).
  - El gate `node scripts/check-artifact-fixtures.mjs packages/artifacts/test/fixtures/corrupted --reject` verificó que las **12 fixtures corruptas** son rechazadas al 100 % con códigos de error tipados.
- **Incumplimiento detectado (`HK-REQ-056` — `INCUMPLIDO`, Riesgo Alto)**:
  - En `@hardkas/query-store`, `ProjectionStoreJson.setAll` (`packages/query-store/src/projection-store.ts#L35-L40`) escribe en una ruta fija `${this.filePath}.tmp` usando `fs.writeFileSync` + `fs.renameSync` directamente, sin usar `writeFileAtomicSync` (`fsyncSync` + sufijo aleatorio `.pid.random.tmp` + reintento ante `EPERM` en Windows) ni adquirir el bloqueo jerárquico `LOCK_ORDER.index`.

### 2.7 Seguridad de SilverScript, Covenants Toccata y Verificador ZK Groth16 (`HK-REQ-038`, `HK-REQ-040`, `HK-REQ-041`, `HK-REQ-046`) — `VERIFICADO` (con limitación L1 documentada)
- **Compilador SilverScript (`HK-REQ-038` — `VERIFICADO`)**:
  - El gate `node scripts/check-silver-no-shell-exec.mjs` confirmó `SILVERSCRIPT_SECURITY_SCAN_PASSED`: el adaptador SilverScript no utiliza invocaciones de shell vulnerables a inyección de comandos y aplica un límite estricto de tamaño de fuente (`64 KiB`).
- **Verificador Off-Chain Groth16 (`HK-REQ-040` — `VERIFICADO`)**:
  - `packages/sdk/src/zk/groth16-verifier.ts#L156-L800` valida que todas las coordenadas de la prueba pertenezcan al cuerpo primo de BN254 ($p$), verifica pertenencia a la curva en $G_1$ y $G_2$, comprueba pertenencia al subgrupo de orden primo $r$ en $G_2$ (previniendo ataques de subgrupo pequeño), detecta claves de verificación (VK) débiles o con puntos identidad/generadores triviales ($\alpha, \beta, \gamma, \delta$), exige anclaje de huella SHA-256 de la VK (`expectedVkFingerprint`), y ejecuta el emparejamiento bilineal de `snarkjs` en un **subproceso hijo aislado** con timeout de **15 segundos** y semáforo de concurrencia máxima `MAX_CONCURRENT_PAIRINGS = 4`.
- **Vinculación L1 en Toccata RISC Zero (`HK-REQ-041`, `HK-REQ-046`)**:
  - En modo `proof-and-output-bound` (`packages/sdk/src/zk/toccata.ts#L758-L802`), el script de redención Kaspa L1 utiliza opcodes de introspección (`OpTxInputCount == 1`, `OpTxOutputCount`, `OpTxOutputSpk`, `OpTxOutputAmount`) para vincular criptográficamente las salidas y el límite de comisión (`maxFeeSompi`), evitando que un atacante en el mempool reemplace el destinatario reutilizando la prueba ZK.
  - **Limitación L1 documentada (`HK-REQ-046` — `PARCIAL`)**: Como un script P2SH no puede comprometer su propio outpoint de financiación sin crear un ciclo de hash (`ZK_UTXO_BINDING_UNSATISFIABLE`) ni parsear el journal `HKZ1` en L1, financiar repetidamente la misma dirección P2SH ZK con idéntico importe permitiría reproducir el mismo testigo si no se compone con un covenant con estado Toccata V1.

### 2.8 Seguridad del Servidor de Desarrollo Local (`@hardkas/dev-server`) (`HK-REQ-062`, `HK-REQ-063`, `HK-REQ-067`) — `PARCIAL`
- **Controles verificados (`VERIFICADO`)**:
  - `packages/dev-server/src/server.ts#L44-L282` escucha exclusivamente en `127.0.0.1` por defecto, valida la cabecera `Host` contra ataques de **DNS rebinding**, restringe CORS a orígenes `localhost`/`127.0.0.1`, exige un **token Bearer aleatorio de 32 bytes** en todas las rutas `/api/*`, exige la cabecera anti-CSRF `X-Hardkas-Request: true` en peticiones mutadoras (`POST`/`PUT`/`DELETE`), añade `Cache-Control: no-store` y bloquea la firma automática de transacciones (`DEV_AUTOSIGN_NOT_ALLOWED`) salvo que `HARDKAS_DEV_SERVER_AUTOSIGN=1` esté activo en loopback `simnet`.
- **Incumplimiento detectado (`HK-REQ-067` — `INCUMPLIDO`, Riesgo Medio/Bajo)**:
  - `packages/dev-server/src/server.ts` carece de middleware de limitación de tasa (rate limiting) por IP en `/api/*`, lo cual es relevante cuando el usuario arranca el servidor con `--unsafe-external`.

### 2.9 Cadena de Suministro, Licencias y Publicación (`HK-REQ-059`, `HK-REQ-064`, `HK-REQ-065`) — `VERIFICADO`
- **Gates verificados**:
  - `node scripts/check-versions.mjs` -> **PASS** (`6.268` archivos sincronizados en `0.13.0-rc.2`).
  - `node scripts/check-licenses.mjs` -> **PASS** (`22` paquetes MIT publicables, `286` dependencias de producción de terceros, **0 licencias copyleft (GPL/AGPL/LGPL)** en el árbol requerido; los 9 paquetes `GPL-3.0` están confinados exclusivamente bajo la peer dependency opcional `snarkjs@0.7.6`).
  - La instalación de extensiones no publicadas (`@hardkas/ext-l2`) desde registros remotos está bloqueada con `EXTENSION_NOT_PUBLISHED`, exigiendo un tarball local verificado mediante digest explícito `--sha256` (`packages/cli/src/commands/extension.ts#L1-L160`).
