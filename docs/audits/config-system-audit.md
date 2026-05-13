# HardKas Config System Audit

## 1. Scope
Esta auditoría analiza el sistema de configuración integral de HardKas, cubriendo:
- La definición de usuario en `hardkas.config.ts`.
- El paquete `@hardkas/config` (loader, tipos, resolución y valores por defecto).
- La validación (o falta de ella) en tiempo de ejecución.
- La integración con el CLI y el SDK.
- La gestión de redes (L1 y L2) y cuentas.

## 2. Executive Summary
HardKas utiliza un sistema de configuración basado en TypeScript, cargado dinámicamente mediante **jiti**. Esto permite una experiencia de desarrollador (DX) fluida con autocompletado nativo. El esquema está definido mediante interfaces de TypeScript en `@hardkas/config`, pero **carece de validación en tiempo de ejecución basada en esquemas**. Soporta arquitecturas multi-red (L1 Kaspa y L2 Igra) y una resolución de cuentas multi-capa. Los riesgos principales detectados son la ejecución de código arbitrario durante la carga y la ausencia de una validación estructural que prevenga errores de ejecución crípticos.

## 3. Config Entry Points

| Entry point | Archivo | Responsabilidad | Observaciones |
| :--- | :--- | :--- | :--- |
| `defineHardkasConfig` | `config/src/define.ts` | Ayudante de tipado para el usuario | No realiza validación lógica, solo inferencia de tipos TS. |
| `loadHardkasConfig` | `config/src/load.ts` | Localización y carga del archivo | Usa `jiti` e importa dinámicamente el archivo TS/JS. |
| `resolveNetworkTarget`| `config/src/resolve.ts` | Mapeo de nombre a configuración real | Gestiona el fallback hacia `defaultNetwork` o `simnet`. |
| `Hardkas.open()` | `sdk/src/index.ts` | Inicialización del SDK con config | Punto de entrada principal para herramientas programáticas. |
| `hardkas config show` | `cli/src/commands/config.ts`| Inspección visual de config | Muestra el estado cargado pero no valida integridad profunda. |
| `hardkas init` | `cli/src/commands/init.ts` | Generación de proyecto base | Crea el archivo `hardkas.config.ts` inicial. |

## 4. Config Schema

| Campo | Tipo | Requerido | Default | Validación | Notas |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `defaultNetwork` | `string` | No | `"simnet"` | Ninguna | Define la red activa por defecto. |
| `networks` | `Record<string, NetworkTarget>`| No | Built-ins | Ninguna | Mapa de perfiles de red (L1/L2). |
| `accounts` | `Record<string, AccountConfig>`| No | Deterministic | Ninguna | Mapa de identidades y signers. |
| `paths` | `NOT_PRESENT` | — | — | — | Actualmente los paths están hardcoded en runners/core. |
| `l2` | `NOT_PRESENT` | — | — | — | La configuración L2 vive dentro de `networks`. |

## 5. Network Kinds

| kind | Tipo de red | Campos requeridos | Campos opcionales | Usado por | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `simulated` | L1 In-memory | `kind` | None | Localnet | SUPPORTED |
| `kaspa-node` | Nodo local (Docker)| `kind`, `network` | `rpcUrl`, `dataDir`, `binaryPath` | Node Runner | SUPPORTED |
| `kaspa-rpc` | Nodo remoto (RPC) | `kind`, `network`, `rpcUrl` | None | CLI / SDK | SUPPORTED |
| `igra` | L2 (EVM based) | `kind`, `chainId`, `rpcUrl`| `currencySymbol` | L2 Runners | PARTIAL (Revisar integración con perfiles) |

## 6. Accounts Schema

