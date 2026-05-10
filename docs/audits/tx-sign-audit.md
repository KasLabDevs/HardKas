# HardKas Transaction Pipeline Audit (`tx sign`)

## 1. Scope
Esta auditoría analiza el proceso de firma de transacciones en HardKas, centrado en:
- comando `hardkas tx sign <planPath>`
- runner `runTxSign`
- función de firma central `signTxPlanArtifact`
- signer abstraction (`HardkasTxPlanSigner`)
- keystore integration (o la falta de ella en este flujo)
- mainnet guards
- artifact lineage y trazabilidad
- determinismo y reproducibilidad del artifact firmado (`signedTx`)

## 2. Executive Summary
El comando `tx sign` consume un artefacto `txPlan` y produce un artefacto `signedTx`. La arquitectura está bien diseñada como un pipeline de transformación, separando conceptualmente la identidad (signer) de la lógica de red. Soporta backends de firma simulada y llaves privadas vía WASM (KASPA).
Sin embargo, el proceso operativo bypasséa el keystore cifrado (solo funciona con cuentas de texto plano o variables de entorno), y los artefactos firmados no son reproducibles bit-a-bit debido a la inclusión de timestamps y la falta de validación del hash original del plan. 

Clasificación del sistema actual:
- Signer abstraction: GOOD
- Keystore integration: PARTIAL (Desconectado del flujo)
- Mainnet protections: GOOD
- Artifact lineage: PARTIAL
- Deterministic reproducibility: NEEDS HARDENING

Importante: Se enfoca el análisis como developer tooling, asumiendo que la conveniencia para entornos locales es prioritaria, pero el determinismo es obligatorio, NO como wallet production-grade.

## 3. Command Interface

| Item | Value |
| :--- | :--- |
| Command | `hardkas tx sign <planPath>` |
| Positional args | `<planPath>` |
| Flags | `--account`, `--out`, `--allow-mainnet-signing`, `--json` |
| Runner | `runTxSign` |
| Input artifact | `txPlan` |
| Output artifact | `signedTx` |

**Comportamientos observados:**
- **Falta `--account`**: Intenta inferir el signer usando `txPlan.from.accountName` o la dirección.
- **Falta `--out`**: No escribe a disco, solo imprime el resultado formateado o JSON a stdout.
- **Falta private key**: Falla a nivel de resolución de cuenta o en la capa del WASM signer.
- **Se usa mainnet sin flag**: El comando bloquea explícitamente la ejecución a menos que se use `--allow-mainnet-signing`.

## 4. Signing Flow

```text
hardkas tx sign tx-plan.json
  → load txPlan artifact
  → validate schema
  → resolve account
  → resolve signer backend
  → mainnet guard
  → sign transaction
  → create signedTx artifact
  → optional write
  → text/json output
```

## 5. Input Artifact Validation

| Validation | Present | Location | Risk |
| :--- | :--- | :--- | :--- |
| Schema validation | YES | `signTxPlanArtifact` | LOW |
| Status validation | YES | `signTxPlanArtifact` | LOW |
| Network validation | YES | `signTxPlanArtifact` | LOW |
| contentHash verification | **NO** | Missing | **HIGH** |
| artifactId verification | **NO** | Missing | **HIGH** |
| Tamper detection | **NO** | Missing | **HIGH** |

**Punto clave**: `tx sign` NO verifica el `contentHash` del `txPlan`. Si un usuario o proceso altera el JSON del plan antes de firmarlo, el comando lo firmará sin alertar sobre la manipulación, lo que compromete la integridad del determinismo.

## 6. Signer Abstraction

| Signer backend | Supported by tx sign | Source | Secret handling | Status |
| :--- | :--- | :--- | :--- | :--- |
| Simulated signer | YES | Memory | N/A | SUPPORTED |
| ENV private key | YES | Environment | Raw string | SUPPORTED |
| Plaintext local store | YES | `.hardkas/accounts.real.json` | Raw string | LEGACY |
| Encrypted keystore | **NO** | `.hardkas/keystore/*.json` | Needs decryption | NOT_SUPPORTED |
| External wallet | NO | N/A | N/A | FUTURE |
| Hardware wallet | NO | N/A | N/A | FUTURE |

## 7. Keystore Integration
El comando `tx sign` **NO** puede usar el keystore cifrado V2 (`.hardkas/keystore/*.json`) actualmente. No existe mecanismo de prompt interactivo para la contraseña durante el flujo de firma, ni utiliza la sesión generada por `accounts real unlock` (que es puramente de verificación). El sistema depende de texto plano o ENV.

| Keystore feature | Present in tx sign | Evidence | Risk |
| :--- | :--- | :--- | :--- |
| File parsing | NO | Fallback to plaintext store | MEDIUM |
| Password prompt | NO | CLI flags missing | HIGH |
| Session unlock | NO | No state preserved | MEDIUM |

*Enfoque:* Tratar esta desconexión como “identity backend inconsistency” para una herramienta de desarrolladores, más que un “custody failure” catastrófico de wallet de producción.

