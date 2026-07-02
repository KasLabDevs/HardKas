# P61 — Audit Remediation Backlog

**Estado:** ACTIVO  
**Versión base auditada:** 0.11.2-alpha
**Fecha de apertura:** 2026-06-30  
**Criterio de cierre de P61:** todos los P0 cerrados con tests; todos los P1 cerrados o documentados como limitación explícita; auditoría repetida sin critical findings verificables; ningún READY.md con claims no demostradas; docs alineadas con API real.

---

## Separación: verificable vs hipótesis

Los ítems de este backlog se basan exclusivamente en lectura directa de código fuente.  
No se incluyen afirmaciones derivadas de análisis estadístico estático (porcentajes de cobertura, "X% nunca usado") a menos que la evidencia sea una cuenta de ocurrencias, no una inferencia de ejecución.

---

## P0 — Bloqueantes funcionales

---

### P61-001

```
ID:           P61-001
Título:       SyncDaemon no integra IndexerToolkit ni JobsToolkit
Severidad:    P0 — Bloqueante funcional
Evidencia:    packages/sync-daemon/src/daemon.ts
              Línea 38: this.indexer = options.indexer
              Línea 40: this.jobs    = options.jobs
              Grep de "this.indexer" en daemon.ts: 1 resultado (solo la asignación).
              Grep de "this.jobs"    en daemon.ts: 1 resultado (solo la asignación).
              pollLoop() (líneas 111-171) no llama ningún método de indexer ni de jobs.
Impacto:      El daemon sincroniza blueScore y UTXOs por address pero nunca alimenta
              al IndexerToolkit. Las apps que pasan indexer al daemon esperan que los
              bloques/UTXOs se ingieran; no ocurre. Los jobs tampoco se disparan por
              eventos de bloque.
Criterio de   1. pollLoop() llama indexer.ingestArtifact() o indexer.dag.ingestBlocks()
aceptación:      cuando currentBlueScore > lastProcessedBlueScore.
              2. Si options.jobs está presente, el daemon puede despachar un job por
                 evento de bloque (o hay documentación explícita de por qué no lo hace).
              3. Test: SyncDaemon con mock backend que avanza blueScore comprueba
                 que indexer recibe al menos una llamada de ingesta por ciclo.
Verificación: grep -n "this\.indexer\|this\.jobs" packages/sync-daemon/src/daemon.ts
              # Debe mostrar más de 1 resultado por campo tras el fix.
Estado:       ABIERTO
```

---

### P61-002

```
ID:           P61-002
Título:       PaymentToolkit.receipt() devuelve siempre status "paid" sin leer el store
Severidad:    P0 — Dato incorrecto silencioso
Evidencia:    packages/toolkit/src/payment.ts líneas 68-76:
              public async receipt(invoiceId: string): Promise<any> {
                  return {
                      schema: "paymentReceipt.v1",
                      invoiceId,
                      merchantId: this.merchantId,
                      status: "paid",          // ← hardcoded, no lee store
                      timestamp: new Date().toISOString()
                  };
              }
              La función no hace await this.store.get(invoiceId) en ningún path.
Impacto:      Cualquier llamada a receipt() devuelve "paid" independientemente del
              estado real de la factura. Un receipt de una factura pending o cancelled
              indica "paid". merchant-backend llama receipt() en producción (línea 77).
Criterio de   1. receipt() lee la factura del store.
aceptación:   2. Si la factura no existe, lanza o devuelve status "not_found".
              3. Si la factura existe, devuelve su status real (pending/paid/cancelled).
              4. Test: receipt() de factura pending devuelve status "pending".
              5. Test: receipt() de factura inexistente no devuelve "paid".
Verificación: grep -n "status.*paid\|store\.get" packages/toolkit/src/payment.ts
              # Tras el fix: store.get debe aparecer dentro del cuerpo de receipt().
Estado:       ABIERTO
```

---

### P61-003