| Account kind | Campos | Uso | Estado | Riesgo |
| :--- | :--- | :--- | :--- | :--- |
| `simulated` | `address` | Dev workflows / Localnet | SUPPORTED | LOW (Fondos ficticios) |
| `kaspa-private-key` | `privateKeyEnv`, `address` | Firma L1 real | SUPPORTED | MEDIUM (Requiere .env seguro) |
| `evm-private-key` | `privateKeyEnv`, `address` | Firma L2 real | SUPPORTED | MEDIUM (Requiere .env seguro) |
| `external-wallet` | `walletId`, `address` | Referencia externa | SUPPORTED | LOW (Solo lectura/workflow) |

## 7. Loader TypeScript

| Aspecto | Implementación real | Riesgo | Recomendación |
| :--- | :--- | :--- | :--- |
| Engine | `jiti` | LOW | Mantener. Es estándar y rápido. |
| Resolución | Búsqueda hacia arriba (Upward search) | MEDIUM | Limitar a la raíz del proyecto para evitar confusiones. |
| Extensiones | `.ts`, `.mts`, `.js`, `.mjs` | LOW | Excelente soporte multi-formato. |
| Seguridad | Ejecución de código arbitrario | HIGH | Destacar el **Trust Boundary**. |
| CLI Flag | Soporta `--config <path>` | LOW | Implementado consistentemente en la mayoría de comandos. |

> [!IMPORTANT]
> **Trust Boundary**: `hardkas.config.ts` is trusted code. HardKas executes this file during startup. Do not run HardKas inside untrusted repositories.

## 8. Validation Flow

El flujo actual es puramente reactivo:
1. `loadHardkasConfig()` localiza el archivo.
2. `jiti.import()` ejecuta el código.
3. Se obtiene el objeto exportado.
4. **Gualda de tipos**: TypeScript valida en tiempo de compilación (si se usa `defineHardkasConfig`).
5. **Runtime**: No hay validación estructural.

**Propuesta v1**:
Añadir validación de esquema en tiempo de ejecución (ej. con **Zod**) para proporcionar mensajes de error unificados y descriptivos antes de que los runners fallen por campos indefinidos.

## 9. Defaults

| Default | Valor | Dónde se define | Motivo | Riesgo |
| :--- | :--- | :--- | :--- | :--- |
| `defaultNetwork` | `"simnet"` | `config/defaults.ts` | Simplicidad "out of the box" | LOW |
| `simnet` | `{ kind: "simulated" }` | `config/defaults.ts` | Core testing environment | LOW |
| `accounts (Runtime)`| `alice`, `bob`, `carol` | `resolve.ts` / `localnet` | Determinismo en tests y localnet | LOW |
| `rpcUrl` (Node) | `ws://127.0.0.1:18210` | `cli/runners` / `sdk` | Puerto estándar kaspad | MEDIUM (Si colisiona) |

## 10. `hardkas init` Template

| Archivo generado | Contenido | Riesgo | Recomendación |
| :--- | :--- | :--- | :--- |
| `hardkas.config.ts` | Template: `alice`, `bob` | LOW | Añadir más comentarios explicativos. |
| `package.json` | Dependencia `@hardkas/sdk` | LOW | Incluir scripts útiles (up, test). |
| `.gitignore` | `NOT_PRESENT` | **HIGH** | Generar por defecto para excluir `.hardkas/` y `.env`. |

## 11. CLI Usage of Config

| Comando | Carga config | Acepta `--config` | Usa `defaultNetwork` | Usa accounts | Usa networks | Notas |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `config show` | Sí | Sí | Sí | Sí | Sí | Punto de inspección. |
| `accounts list` | Sí | Sí | No | Sí | No | Mezcla config + keystore. |
| `tx plan` | Sí | Sí | Sí | Sí | Sí | Crucial para resolución. |
| `tx sign` | Sí | Sí | No | Sí | No | Requiere acceso a keys. |
| `node start` | Sí | Sí | No | No | Sí | Valida el target node. |
| `doctor` | Sí | No | Sí | No | No | Debería aceptar `--config`. |

