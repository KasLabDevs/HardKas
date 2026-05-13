# HardKas Docker Node Runner Audit

## 1. Scope
Esta auditoría evalúa la orquestación de contenedores Docker para el nodo local de Kaspa. Se han analizado:
- Los comandos CLI: `hardkas node start`, `status`, `stop`, `restart`, `logs`, y `reset`.
- El paquete interno `@hardkas/node-runner` y su clase `DockerKaspadRunner`.
- La gestión de imágenes, volúmenes, puertos y el ciclo de vida del contenedor `kaspad`.
- La integración con el sistema de configuración y la seguridad de las operaciones destructivas.

## 2. Executive Summary
El Node Runner de HardKas es una herramienta funcional y robusta para levantar entornos de desarrollo locales (`simnet`) con un solo comando. Utiliza el CLI de Docker de forma determinista y gestiona bien la persistencia de datos mediante *bind mounts*.

Sin embargo, el sistema presenta riesgos de reproducibilidad debido al uso de tags de imagen no fijados (`latest`) y carece de verificaciones de salud a nivel de aplicación (RPC), limitándose a comprobar si el proceso del contenedor está vivo.

**Clasificación del sistema:**
- **Docker orchestration:** GOOD (Simple y efectiva mediante `execa`).
- **Image management:** WEAK (Uso de `latest` por defecto).
- **Health checks:** WEAK (Solo verifica el estado del contenedor, no la disponibilidad del RPC).
- **Logs UX:** GOOD (Soporta `tail` y `follow`).
- **Cleanup safety:** GOOD (Protegido por confirmación en el CLI).
- **Config integration:** PARTIAL (La mayoría de los valores son *defaults* internos del runner).
- **Developer usability:** GOOD (Abstracción clara del despliegue).

## 3. Node Command Inventory

| Command | Args | Flags | Runner | Side effects | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `node start` | - | `--image` | `runNodeStart` | Crea y arranca un contenedor Docker. | LOW |
| `node status`| - | - | `runNodeStatus` | Ninguno (Inspección). | LOW |
| `node stop`  | - | - | `runNodeStop` | Detiene y elimina el contenedor. | LOW |
| `node restart`| - | - | `runNodeRestart`| Ciclo stop/start. | LOW |
| `node logs`  | - | `--tail`, `--follow`| `runNodeLogs` | Ninguno (Stream de logs). | LOW |
| `node reset` | - | `--yes`, `--start` | `runNodeReset` | **Destructivo**: Borra datos de la cadena. | MEDIUM |

## 4. CLI Wiring
La conexión entre el comando `node.ts` y los runners es limpia y sigue el patrón del repositorio.

| Area | Behavior | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Reset Safety | Requiere `UI.confirm` a menos que se use `--yes`. | LOW | Mantener. Es una protección adecuada para entornos de dev. |
| Start Chain | `reset --start` permite una limpieza y reinicio rápido. | LOW | Útil para testing de CI. |
| Maturity | Los comandos están marcados como `stable` o `preview`. | LOW | Transparencia con el usuario. |

## 5. Docker Image Management
El runner gestiona la imagen de `rusty-kaspad`.

| Feature | Present | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Default Image | `kaspanet/rusty-kaspad:latest` | **HIGH** | El tag `latest` es mutable. Usar una versión específica (ej: `v0.1.0`) o un digest SHA para asegurar determinismo. |
| Image Override | SÍ (`--image`) | LOW | Permite al usuario probar versiones experimentales. |
| Auto-pull | SÍ (vía `docker run`) | LOW | Comportamiento estándar de Docker. |

## 6. Container Lifecycle
El ciclo de vida es idempotente: si el contenedor ya existe pero no está corriendo, el runner lo elimina antes de intentar levantarlo de nuevo.

| Lifecycle case | Current behavior | Idempotent | Risk |
| :--- | :--- | :--- | :--- |
| Start (Not exists) | Crea y arranca. | SÍ | LOW |
| Start (Exists & Running) | Devuelve el status actual sin cambios. | SÍ | LOW |
| Start (Exists & Stopped) | `docker rm -f` y vuelve a crear. | SÍ | LOW |
| Stop | Detiene y **elimina** el contenedor. | SÍ | LOW (Los datos persisten en el volumen). |

## 7. Network / Ports
El nodo expone tres puertos RPC fundamentales para Kaspa.

| Port / Network | Binding | Purpose | Risk |
| :--- | :--- | :--- | :--- |
| 16210 | 127.0.0.1 | gRPC (Core functionality) | LOW (Conflicto si ya hay un kaspad nativo). |
| 17210 | 127.0.0.1 | Borsh RPC (High performance) | LOW |
| 18210 | 127.0.0.1 | JSON RPC (Compatibility) | LOW |

**Nota técnica**: El runner mapea los puertos explícitamente en el comando `docker run`, lo que previene colisiones accidentales si no se especifican.

## 8. Data / Volume Management
HardKas utiliza *bind mounts* para persistir los datos de la cadena de bloques fuera del contenedor.

| Data item | Location | Persisted | Deleted by reset | Risk |
| :--- | :--- | :--- | :--- | :--- |
| Chain Data | `.hardkas/kaspad/` | SÍ | SÍ | LOW (Deseado para resetear el estado). |

El uso de `path.resolve` asegura que el volumen se monte correctamente independientemente de desde dónde se ejecute el CLI.

## 9. Health Checks
Esta es una de las áreas más débiles de la implementación actual.

