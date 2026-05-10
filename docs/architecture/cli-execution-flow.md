# HardKas CLI Execution Flow

## 1. Executive Summary
El CLI de HardKAS está construido sobre la librería **Commander.js**. El flujo de ejecución comienza en un punto de entrada binario (`index.ts`) que registra múltiples grupos de comandos modulares. Cada grupo reside en un archivo de comando dedicado que define la interfaz (argumentos y flags) y delega la ejecución pesada a un **Runner**. Los Runners actúan como orquestadores de los paquetes internos (`@hardkas/*`), gestionando la carga de configuración, la interacción con RPC/Localnet y la producción de **Artifacts** deterministas. La salida está parcialmente centralizada en UI helpers, aunque persiste lógica de formateo inline en diversos módulos.

## 2. Entrypoint

Analizado: `packages/cli/src/index.ts`.

El entrypoint es un binario ejecutable de Node.js que sirve como despachador central para todas las funcionalidades del framework.

| Elemento | Valor | Archivo | Nota |
| :--- | :--- | :--- | :--- |
| **CLI Package Version** | `0.2.2-alpha` | `package.json` | Versión declarada en el manifiesto del paquete |
| **CLI Runtime Version** | `0.2.2-alpha` | `index.ts` | Constante `HARDKAS_VERSION` en el código fuente |
| **Shebang** | `#!/usr/bin/env node` | `index.ts` | Permite ejecución directa en Unix/Linux/macOS |
| **Binario** | `hardkas` | `package.json` | Mapeado en la sección `bin` del paquete CLI |
| **Registro** | Estático | `index.ts` | Llama a 16 funciones `registerXCommands` |
| **Parseo** | `parseAsync` | `index.ts` | Soporta flujos asíncronos en todos los comandos |

## 3. Bootstrap Sequence

Flujo detallado desde la invocación hasta la salida:

1.  **Invocación**: El usuario ejecuta `hardkas <cmd> [args]`.
2.  **Carga de Binario**: Node carga `@hardkas/cli/dist/index.js`.
3.  **Registro de Comandos**: `index.ts` importa estáticamente los módulos en `src/commands/`.
    - **Impacto en Startup**: Si un módulo de comando importa runners de forma estática, estos entran en el grafo inicial de carga.
    - *Excepción*: Comandos como `query.ts` utilizan `import()` dinámico para componentes pesados como el `QueryEngine`.
4.  **Definición de Interfaz**: Cada `registerXCommands` añade subcomandos a la instancia de Commander.
5.  **Matching**: Commander identifica el comando solicitado y valida los argumentos.
6.  **Action Dispatch**: Se ejecuta el callback `.action(...)`.
7.  **Runner Execution**: El action delega en un Runner (ej. `runTxPlan`) pasando las opciones parseadas.
8.  **Internal Integration**: El Runner carga el estado (Config, Keystore, Localnet) y llama a paquetes `@hardkas/*`.
9.  **Producción de Resultado**: Se genera un objeto de resultado (frecuentemente un Artifact).
10. **Output**: El módulo de comando produce la salida (UI Table o JSON).

### Diagrama de Flujo Conceptual (Ejemplo: `hardkas tx plan`)

```text
hardkas tx plan
  ↓
index.ts (main())
  ↓
  ├── registerTxCommands(program)
  │     ↓
  │     tx.ts → program.command("tx")
  │               ↓
  │               plan subcommand
  ↓
Commander.parseAsync()
  ↓
tx.ts: .action(options)
  ↓
  ├── await loadHardkasConfig() (@hardkas/config)
  └── runTxPlan(input) (runners/tx-plan-runner.ts)
        ↓
        ├── @hardkas/accounts (resolve address)
        ├── @hardkas/localnet (get UTXOs if simulated)
        ├── @hardkas/tx-builder (create plan)
        └── @hardkas/artifacts (create artifact)
  ↓
Output logic (UI helpers or inline formatting)
```

## 4. Command Registration Map

