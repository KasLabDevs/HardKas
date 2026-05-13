# HardKas README vs CLI Mismatch Audit

## Scope
Esta auditoría compara la documentación pública y técnica de HardKas con el registro real de comandos en Commander.
Fuentes analizadas:
- `README.md` (Raíz)
- `docs/cli.md` (Guía de usuario avanzado)
- `docs/query-layer.md`
- `docs/what-actually-works.md` (Estado de estabilidad)
- `packages/cli/src/commands/*` (Código fuente real)
- `packages/cli/src/index.ts` (Punto de entrada del CLI)

## Method
1. Se extrajeron todos los comandos mencionados en la documentación.
2. Se compararon con el registro real en `index.ts` y sus respectivos archivos de comando.
3. Se verificaron flags, argumentos y estados funcionales (Verified, Partial, Mock, etc.).
4. Se identificaron sugerencias internas en el código que apuntan a comandos inexistentes.

## 1. Documented Commands Inventory

| Fuente | Comando documentado | Contexto | Flags documentadas | Estado en CLI real | Nota |
| :--- | :--- | :--- | :--- | :--- | :--- |
| README.md | `hardkas init` | Quickstart | — | **EXISTS** | Soporta `[name]` opcional en código. |
| README.md | `hardkas node start` | Quickstart | — | **EXISTS** | Soporta `--image` en código. |
| README.md | `hardkas accounts list` | Quickstart | — | **EXISTS** | Soporta `--json`, `--config`. |
| README.md | `hardkas tx send` | Quickstart | `--from, --to, --amount` | **EXISTS** | Soporta muchos más flags (url, network, etc). |
| README.md | `hardkas test` | Quickstart | — | **EXISTS** | Recientemente migrado de Mock a Vitest real. |
| README.md | `hardkas artifact verify` | Quickstart | `--recursive` | **EXISTS** | Soporta `--json`, `--strict`. |
| README.md | `hardkas example list` | Quickstart | — | **EXISTS** | Registrado en `misc.ts`. |
| docs/cli.md | `hardkas doctor` | Diagnostics | — | **EXISTS** | Comando real y funcional. |
| docs/cli.md | `hardkas query store index` | Store Sync | — | **NOT_REGISTERED** | Sugerencia fantasma. El comando real es `rebuild`. |
| docs/cli.md | `hardkas query store sql` | Raw Query | — | **NOT_REGISTERED** | Comando aspiracional no implementado. |
| docs/cli.md | `hardkas tx trace` | Tracing | `<txId>` | **DISABLED** | Registrado pero bloqueado intencionalmente. |

## 2. Real CLI Commands Missing From Docs

| Grupo | Comando real | Estado funcional | Archivo fuente | Debe documentarse en | Prioridad |
| :--- | :--- | :--- | :--- | :--- | :--- |
| query | `hardkas query store rebuild` | 🟢 VERIFIED | `query.ts` | `docs/cli.md` | **HIGH** |
| query | `hardkas query events` | 🟢 VERIFIED | `query.ts` | `docs/query-layer.md` | **HIGH** |
| accounts| `hardkas accounts real *` | 🟢 VERIFIED | `accounts.ts` | `README.md` (Keystore) | **MEDIUM** |
| faucet | `hardkas faucet` | 🟢 VERIFIED | `faucet.ts` | `README.md` | **MEDIUM** |
| snapshot| `hardkas snapshot *` | 🟡 PARTIAL | `snapshot.ts` | `docs/cli.md` | **MEDIUM** |
| config | `hardkas config show` | 🟢 VERIFIED | `config.ts` | `README.md` | **MEDIUM** |
| replay | `hardkas replay verify` | 🟢 VERIFIED | `replay.ts` | `docs/cli.md` | **LOW** |
| l2 | `hardkas l2 *` | 🟡 PARTIAL | `l2.ts` | `docs/l2-guide.md` (TBD) | **MEDIUM** |

## 3. Documented But Not Registered