## 8. Plaintext / ENV Key Handling

| Source | Secret format | Redacted | Risk | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| `process.env` | String | NO (in memory) | MEDIUM | Standard for CI, warn local dev |
| `.hardkas/accounts.real.json` | JSON plain | NO | HIGH | Deprecate in favor of Keystore |
| logs / stdout | N/A | YES | LOW | Ensure no leaks in error traces |
| JSON output | N/A | YES | LOW | Secret is excluded |
| signed artifact fields | N/A | YES | LOW | Private key explicitly omitted |

## 9. Mainnet Protections

| Protection | Present | Location | Risk | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| `--allow-mainnet-signing` | YES | CLI & Runner | LOW | Maintain as developer guard |
| default block | YES | `signTxPlanArtifact` | LOW | None |
| network detection | YES | `signTxPlanArtifact` | LOW | None |
| interactive prompt | NO | N/A | MEDIUM | Optional for developer tooling |
| shortcut flow via `tx send` | YES | `tx.ts` | LOW | Require `--yes` |
| config network mismatch | YES | CLI Runner | LOW | Validate against defaultNetwork |

Para developer tooling, requerir `--allow-mainnet-signing` es una protección razonable y suficiente por defecto.

## 10. Signing Correctness

| Correctness check | Present | Risk if missing |
| :--- | :--- | :--- |
| firma todos los inputs | YES (WASM SDK) | Transacción rechazada por la red |
| cuenta corresponde a `from` | YES | Firma incorrecta / Robo |
| network prefix | YES | Tx inválida en destino |
| change address | YES (in plan) | Pérdida de fondos |
| signed tx matches plan | YES | Envío a destino erróneo |
| mass/fee mismatch post-sign | NO | Falla en broadcast (slippage) |
| no mutation of original plan | YES | Inconsistencia de artefactos |

## 11. Artifact Output

| Field | Present | Sensitive | Deterministic | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `schema` | YES | NO | YES | `hardkas.signedTx` |
| `signedId` | YES | NO | **NO** | Usa `Date.now()` temporal |
| `sourcePlanId` | YES | NO | YES | Referencia al plan |
| `artifactId` | NO | NO | - | Ausente en el output |
| `contentHash` | YES | NO | **NO** | Afectado por `createdAt`/`signedId` |
| `parentArtifactId` | NO | NO | - | Usa `sourcePlanId` en su lugar |
| `lineage` | NO | NO | - | Bloque formal no implementado |
| `txId` | YES | NO | YES | Hash de la transacción |
| `signedTransaction` | YES | NO | YES | Payload hexadecimal de firma |
| `createdAt` | YES | NO | **NO** | `new Date().toISOString()` |
| `signer metadata` | NO | NO | - | Podría añadir valor (ej. `backend`) |
| `privateKey` | NO | YES | - | Excluido correctamente |
| `password` | NO | YES | - | Excluido correctamente |

## 12. Artifact Lineage

| Lineage feature | Present | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| `sourcePlanId` | YES | LOW | Mantiene trazabilidad básica |
| `parentArtifactId` | NO | MEDIUM | Unificar con V2 standard |
| `lineage` block | NO | HIGH | Incluir grafo de transformación formal |
| transformation metadata | NO | MEDIUM | Registrar signer backend/version |
| deterministic parent link | YES | LOW | `sourcePlanId` es hash |
| reconstruct chain | PARTIAL | MEDIUM | Faltan metadatos formales |

La cadena `txPlan → signedTx → txReceipt` es rastreable mediante IDs ad-hoc (`sourcePlanId`), pero carece del estándar de trazabilidad que facilitaría visualizaciones o auditorías formales automáticas.

## 13. Determinism Review

Análisis: **same txPlan + same signer + same inputs = same signed artifact?** -> **NO**.

- **Payload determinism**: Sí. Las firmas Schnorr y la serialización del payload en el SDK son deterministas.
- **Metadata determinism**: No. El uso de `Date.now().toString(36)` y `new Date().toISOString()` hace que cada invocación genere campos diferentes.
- **Artifact identity determinism**: No. Dado que `contentHash` se calcula incluyendo todos los campos del artefacto (incluyendo `createdAt` y `signedId`), el hash resultante de identidad nunca será el mismo en dos ejecuciones. Esto rompe esquemas de caching en CI.

## 14. Error Handling

| Error case | Current behavior | User clarity | Recommendation |
| :--- | :--- | :--- | :--- |
| invalid plan | Throws (schema validation) | Good | None |
| tampered plan | **Passes silently** | Poor | Verify `contentHash` |
| missing account | Fails in resolution | Good | Suggest `accounts real generate` |
| missing private key | Fails internally | Fair | Clarify backend issue |
| unsupported keystore | Fails/Bypassed | Poor | Implement prompt integration |
| mainnet blocked | Explict Error | Good | Suggest flag |
| signing failure | Throws WASM error | Fair | Catch and format SDK errors |
| output write failure | Throws FS error | Good | None |