| Grupo | Función registradora | Archivo | Tipo | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **init** | `registerInitCommands` | `init.ts` | Root | `🟢 VERIFIED` |
| **tx** | `registerTxCommands` | `tx.ts` | Grouped | `🟢 VERIFIED` |
| **artifact** | `registerArtifactCommands` | `artifact.ts` | Grouped | `🟢 VERIFIED` |
| **replay** | `registerReplayCommands` | `replay.ts` | Grouped | `🟢 VERIFIED` |
| **snapshot** | `registerSnapshotCommands` | `snapshot.ts` | Grouped | `🟢 VERIFIED` |
| **rpc** | `registerRpcCommands` | `rpc.ts` | Grouped | `🟢 VERIFIED` |
| **dag** | `registerDagCommands` | `dag.ts` | Grouped | `🟡 PARTIAL` |
| **accounts** | `registerAccountsCommands` | `accounts.ts` | Grouped | `🟢 VERIFIED` |
| **l2** | `registerL2Commands` | `l2.ts` | Grouped | `🟢 VERIFIED` |
| **node** | `registerNodeCommands` | `node.ts` | Grouped | `🟢 VERIFIED` |
| **config** | `registerConfigCommands` | `config.ts` | Grouped | `🟢 VERIFIED` |
| **misc** | `registerMiscCommands` | `misc.ts` | Misc | `🟢 VERIFIED` |
| **query** | `registerQueryCommands` | `query.ts` | Grouped | `🟢 VERIFIED` |
| **test** | `registerTestCommands` | `test.ts` | Root | `🟠 MOCK` |
| **doctor** | `registerDoctorCommand` | `doctor.ts` | Root | `🟢 VERIFIED` |
| **faucet** | `registerFaucetCommand` | `faucet.ts` | Alias | `🟢 VERIFIED` |

## 5. Command Module Anatomy

Un módulo de comando (ej. `tx.ts`) define la interfaz pública y delega la ejecución.

### Estructura típica:
1.  **Imports de Runners**: Habitualmente estáticos, lo que afecta al grafo de carga inicial.
2.  **Registro**: Función que recibe la instancia `program`.
3.  **Acción**: Callback asíncrono que puede usar `await import()` para dependencias pesadas.

## 6. Runner Layer

La capa de Runners es el cerebro operativo desacoplado de la interfaz de Commander.

| Runner | Usado por comando | Package interno | Responsabilidad | Output |
| :--- | :--- | :--- | :--- | :--- |
| `runTxPlan` | `tx plan` | `@hardkas/tx-builder` | Cálculo de masa y selección UTXO | `TxPlanArtifact` |
| `runTxSign` | `tx sign` | `@hardkas/artifacts` | Firma criptográfica Kaspa | `SignedTxArtifact` |
| `runTxSend` | `tx send` | `@hardkas/kaspa-rpc` | Broadcast de transacción firmada | TX ID |
| `runTxFlow` | `tx send --from...` | Varios | Orquestación completa Plan-Sign-Send | Transaction Result |
| `runAccountsRealGenerate` | `accounts real generate`| `@hardkas/sdk` | Creación de llaves Kaspa | Keystore Item |
| `runRpcHealth` | `rpc health` | `@hardkas/kaspa-rpc`| Latencia y sincronización de nodo | Health Report |
| `runNodeStart` | `node start` | `@hardkas/node-runner`| Gestión de ciclo de vida Docker | Docker Status |
| `runDoctor` | `doctor` | Varios | Auditoría de integridad del sistema | Diagnosis Report |
| `runReplayVerify` | `replay verify` | `@hardkas/artifacts` | Validación de invariantes históricos | Audit Report |
| `runSnapshotRestore` | `snapshot restore`| `@hardkas/localnet` | Restauración de estado de simulador | Success/Fail |
| `runArtifactVerify`| `artifact verify` | `@hardkas/artifacts` | Validación de esquema Zod | Reporte de integridad |
| `runL2TxBuild` | `l2 tx build` | `@hardkas/l2` | Planificación EVM | `IgraTxPlanArtifact` |

## 7. Package Boundary Map (Conceptual)

| Package interno | Usado desde | Responsabilidad en flujo CLI | Observaciones |
| :--- | :--- | :--- | :--- |
| `@hardkas/config` | Commands/Runners | Carga y resolución de configuración | — |
| `@hardkas/artifacts` | Runners/UI | Modelos de datos y validación | — |
| `@hardkas/accounts` | Runners | Direcciones y Keystore | — |
| `@hardkas/tx-builder`| Runners | Lógica de construcción de TXs | Pura computación |

## 8. Config Loading Flow

La carga de configuración es lazy por comando y delegada habitualmente en las acciones.

| Comando | Carga config | Dónde | Usa `--config` | Qué ocurre si falta |
| :--- | :--- | :--- | :--- | :--- |
| `tx plan` | Sí | Action | Sí | Error controlado |
| `accounts list` | Sí | Action | Sí | Intenta cargar y puede usar defaults según loader |
| `doctor` | Sí | Runner | No | Reporta aviso en diagnóstico |