```
ID:           P61-003
Título:       IndexerToolkit.watch() handler vacío — nunca actualiza proyecciones
Severidad:    P0 — API pública que no hace lo que documenta
Evidencia:    packages/toolkit/src/indexer.ts líneas 57-62 (aproximado):
              watch(address: string, handler: WatchHandler): void {
                  // Internally updates projections if address is involved
              }
              El cuerpo es un comentario. No hay lógica de suscripción ni de despacho
              al handler.
Impacto:      Cualquier app que llame watch() para recibir notificaciones de
              transacciones no recibe nada. El handler nunca se invoca.
              Esto hace que el path de monitoreo reactivo de wallets esté roto.
Criterio de   1. watch() registra el handler internamente.
aceptación:   2. Cuando llega un evento relevante (vía backend o poll), el handler
                 se invoca con los datos correctos.
              3. Si el comportamiento reactivo completo no es posible aún, la función
                 lanza NotImplementedError en lugar de silenciar la llamada.
              4. Test: watch() registra handler; evento simulado → handler invocado.
Verificación: grep -n "watch\|handler\|// " packages/toolkit/src/indexer.ts
              # Tras el fix: no debe haber handler vacío sin lógica.
Estado:       ABIERTO
```

---

### P61-004

```
ID:           P61-004
Título:       PaymentToolkit.createInvoice() multiplica amount por 100_000_000 sin
              declarar la unidad esperada del parámetro
Severidad:    P0 — Corrupción silenciosa de datos financieros
Evidencia:    packages/toolkit/src/payment.ts línea 32:
              amountSompi: opts.amount * 100_000_000n, // convert to sompi
              La firma pública es: createInvoice(opts: { amount: bigint; currency: string })
              No hay JSDoc, no hay nombre de unidad en el tipo, no hay validación.
              merchant-backend llama con: BigInt(Math.floor(Math.random() * 100000) + 1000)
              — ese número se interpreta como KAS, pero no está documentado.
              Si un consumidor pasa sompi directamente, la cantidad se multiplica
              100 millones de veces.
Impacto:      Una app que pase amount en sompi (la unidad nativa de Kaspa) genera
              URIs con montos 10^8 veces superiores al correcto. No hay error ni warning.
Criterio de   1. El parámetro amount se documenta explícitamente como KAS o sompi
aceptación:      (elegir uno y ser consistente).
              2. Si la unidad es KAS: el nombre del campo se mantiene y JSDoc dice "@param amount Amount in KAS".
              3. Si la unidad es sompi: se elimina la multiplicación interna.
              4. Test: createInvoice({amount: 1n, currency: "KAS"}) genera URI con
                 amountSompi = 100_000_000n.
              5. Test: createInvoice({amount: 0n}) lanza error (protección contra amount cero).
Verificación: grep -n "amount\|sompi\|100_000_000" packages/toolkit/src/payment.ts
Estado:       ABIERTO
```

---

### P61-005

```
ID:           P61-005
Título:       WalletToolkit.planSend() retorna {} y estimateFee() retorna valores fijos
Severidad:    P0 — Stubs silenciosos en API de envío de transacciones
Evidencia:    packages/toolkit/src/wallet.ts líneas 100-106:
              public async planSend(opts: { to: string; amount: bigint }): Promise<any> {
                  return {};
              }
              public async sendSimulated(opts: ...): Promise<string> {
                  return `simulated_tx_${Date.now()}`;
              }
              Líneas 90-98 (estimateFee):
              return { selectedUtxos: [], fee: 1000n, totalOut: BigInt(opts.amount) + 1000n };
              — fee fijo de 1000 sompi (0.00001 KAS) sin selección real de UTXOs.
              Línea 50 (buildPaymentPlan callback):
              async (inputs, outputs) => BigInt(inputs * 1000 + outputs * 1000) // Dummy fee
Impacto:      planSend() no puede usarse para construir transacciones reales.
              estimateFee() devuelve selectedUtxos vacío — no hay coin selection.
              Un consumidor que llame planSend() y asuma que el resultado es un plan
              válido recibe {} sin error.
Criterio de   Opción A (implementar): planSend() llama a buildPaymentPlan con UTXOs
aceptación:   reales y devuelve un TxPlan válido.
              Opción B (documentar): planSend() lanza NotImplementedError con mensaje
              explícito. La documentación marca la función como "not yet implemented".
              En cualquier caso:
              1. planSend() no puede retornar {} silenciosamente.
              2. estimateFee() no puede retornar selectedUtxos: [] si hay UTXOs disponibles.
              3. Test cubre la opción elegida.
Verificación: grep -n "planSend\|estimateFee\|return {}" packages/toolkit/src/wallet.ts
Estado:       ABIERTO
```