## 15. Findings

### GOOD
- Pipeline desacoplado: plan → sign → send.
- Signer abstraction permite extensiones futuras.
- Mainnet guardrails previenen errores catastróficos por defecto.
- No hay filtración de llaves privadas (`privateKey`) ni contraseñas en el artefacto de salida JSON.

### NEEDS HARDENING
- `contentHash` del input no se verifica antes de firmar (posibilidad de tampering silencioso).
- Timestamp metadata (`createdAt`, `signedId` basado en `Date.now()`) rompe totalmente la reproducibilidad del artefacto.
- Lineage no formalizado en un bloque estándar (solo uso ad-hoc de `sourcePlanId`).
- Keystore V2 no está integrado en el flujo de firma, obligando a los desarrolladores a depender de texto plano o variables de entorno.
- El almacén de cuentas local en plaintext representa un riesgo de seguridad heredado.

## 16. Recommendations

### P0 — Deterministic Artifact Hardening
- **Verificar `contentHash`**: Recalcular y validar el hash del `txPlan` antes de proceder a la firma.
- **Separar Metadata**: Excluir campos puramente temporales (como `createdAt`) del cálculo de la identidad o reemplazar `signedId` por un hash canónico basado solo en inputs deterministas (ej. txPlan hash + signer pubkey).
- **Linaje Formal**: Usar un bloque `lineage` estricto que apunte invariablemente a los artefactos padre.
- **Stable Identity**: Asegurar que `same txPlan + same signer = exact same artifact hash`.

### P1 — DX Consistency
- **Ephemeral Keystore Prompt**: Añadir lógica para detectar si el account resuelto reside en el keystore V2 cifrado, y de ser así, solicitar interactivamente la contraseña.
- **Unified Signer Abstraction**: Integrar plenamente el backend Keystore como una opción válida dentro de `HardkasTxPlanSigner`.
- **Logs redactados**: Garantizar que bajo ninguna circunstancia se impriman claves por stdout en modo verbose.

### P2 — Optional Guards
- **Mainnet Interactive**: Proveer advertencia interactiva para mainnet si la terminal es TTY, incluso sin el flag (opcional de DX).
- **Mejores mensajes de error**: Clarificar exactamente qué backend de firma se está intentando usar si la cuenta no es soportada.

## 17. Proposed `tx sign` v1 Flow

El flujo ideal para la versión estable (v1) debería ser:

1. **Load txPlan**: Cargar archivo JSON.
2. **Validate schema**: Comprobar estructura `hardkas.txPlan`.
3. **Verify contentHash**: Comprobar que el archivo no fue alterado post-planificación.
4. **Resolve signer backend**: Determinar si se usa ENV, simnet o Keystore.
5. **If keystore**: Pedir (prompt) la contraseña temporalmente.
6. **Check account**: Validar que la llave corresponde a `from` address.
7. **Mainnet guard**: Bloquear o advertir.
8. **Sign deterministic payload**: Llamada al WASM SDK.
9. **Zeroize secrets**: Limpiar Buffers en memoria (best effort).
10. **Create signedTx artifact**: Construir con linaje formal y hash determinista puro (sin Date.now).
11. **Write atomically**: Guardar el resultado.
12. **Print redacted summary**: Confirmar al usuario.

*Nota:* No es necesaria una sesión persistente, el sistema debe ser seguro localmente por defecto sin emular infraestructura de wallet de producción.

## 18. Tests Recommended
- Sign valid `txPlan`.
- Reject malformed `txPlan`.
- Reject tampered `txPlan` hash.
- Reject mainnet unless allow flag.
- Sign with env key.
- Sign with plaintext legacy key (si sigue soportado temporalmente).
- Sign with keystore prompt (cuando se implemente).
- Wrong keystore password fails.
- `signedTx` contains no private key.
- Source/parent lineage points to `txPlan`.
- Same plan + same signer gives stable payload (Determinismo puro).
- Metadata excluded from identity hash.
- Output write failure does not corrupt previous artifact.

## 19. Documentation Updates Required
- Referencia del comando `tx sign`.
- Estado de los signer backends.
- Estado de soporte del Keystore V2 y sus limitaciones actuales.
- Warning sobre el uso de plaintext (`accounts.real.json`).
- Warning sobre protección Mainnet.
- Documentación sobre Artifact lineage.
- Documentación sobre Deterministic artifact reproducibility.

## 20. Checklist
- [x] Revisar signer abstraction
- [x] Revisar keystore integration
- [x] Revisar mainnet protections
- [x] Revisar artifact lineage
- [x] Revisar determinismo
- [x] No modificar lógica runtime
- [x] No modificar crypto
- [x] No modificar runners
- [x] No modificar comandos

## Guardrails
- No se modificó lógica runtime.
- No se modificó criptografía.
- No se modificaron runners.
- No se modificaron comandos.
- Esta auditoría es documental.