| Comando documentado | Fuente | Por qué es problema | Acción recomendada |
| :--- | :--- | :--- | :--- |
| `hardkas query store index` | `docs/cli.md`, `doctor.ts` | El usuario recibe un error de "Unknown command". | Renombrar a `rebuild` en docs y código de doctor. |
| `hardkas query store sql` | `docs/cli.md` | Promesa de funcionalidad no cumplida. | Eliminar de docs o marcar como Roadmap. |
| `pnpm example:ci` | `README.md` | No verificado si el script de `package.json` existe. | Validar scripts en `packages/cli/package.json`. |

## 4. Registered But Incorrectly Documented

| Comando | Docs dicen | Código dice | Diferencia | Acción recomendada |
| :--- | :--- | :--- | :--- | :--- |
| `hardkas init` | `hardkas init` | `hardkas init [name]` | Soporta nombre de proyecto. | Actualizar README. |
| `hardkas tx send` | Flags básicos | Flags extensos | Faltan `--network`, `--url`, `--yes`. | Actualizar README o referenciar `--help`. |
| `hardkas test` | — | `--network, --watch, --json` | No se mencionan capacidades de red. | Documentar que usa Vitest. |

## 5. Status Mismatch

| Comando | Estado real | Cómo aparece en docs | Riesgo | Acción recomendada |
| :--- | :--- | :--- | :--- | :--- |
| `hardkas tx trace` | ⚫ DISABLED | Como feature "estrella" | **ALTO** (Decepción) | Marcar como "Coming Soon" o deshabilitar mención. |
| `hardkas accounts real lock`| 🟠 MOCK | Como feature de seguridad | **MEDIO** (Falsa seguridad) | Advertir que es una simulación de sesión. |
| `hardkas test` | 🟢 VERIFIED | Sin estatus claro | **BAJO** | Indicar que ahora es real y usa Vitest. |
| `Query Store (SQLite)` | 🟢 VERIFIED | "BROKEN / UNWIRED" | **MEDIO** (Desinformación) | Actualizar `what-actually-works.md` (Ya está conectado). |

## 6. README Gaps

- **Falta claridad en instalación**: No menciona que se requiere Docker para `hardkas node start`.
- **Falta explicación de Scopes**: No explica la diferencia entre `@hardkas/sdk` y `@hardkas/cli`.
- **Falta Badges de Estatus**: Los comandos no tienen tags de `stable/preview/research` en el README.
- **Falta documentación de Query**: El README no menciona el motor de introspección SQLite.
- **Falta advertencia de Mainnet**: La protección de `Mainnet Guards` debería ser más prominente.

## 7. Diff Conceptual

### Add to docs
- `hardkas query store rebuild` (Reemplaza a `index`).
- `hardkas query events` (Poderosa herramienta de debug).
- `hardkas faucet` (Esencial para dev workflow).
- `hardkas config show` (Útil para debug de entorno).

### Remove or mark as roadmap
- `hardkas query store sql` (Remover de guía de usuario actual).
- `hardkas tx trace` (Marcar como deshabilitado temporalmente).

### Correct
- Referencias a `query store index` -> `query store rebuild`.
- Argumentos de `hardkas init [name]`.

### Warn
- `hardkas accounts real lock` es solo cosmético.
- `hardkas l2` es experimental.

## 8. Recommendations

### Critical
1. **Sincronizar `index` -> `rebuild`**: Es el mismatch más visible que causa errores directos al usuario.
2. **Actualizar `what-actually-works.md`**: El Query Store YA está conectado. Mantenerlo como "Broken" desincentiva el uso de una de las mejores features del repo.

### High
1. **Generar CLI Reference**: Automatizar la generación de docs desde el Commander registry para evitar desincronización futura.
2. **Badge Status en README**: Copiar los badges de `cli-command-status.md` a la sección de Quickstart.

## Checklist

- [x] Extraer comandos README
- [x] Comparar con Commander registry
- [x] Detectar comandos documentados inexistentes
- [x] Detectar comandos reales no documentados
- [x] Generar diff final
- [x] No modificar lógica runtime
- [x] No modificar código fuente

## Guardrails

- No se modificó lógica runtime.
- No se modificaron comandos.
- No se modificaron runners.
- No se modificaron packages internos.
- La comparación se hizo contra el command registry real y auditorías previas.