---

## P1 — Defectos de fiabilidad y mantenibilidad

---

### P61-006

```
ID:           P61-006
Título:       JobStoreJson.update() hace read-all/write-all sin lock ni escritura atómica
Severidad:    P1 — Race condition bajo concurrencia, pérdida de datos posible
Evidencia:    packages/jobs/src/job-store-json.ts líneas 48-54:
              update(id, updater) {
                  const data = this.getAll();   // lee el fichero completo
                  data[id] = updater(data[id]);
                  this.setAll(data);             // escribe el fichero completo
              }
              packages/jobs/src/job-store-json.ts línea 35:
              fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
              — escritura directa sin patrón tmp+rename.
              job-runner.ts línea 102: setInterval cada 1000ms llama store.update().
              Con N jobs activos: N lecturas + N escrituras del fichero por segundo,
              sin coordinación entre ellas.
Impacto:      Bajo concurrencia (múltiples jobs corriendo), dos updates simultáneos
              pueden leer el mismo snapshot y el segundo write borra los cambios del
              primero. En crash durante writeFileSync, el fichero puede quedar truncado
              (a diferencia del tmp+rename de SyncDaemon.saveCheckpoint).
Criterio de   Opción A: escribir con patrón atómico (tmp + rename) en setAll().
aceptación:   Opción B: documentar explícitamente que JobStoreJson no es seguro para
              múltiples jobs concurrentes y que debe usarse JobStoreSqlite en ese caso.
              En cualquier caso:
              1. setAll() usa escritura atómica O hay documentación de limitación.
              2. Test de concurrencia: 3 jobs corriendo en paralelo con JobStoreJson
                 no corrompen el fichero (o el test documenta por qué no aplica con JSON).
Verificación: grep -n "writeFileSync\|renameSync\|tmp" packages/jobs/src/job-store-json.ts
              # Tras el fix opción A: debe aparecer renameSync.
Estado:       ABIERTO
```

---

### P61-007

```
ID:           P61-007
Título:       JobRunner no tiene método stop() — los setInterval de jobs activos no
              se cancelan al parar el proceso
Severidad:    P1 — Resource leak / comportamiento indefinido en shutdown
Evidencia:    packages/jobs/src/job-runner.ts: no existe método stop() ni cancel().
              Línea 102: const interval = setInterval(() => { ... }, 1000);
              El interval se almacena en variable local dentro de runJob(); si el
              proceso recibe SIGTERM mientras runJob() está en await handler(ctx, args),
              el clearInterval de línea 114 nunca se ejecuta.
              No hay registro de intervals activos en la clase.
Impacto:      Shutdown del proceso deja setIntervals activos que intentan escribir
              al store después de que el store puede estar cerrado. En Node, los
              intervals pendientes impiden el cierre limpio del event loop.
Criterio de   1. JobRunner expone stop() o cancel() que cancela todos los intervals
aceptación:      de jobs en curso.
              2. O bien JobsToolkit expone un método de shutdown que espera a que
                 todos los handlers terminen antes de retornar.
              3. Test: JobRunner.stop() con un job activo no deja intervals colgados
                 (verificable con process._getActiveHandles() o equivalente).
Verificación: grep -n "stop\|cancel\|clearInterval\|intervals" packages/jobs/src/job-runner.ts
Estado:       ABIERTO
```

---

### P61-008

```
ID:           P61-008
Título:       packages/storage-sqlite sin tests propios
Severidad:    P1 — Componente de persistencia sin cobertura verificable
Evidencia:    Directorio packages/storage-sqlite/: no contiene carpeta test/ ni *.test.ts.
              Verificado con glob packages/storage-sqlite/**/*.test.ts → 0 resultados.
              El paquete incluye: SqliteStorage, JobStoreSqlite, InvoiceStoreSqlite,
              lógica de migración, transacciones, y serialización de BigInt.
Impacto:      La capa de persistencia SQLite (usada en explorer-backend, treasury,
              exchange-backend) no tiene tests. Bugs en migración, transacciones anidadas,
              o serialización de BigInt no se detectarán hasta ejecución.
Criterio de   Tests mínimos que cubran:
aceptación:   1. migrate() — ejecuta sin error y es idempotente (segunda llamada no falla).
              2. JobStoreSqlite.save() + get() — roundtrip correcto.
              3. JobStoreSqlite.update() — atomicidad: si el updater lanza, el registro
                 no queda modificado.
              4. InvoiceStoreSqlite.save() + get() — BigInt amount serializa y deserializa
                 correctamente (BigInt(row.amount) === original).
              5. Concurrencia básica: dos updates al mismo job no corrompen el registro.
Verificación: ls packages/storage-sqlite/test/ 2>$null || echo "NO TEST DIR"
              # Tras el fix: directorio existe con al menos 4 ficheros de test.
Estado:       ABIERTO
```