## 12. Error Messages

| Error case | Mensaje actual | Bueno/Malo | Problema | Recomendación |
| :--- | :--- | :--- | :--- | :--- |
| Archivo no encontrado | `HardKAS config file not found at ...` | Bueno | Claro y preciso. | Ninguna. |
| Red desconocida | `Unknown HardKAS network 'X'. Available: ...` | Bueno | Lista las opciones disponibles. | Ninguna. |
| Error sintaxis TS | `Failed to load HardKAS config at ...: [jiti error]` | Malo | El error de jiti puede ser críptico. | Ayuda contextual. |
| Campo faltante | `Cannot read property 'kind' of undefined` | Malo | Fallo en tiempo de ejecución. | Esquema de validación. |

## 13. Security Review

- **Arbitrary Code Execution**: **HIGH**. El archivo de configuración puede ejecutar procesos. HardKas asume que el usuario confía en el repositorio donde ejecuta la herramienta.
- **Secrets in Config**: **MEDIUM**. Aunque se promueve `privateKeyEnv`, existe riesgo de hardcoding.
- **Exposure Risk**: **HIGH**. La ausencia de un `.gitignore` generado por defecto es un riesgo de fuga de datos.

## 14. Type Safety Review

- **Define Helper**: Útil para autocompletado, pero no obliga al usuario a usarlo.
- **Discriminated Unions**: Presentes en TypeScript, pero no se aprovechan en runtime.

## 15. Comparison With Hardhat Config

| Aspecto | HardKas | Hardhat | Observación |
| :--- | :--- | :--- | :--- |
| TS Execution | Jiti | ts-node | HardKas es más ligero en dependencias. |
| Network Defs | Basado en `kind` | Basado en URL | HardKas separa L1 de L2. |

## 16. Problems Found

1. **Falta de Validación Runtime**: El sistema confía ciegamente en el tipado estático de TS.
2. **Integración L2**: Los perfiles L2 parecen depender parcialmente de built-ins; revisar la integración completa con `networks.kind = "igra"`.
3. **Paths Hardcoded**: No se pueden configurar las rutas de `.hardkas/artifacts` desde el config.
4. **Ausencia de .gitignore**: Riesgo de seguridad por fuga accidental de secretos.

## 17. Conclusion: Status

**Config System Status: FUNCTIONAL BUT UNDER-VALIDATED**

### Strengths:
- TS config nativo.
- `defineHardkasConfig` DX (Autocompletado).
- Tipos de red (`kind`) explícitos.
- Excelente onboarding inicial con `simnet` por defecto.

### Risks:
- No hay validación de esquema en tiempo de ejecución (runtime schema validation).
- El config TS ejecuta código arbitrario (Trust Boundary).
- Falta generación de `.gitignore` por defecto.
- Rutas (`paths`) grabadas en el código (hardcoded).
- Soporte inconsistente de `--config` en algunos comandos diagnósticos.
- La integración de perfiles L2 personalizados requiere verificación.

## 18. Recommendations

### Critical
- **Generar .gitignore**: El comando `hardkas init` debe crear un `.gitignore`.
- **Validación Estructural**: Añadir validación de esquema (ej. Zod) para dar errores descriptivos.

### High
- **Unificar L2 Profiles**: Asegurar que perfiles L2 del config funcionen en todo el toolchain.
- **Configurabilidad de Paths**: Añadir el campo `paths` al esquema.

## 19. Checklist

- [x] Revisar schema
- [x] Revisar loader TS
- [x] Revisar validation
- [x] Revisar network kinds
- [x] Revisar defaults
- [x] Revisar error messages
- [x] No modificar lógica runtime
- [x] No modificar loader
- [x] No modificar schema
- [x] No modificar comandos

## Guardrails
No se modificó lógica runtime.
No se modificó el loader.
No se modificó el schema.
No se modificaron comandos.
Esta auditoría es documental.
