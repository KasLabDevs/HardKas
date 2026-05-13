# HardKas CLI Version Audit

## 1. Scope
Esta auditoría analiza las discrepancias de versionado entre el manifiesto del paquete (`package.json`), el punto de entrada del CLI (`index.ts`) y los metadatos de artefactos (`@hardkas/artifacts`).

## 2. Comparison Table

| Fuente | Valor detectado | Archivo | Estado |
| :--- | :--- | :--- | :--- |
| **CLI Manifest** | `0.2.2-alpha` | `packages/cli/package.json` | `MATCH` |
| **CLI Runtime** | `0.2.2-alpha` | `packages/cli/src/index.ts` | `MATCH` |
| **Artifact Metadata**| `0.2.2-alpha` | `packages/artifacts/src/constants.ts` | `MATCH` |
| **CLI Output** | `0.2.2-alpha` | `hardkas --version` | `MATCH` |

## 3. Hardcoded Version References

| Archivo | Referencia | Tipo | Acción |
| :--- | :--- | :--- | :--- |
| `packages/cli/src/index.ts` | `const { version: HARDKAS_VERSION } = ...` | runtime dynamic | **FIXED** |
| `packages/artifacts/src/constants.ts` | `export const HARDKAS_VERSION = "0.2.2-alpha";` | package hardcode | Validated by sync script |
| `packages/cli/package.json` | `"version": "0.2.2-alpha"` | manifest | **Fuente de Verdad** |
| `packages/artifacts/package.json` | `"version": "0.2.2-alpha"` | manifest | Validated by sync script |

## 4. Problem Statement
Existen al menos dos constantes de cadena duplicadas para la versión en el código fuente. Si un desarrollador actualiza `package.json` pero olvida actualizar las constantes, los artefactos generados y el output del CLI reportarán versiones incorrectas.

## 5. Proposed Solution
1. **CLI**: Leer `version` dinámicamente desde `packages/cli/package.json` en `index.ts`.
2. **Artifacts**: Mantener la constante por ahora para evitar breaking changes en la firma de los artefactos, pero añadir una validación que asegure que coincide con el paquete.
3. **Sync Script**: Crear `scripts/check-cli-version.mjs` para validar la coherencia en el CI.

## 6. Checklist
- [x] Comparar package.json vs CLI output
- [x] Detectar hardcodes
- [x] Centralizar versión en CLI
- [x] Añadir sync automático
- [x] Añadir script check:cli-version
- [x] No modificar lógica de comandos
- [x] No modificar runners
- [x] No modificar packages internos no relacionados

## Guardrails
No se modificó lógica de comandos.
No se modificaron runners.
No se cambiaron versiones publicadas.
No se publicó ningún paquete.
El cambio se limita a versionado CLI, validación y documentación.