---

### P61-009

```
ID:           P61-009
Título:       packages/sync-daemon sin tests propios
Severidad:    P1 — Componente crítico de sincronización sin cobertura verificable
Evidencia:    Directorio packages/sync-daemon/: no contiene carpeta test/ ni *.test.ts.
              Verificado con glob packages/sync-daemon/**/*.test.ts → 0 resultados.
              El paquete contiene: pollLoop(), saveCheckpoint(), loadCheckpoint(),
              lógica de blueScore, shutdown via shutdownResolver.
Impacto:      El daemon es el componente que conecta el nodo Kaspa con el toolkit.
              Sin tests, cualquier regresión en el ciclo de polling (blueScore handling,
              shutdown race, checkpoint atómico) pasa sin detección.
Criterio de   Tests mínimos con mock backend:
aceptación:   1. start() → pollLoop arranca; stop() → pollLoop termina limpiamente.
              2. Si blueScore avanza, lastProcessedBlueScore se actualiza.
              3. saveCheckpoint() escribe el fichero con patrón tmp+rename (verificar
                 que checkpointPath existe y el .tmp no queda residual).
              4. loadCheckpoint() en fichero existente restaura lastProcessedBlueScore.
              5. Si backend.connect() lanza, el daemon registra el error y reintenta
                 en lugar de propagarlo al caller.
Verificación: ls packages/sync-daemon/test/ 2>$null || echo "NO TEST DIR"
Estado:       ABIERTO
```

---

### P61-010

```
ID:           P61-010
Título:       Documentación API declara métodos y clases que no existen en el código
Severidad:    P1 — Bloquea integración de cualquier consumidor externo
Evidencia:    Comparación docs/reference/ y docs/book/ contra código en packages/:
              - wallet.connect()       → no existe en WalletToolkit
              - wallet.history()       → no existe en WalletToolkit
              - wallet.transfer(tx)    → no existe en WalletToolkit
              - DAGToolkit.open({...}) → no existe; la clase es IndexerToolkit con .dag.*
              - SilverToolkit          → no existe como export en toolkit/src/index.ts
              - silver.template()      → no existe
              - WalletToolkit.open({name:...}) → firma incorrecta; name es primer argumento,
                no dentro del objeto options
Impacto:      Un desarrollador que siga la documentación oficial obtendrá TypeError
              en el primer intento. La friction de integración es máxima.
Criterio de   1. Cada método listado en docs existe en el código con la misma firma,
aceptación:      o la referencia al método se elimina/mueve a "roadmap".
              2. WalletToolkit.open() en docs refleja firma real: open(name: string, options?: ...).
              3. Si SilverToolkit no está listo, la sección en docs dice
                 "not yet implemented in this version".
              4. Ninguna sección de referencia en docs/ apunta a un símbolo que no
                 exporte packages/toolkit/src/index.ts.
Verificación: grep -rn "wallet\.connect\|wallet\.history\|wallet\.transfer\|DAGToolkit\|SilverToolkit" docs/
              # Tras el fix: 0 resultados, o resultados solo en secciones "roadmap".
Estado:       ABIERTO
```

---

## P2 — Deuda técnica y calidad

---

### P61-011