## 9. Artifact Flow

HardKAS basa su arquitectura en el paso de mensajes (Artifacts) entre comandos.

```text
tx plan → txPlan.json → tx sign → signedTx.json → tx send → txReceipt
```

## 10. JSON Output Flow

La consistencia del output JSON es parcial.
- **Formateo**: Algunos comandos usan helpers unificados mientras otros realizan el formateo inline.
- **Errores**: Los errores JSON **no están estandarizados** actualmente.
- **Mezcla**: Algunos comandos mezclan texto informativo en `stdout` con el objeto JSON, dificultando el pipe directo.

| Comando | Tiene `--json` | Output shape | Consistente | Nota |
| :--- | :--- | :--- | :--- | :--- |
| `tx plan` | Sí | Full Artifact | Sí | — |
| `accounts list` | Sí | Array of accounts | Sí | — |
| `query *` | Sí | `QueryResult` | Sí | — |

## 11. Help System & Functional State

- **Limitación Arquitectónica**: El sistema de ayuda actual describe la forma y los flags, pero **no comunica el estado funcional** real (MOCK, DISABLED, PARTIAL, EXPERIMENTAL).

## 12. Lazy Loading / Startup Cost

- **Formulación Precisa**: Los módulos de comando se importan estáticamente desde `index.ts`. Si estos módulos a su vez importan runners de forma estática, dichos runners entran en el grafo de carga inicial.
- **Optimización**: `query.ts` emplea importaciones dinámicas de forma consistente.

## 13. CLI Flow Examples (Compact)

### Example A: `hardkas tx plan`
- **Command Path**: `tx.ts` → `runTxPlan`.
- **Config Load**: En la acción del comando.
- **Internal**: Usa `@hardkas/tx-builder` para lógica de masa/comisión.
- **Output**: `txPlan.json` en disco o representación tabular en consola.

### Example B: `hardkas accounts real generate`
- **Context**: Keystore local (`.hardkas/keystore`).
- **Internal**: Utiliza el SDK de Kaspa para derivar llaves.
- **Output**: Entrada cifrada en archivo JSON local y confirmación en texto.

### Example C: `hardkas query dag conflicts`
- **Registration**: Registro bajo el grupo `query`.
- **Engine**: Llama al `QueryEngine` (@hardkas/query) con modo `research`.
- **Logic**: Analiza el store relacional buscando UTXOs compartidos.

### Example D: `hardkas l2 tx send`
- **L2 Profile**: Carga perfil desde la configuración de red L2.
- **Runner**: `runL2TxSend` utiliza un cliente RPC EVM.
- **Outcome**: Broadcast a la capa 2 y obtención de hash/receipt L2.

### Example E: `hardkas test`
- **Flow**: Action inline directa en `test.ts`.
- **Mock**: No invoca runners ni paquetes de testing; imprime un string hardcodeado.
- **DX Risk**: Proporciona una señal de éxito falsa si no se lee con atención.

## 14. Architectural Problems Found

1.  **Startup Latency**: Debido al grafo de importación estática.
2.  **Mock de `test`**: Comando documentado como real pero con implementación estática.
3.  **Invisibilidad de Estado en Ayuda**: El `--help` no indica estados de madurez real.

## 15. Proposed CLI Architecture v1

La arquitectura v1 propone un **Command Manifest** tipado que actúe como fuente única de verdad para el registro, la ayuda y el lazy loading.

### Pseudocódigo de Manifest:

```typescript
// Proposed Registry Structure
export const CLI_MANIFEST = {
  commands: [
    {
      id: "tx.plan",
      path: ["tx", "plan"],
      description: "Generate a deterministic transaction plan",
      maturity: "stable",
      status: "verified",
      options: [
        { name: "--from", type: "string", required: true },
        { name: "--json", type: "boolean" }
      ],
      // Lazy load only when matched
      getRunner: () => import("./runners/tx-plan-runner.js"),
      artifacts: { produces: "txPlan" }
    }
  ]
};
```

### Beneficios:
- **Zero-cost startup**: No se carga código de runners hasta el matching.
- **Help automatizado**: Los estados `MOCK` o `DISABLED` se inyectan automáticamente en la descripción.
- **Validation**: Posibilidad de generar esquemas de validación de argumentos a partir del manifest.

## Guardrails

- No se modificó lógica runtime.
- No se modificaron comandos.
- No se modificaron runners.
- No se modificaron paquetes internos.
- Este documento es una auditoría arquitectónica, no una refactorización.