| Health check | Present | Source | Risk | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| Container state | SÍ | `docker inspect` | MEDIUM | Un contenedor puede estar "running" pero el proceso `kaspad` puede estar en pánico o inicializando la DB. |
| RPC Probe | NO | - | **HIGH** | El CLI puede reportar que el nodo está "listo" antes de que el puerto RPC acepte conexiones. Implementar un ping `getinfo` post-start. |

## 10. Logs UX
Implementación sólida y funcional.

| Logs feature | Present | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Tail | SÍ (`--tail`) | LOW | Valor por defecto (100) razonable. |
| Follow | SÍ (`--follow`) | LOW | Hereda `stdout` directamente de Docker. |

## 11. Cleanup / Reset Safety
El comando `node reset` es la única operación peligrosa.

| Cleanup action | Protected | Destructive | Risk | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| Stop container | SÍ | NO | LOW | Solo apaga el servicio. |
| Remove Data | SÍ | **SÍ** | MEDIUM | Borra `.hardkas/kaspad`. Requiere confirmación manual. |

**Riesgo detectado**: El runner utiliza `fs.rm(..., { force: true })`, lo cual es extremadamente potente. Si la variable `dataDir` se corrompiera por configuración, podría borrar directorios no deseados.

## 12. Config Integration
El `DockerKaspadRunner` está parcialmente desconectado del sistema central de configuración.

| Config field | Used by node runner | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| image | NO (Usa default interno) | LOW | Permitir definir la imagen en `hardkas.config.ts`. |
| dataDir | NO (Usa default interno) | LOW | Sincronizar con el `root` del proyecto. |

## 13. Localnet Integration
El Node Runner es el pilar de la "Localnet Real". Mientras que el simulador DAG es ligero, el Node Runner permite testing contra el consenso real de Kaspa en modo `simnet`.

| Integration point | Current behavior | Risk |
| :--- | :--- | :--- |
| Artifact Generation | Los artefactos L1 (tx, plans) dependen de que este nodo esté arriba para ser emitidos/validados. | MEDIUM | Si el nodo no está sincronizado, los artefactos pueden ser inválidos. |

## 14. Error Handling
El manejo de errores es proactivo.

| Error case | Current behavior | User clarity | Recommendation |
| :--- | :--- | :--- | :--- |
| Docker missing | Lanza error explícito al iniciar. | EXCELLENT | Informa al usuario que instale Docker. |
| Port occupied | Docker falla y el runner propaga el error. | MEDIUM | Podría sugerir qué proceso está ocupando el puerto. |

## 15. Security / Safety Review
- **Image Trust**: Se descarga la imagen oficial de `kaspanet`, lo cual es seguro.
- **Port Exposure**: Solo se mapean los puertos RPC, no el puerto P2P por defecto hacia el exterior, reduciendo la superficie de ataque.
- **Isolation**: El uso de contenedores garantiza que los archivos de sistema del host no se vean afectados, excepto por el directorio de datos designado.

## 16. Findings

### GOOD
- **Abstracción Total**: El desarrollador no necesita saber cómo configurar un archivo `.conf` de kaspad ni instalar dependencias de C++/Rust.
- **Idempotencia**: El comando `start` es seguro de ejecutar múltiples veces.
- **Logs integrados**: No es necesario saltar a la terminal de Docker para ver qué está pasando.

### NEEDS HARDENING
- **Inestabilidad de `latest`**: Riesgo de que una actualización de imagen rompa el entorno de desarrollo local sin previo aviso.
- **Falta de verificación de salud (Ready check)**: El comando `start` termina antes de que el nodo esté realmente disponible para recibir transacciones.
- **Desconexión del Config**: Los perfiles de nodo deberían definirse en el `hardkas.config.ts`.

## 17. Recommendations

### P0 — Safety & Determinism
- **Pin de Imagen**: Cambiar `latest` por una versión específica (ej: `rusty-kaspad:v0.1.0`).
- **RPC Readiness Check**: Implementar un loop de reintentos (max 5s) que intente conectar al puerto gRPC tras el `docker run` para asegurar que el nodo está listo antes de devolver el control al usuario.

### P1 — UX & Config
- **Integración con Config**: Permitir que `dataDir` e `image` se lean del `hardkas.config.ts`.
- **Port Conflict Awareness**: Antes de ejecutar `docker run`, verificar si los puertos 16210, 17210 y 18210 están ocupados en el host para dar un mensaje de error más humano.

### P2 — Advanced Features
- **Node Profiles**: Permitir arrancar nodos en modo `mainnet` o `testnet-11` con flags específicos, aunque `simnet` sea el valor por defecto.

## 18. Proposed Node Runner v1
Evolucionar el runner hacia un modelo basado en perfiles:

```ts
// hardkas.config.ts
export default {
  node: {
    image: "kaspanet/rusty-kaspad:v0.1.0",
    dataDir: "./.node-data",
    ports: {
      rpc: 16210
    }
  }
}
```

## 19. Final Assessment
El módulo de orquestación Docker de HardKas es una de las piezas más estables y útiles del repositorio. Cumple con su misión de "hacer que Kaspa funcione localmente en 5 segundos". Con el ajuste de determinismo de imágenes (pinning) y una verificación de salud gRPC, estará listo para local developer workflows robustos y reproducibles.

## 20. Checklist
- [x] node start
- [x] node status
- [x] image management
- [x] health checks
- [x] logs
- [x] cleanup
- [x] No modificar lógica runtime
- [x] No modificar Node Runner
- [x] No modificar comandos
- [x] Auditoría documental únicamente

### Guardrails
- No se modificó lógica runtime.
- No se modificó el Node Runner.
- No se modificaron comandos de Docker.
- No se realizaron limpiezas destructivas de prueba.
- Esta auditoría es estrictamente documental para validar la infraestructura local.