```
ID:           P61-011
Título:       package.json de toolkit y jobs sin campos "files" ni "exports"
Severidad:    P2 — Publish incluiría ficheros de desarrollo; tree-shaking no funciona
Evidencia:    packages/toolkit/package.json y packages/jobs/package.json no contienen
              campo "files" (verificar con: grep -l '"files"' packages/toolkit/package.json).
              Sin "files": pnpm publish incluye todo el directorio (src/, test/, tsconfig.json).
              Sin "exports": los bundlers no pueden resolver submódulos; no hay
              distinción entre ESM y CJS para consumidores externos.
Impacto:      Cualquier publicación en npm expone código fuente y configuración interna.
              Los consumidores no pueden hacer import {X} from '@hardkas/toolkit/wallet'
              de forma portable.
Criterio de   1. packages/toolkit/package.json tiene "files": ["dist"] (o equivalente).
aceptación:   2. packages/toolkit/package.json tiene "exports" con al menos el
                 entry point principal: ".": "./dist/index.js".
              3. packages/jobs/package.json idem.
              4. pnpm pack --dry-run en ambos paquetes no lista src/ ni test/.
Verificación: node -e "const p=require('./packages/toolkit/package.json'); console.log(!!p.files, !!p.exports)"
              # Tras el fix: true true
Estado:       ABIERTO
```

---

### P61-012

```
ID:           P61-012
Título:       Verificar sustitución de workspace:* antes de publish
Severidad:    P2 — Los paquetes publicados no resolverían dependencias internas
Evidencia:    packages/toolkit/package.json y otros tienen dependencias con
              "workspace:*" (protocolo pnpm interno). Este protocolo no es válido
              en npm registry — pnpm publish debe sustituirlo por la versión real.
              No se ha verificado que el campo "publishConfig" o el workflow de
              publicación realice esa sustitución correctamente.
Impacto:      Si publish no sustituye workspace:*, los consumidores externos obtendrían
              ETARGET al instalar, ya que npm no conoce el protocolo workspace:.
Criterio de   1. Hay un script o workflow que ejecuta pnpm publish con
aceptación:      --no-git-checks o equivalente que garantiza la sustitución.
              2. O bien los package.json de los paquetes publicables tienen
                 "publishConfig.dependencies" con versiones reales.
              3. Test: pnpm pack en cualquier paquete publicable produce un tarball
                 donde ninguna dependencia contiene "workspace:".
Verificación: grep -r "workspace:\*" packages/toolkit/package.json packages/jobs/package.json
              # En el tarball: tar -tzf <pack>.tgz | xargs grep "workspace:" → 0 resultados
Estado:       ABIERTO
```

---

### P61-013

```
ID:           P61-013
Título:       SnapshotToolkit.restore(), branch() y diff() no son ejercitados por
              ningún reference-app
Severidad:    P2 — Funcionalidad declarada sin evidencia de funcionamiento
Evidencia:    Lectura completa de los 5 reference-apps (merchant-backend, wallet-service,
              explorer-backend, treasury, exchange-backend): ninguno llama restore(),
              branch(), diff(), compare() ni list() de SnapshotToolkit.
              Todos usan únicamente open() y create().
              Adicionalmente: register() nunca se llama — los snapshots capturan
              participantes vacíos porque nadie registra estado antes de create().
Impacto:      El claim de "crash recovery via snapshot" no tiene evidencia de que
              restore() funcione. Si restore() está roto, no hay test que lo detecte.
Criterio de   1. Al menos un test o reference-app ejercita el ciclo completo:
aceptación:      create() → [modificar estado] → restore() → verificar estado restaurado.
              2. register() se llama con al menos un participante antes de create()
                 en el test, para verificar que el estado se captura realmente.
              3. Si branch() y diff() son features opcionales, se documenta su estado
                 (implementado / no implementado) en docs/11-limitations.md.
Verificación: grep -rn "restore\|branch\|diff\|register" examples/reference-apps/
              # Tras el fix: al menos restore aparece en un test o reference-app.
Estado:       ABIERTO
```

---

### P61-014

```
ID:           P61-014
Título:       plugin-rpc-backend history() retorna [] sin implementación ni advertencia
Severidad:    P2 — Stub silencioso en API de historial
Evidencia:    packages/plugin-rpc-backend/src/index.ts líneas 89-92 (aproximado):
              async history(address: string): Promise<any[]> {
                  // TODO: implement via getUtxosByAddresses history
                  return [];
              }
              No lanza error, no loguea warning. El caller recibe [] y asume que
              la dirección no tiene historial.
Impacto:      Cualquier feature de historial de transacciones retorna silenciosamente
              vacío. El bug es difícil de detectar porque [] es un array válido.
Criterio de   Opción A: implementar history() contra el nodo RPC.
aceptación:   Opción B: lanzar NotImplementedError con mensaje explícito.
              En ningún caso: retornar [] silenciosamente.
              Test que verifica la opción elegida.
Verificación: grep -n "history\|TODO\|return \[\]" packages/plugin-rpc-backend/src/index.ts
Estado:       ABIERTO
```

---

### P61-015

```
ID:           P61-015
Título:       Eliminar o reemplazar claims de readiness no demostradas en READY.md y docs
Severidad:    P2 — Violación de política de proyecto (ver docs/release-claims.md)
Evidencia:    Ficheros en la raíz del repo:
              EXCHANGE_BACKEND_REFERENCE_READY.md
              EXCHANGE_CRASH_RECOVERY_VALIDATED.md
              EXCHANGE_RECONCILIATION_VALIDATED.md
              (y otros READY.md detectados en git status)
              Estos ficheros usan language de validación que la política del proyecto
              (docs/release-claims.md) prohíbe sin evidencia instrumentada.
              Ejemplo del tipo de claim prohibido: "production-ready", "validated",
              "ready for".
Impacto:      Contradice la política de claims del proyecto. Puede inducir a asumir
              madurez mayor que la demostrada en esta auditoría.
Criterio de   1. Todos los READY.md de la raíz se eliminan o se convierten en ficheros
aceptación:      de evidencia con formato estructurado que cumpla docs/release-claims.md.
              2. Ningún fichero en la raíz contiene los strings prohibidos listados
                 en docs/release-claims.md.
              3. Si los ficheros documentan resultados de ejecución de gauntlets,
                 se mueven a smoke-gauntlet/results/ o equivalente con formato de
                 evidencia, no de claim de readiness.
Verificación: grep -rl "production.ready\|validated\|READY" *.md
              # Tras el fix: 0 resultados en raíz, o solo en formato de evidencia permitido.
Estado:       ABIERTO
```

---

## Criterio general de cierre de P61

```
- Todos los ítems P0 (001-005): CERRADOS con al menos un test por ítem.
- Todos los ítems P1 (006-010): CERRADOS o DOCUMENTADOS como limitación explícita
  en docs/11-limitations.md o docs/limitations.md.
- Todos los ítems P2 (011-015): CERRADOS o planificados en el roadmap siguiente.
- Auditoría de segunda ronda ejecutada con las mismas reglas: lectura directa de código,
  sin confianza en markdown de certificación.
- La segunda auditoría no encuentra critical findings verificables nuevos en los
  componentes cubiertos por este backlog.
- Ningún fichero *.READY.md ni *_VALIDATED.md en la raíz del repo.
- Docs de referencia alineadas con exports reales del código.
```

---

## Tracking de progreso

| ID | Título corto | Prioridad | Estado |
|---|---|---|---|
| P61-001 | SyncDaemon no integra IndexerToolkit/Jobs | P0 | ABIERTO |
| P61-002 | receipt() hardcoded "paid" | P0 | ABIERTO |
| P61-003 | watch() handler vacío | P0 | ABIERTO |
| P61-004 | createInvoice() unidad KAS/sompi ambigua | P0 | ABIERTO |
| P61-005 | planSend()/estimateFee() stubs silenciosos | P0 | ABIERTO |
| P61-006 | JobStoreJson race + no atómico | P1 | ABIERTO |
| P61-007 | JobRunner sin stop() | P1 | ABIERTO |
| P61-008 | storage-sqlite sin tests | P1 | ABIERTO |
| P61-009 | sync-daemon sin tests | P1 | ABIERTO |
| P61-010 | Docs vs código desalineados | P1 | ABIERTO |
| P61-011 | package.json sin files/exports | P2 | ABIERTO |
| P61-012 | workspace:* publish audit | P2 | ABIERTO |
| P61-013 | SnapshotToolkit restore/branch/diff sin ejercitar | P2 | ABIERTO |
| P61-014 | history() retorna [] silenciosamente | P2 | ABIERTO |
| P61-015 | Eliminar READY.md claims no demostradas | P2 | ABIERTO |
