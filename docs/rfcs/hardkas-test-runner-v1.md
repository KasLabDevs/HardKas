# RFC: HardKas Test Runner v1

## 1. Problem Statement
El comando `hardkas test` actualmente es un **mock con salida hardcodeada**. Esto representa un riesgo crítico para el ecosistema ya que:
- Genera una **falsa sensación de confianza** en el desarrollador.
- Rompe la **postura de auditoría** del framework al no ejecutar pruebas reales.
- Bloquea la adopción real del framework para pipelines de CI/CD.
- No existe integración entre la lógica de las pruebas y el runtime de HardKas (Localnet, Artifacts).

**Mandato Crítico:** `hardkas test` nunca debe imprimir tests pasando a menos que se hayan ejecutado archivos de prueba reales.

## 2. Goals
- Ejecutar archivos de prueba reales (TypeScript).
- Integrar **Vitest** como motor interno de ejecución de pruebas.
- Inyectar el **Runtime de HardKas** (`hardkas`, `accounts`, `localnet`, `artifacts`) automáticamente en el contexto de las pruebas.
- Exponer un sistema de **Fixtures** para cargar estados predefinidos.
- Soportar **Snapshots** (textuales de Vitest y de artefactos de HardKas).
- Soportar **Hooks de Localnet** (start/reset/stop automático entre pruebas).
- Producir **Exit Codes** correctos (0 para éxito, 1 para fallos de test, 2 para errores de entorno).
- Mantener compatibilidad con el output **JSON** para integración con herramientas externas.
- Ser totalmente usable en entornos de **CI**.

## 3. Non-Goals
- Reemplazar Vitest por completo o crear un framework de assertions propio.
- Ejecutar tests en redes de producción (Mainnet) por defecto.
- Resolver la custodia de llaves reales dentro del entorno de test.
- Implementar técnicas de Fuzzing avanzado en esta versión v1.
- Implementar un dashboard web o interfaz gráfica de resultados.

## 4. Current State Audit

| Area | Current behavior | Risk |
| :--- | :--- | :--- |
| **Execution** | Hardcoded `console.log` | **CRITICAL**: Falsa confianza, el código del usuario no se prueba. |
| **Discovery** | Mock glob pattern `test/**/*.test.ts` | No busca archivos reales ni valida su existencia. |
| **Runtime** | `Hardkas.open(".")` inicializado pero no usado | Ineficiencia, el estado no se inyecta en ninguna parte. |
| **Output** | `✅ 2 passing` fijo | No refleja la realidad del proyecto. |
| **Cleanliness** | `localnet.start()` se llama pero no hay hooks de limpieza | El estado puede quedar sucio entre ejecuciones. |

## 5. Runner Choice

| Option | Pros | Cons | Recommendation |
| :--- | :--- | :--- | :--- |
| **Vitest** | Native TS, Fast, Snapshots, Programmatic API | Superficie de dependencias | **Recommended** |
| **Mocha** | Maduro, Simple | Setup de TS y Snapshots manual | Not preferred |
| **Custom** | Control total | Muy costoso y propenso a bugs | No |

**Recomendación:** Usar **Vitest** como motor interno. Su API programática permite envolverlo en el comando `hardkas test` manteniendo una UX coherente con el resto del CLI.

## 6. CLI Interface v1

| Flag | Purpose | Default |
| :--- | :--- | :--- |
| `[files...]` | Archivos o globs específicos a ejecutar | `test/**/*.test.ts` |
| `--network` | Red de destino (simnet, localnet) | `simnet` |
| `--watch` | Modo observador | `false` |
| `--json` | Output estructurado para máquinas | `false` |
| `--reporter` | Formato del reporte (default, dot, junit) | `default` |
| `--update-snapshots`| Actualizar snapshots de artefactos | `false` |

## 7. Test File Discovery
1. Si se pasan archivos como argumentos, usar esos.
2. Si no, buscar por defecto:
   - `test/**/*.test.ts`
   - `tests/**/*.test.ts`
   - `**/*.hardkas.test.ts`
3. Ignorar siempre: `node_modules`, `dist`, `.hardkas`, `.git`.
4. Soporte nativo para TypeScript vía Vitest.

## 8. Runtime Injection

Se propone el paquete `@hardkas/testing` para exponer el runtime.

```typescript
import { describe, it, expect } from "vitest";
import { hardkasTest } from "@hardkas/testing";

describe("Payment Workflow", () => {
  // Inyecta el runtime y configura hooks de localnet automáticos
  const h = hardkasTest({
    mode: "simulated"
  });

  it("should create and sign a payment plan", async () => {
    // h.tx, h.accounts, h.artifacts están disponibles
    const plan = await h.tx.plan({
      from: "alice",
      to: "bob",
      amountKas: "10"
    });

    expect(plan.schema).toBe("hardkas.txPlan");
    expect(plan.amountSompi).toBe("1000000000");
  });
});
```

## 9. Fixture System
El sistema de fixtures permitirá cargar estados del DAG y saldos de cuentas de forma determinista.

```typescript
it("should use a named fixture", async () => {
  await h.fixtures.load("standard-faucet");
  const balance = await h.accounts.balance("alice");
  expect(balance).toBeGreaterThan(0n);
});
```

API Propuesta:
- `h.fixtures.load(name)`: Carga un set de datos.
- `h.fixtures.reset()`: Limpia el estado de la localnet.
- `h.fixtures.snapshot(name)` / `h.fixtures.restore(name)`: Puntos de guardado rápidos en memoria.

## 10. Snapshot Support
Diferenciamos tres tipos de snapshots:
1. **Vitest Textual Snapshots**: `expect(data).toMatchSnapshot()`.
2. **HardKas Artifact Snapshots**: `expectArtifact(plan).toMatchArtifactSnapshot()`.
3. **Localnet State Snapshots**: `await h.localnet.saveSnapshot("checkpoint-1")`.

**Regla de Seguridad:** Las snapshots de artefactos deben normalizar metadatos temporales (timestamps) y **NUNCA** guardar secretos (private keys).

## 11. Localnet Hooks
El runner gestionará automáticamente el ciclo de vida:
- `beforeAll`: Iniciar Localnet si no está activa.
- `beforeEach`: Resetear estado a la fixture base o estado vacío.
- `afterAll`: Limpiar procesos (Docker node) si fueron levantados por el test.
- `timeout`: Gestión de timeouts de RPC (default 10s).

## 12. Security / Safety
- **Mainnet Block**: El comando `hardkas test` debe fallar si la red detectada es `mainnet` a menos que se use un flag de escape explícito (no recomendado).
- **Secret Redaction**: Si un test imprime accidentalmente un objeto que contiene una llave privada, el logger debe aplicar una máscara.
- **Isolation**: Los artefactos generados durante los tests se guardan en `.hardkas/test/artifacts` para no ensuciar el workspace productivo.

## 13. Artifact Integration
- Los tests generan linaje de artefactos real.
- El `QueryEngine` del runtime de test debe estar aislado.
- Posibilidad de verificar la validez de un artefacto contra su esquema Zod automáticamente.

## 14. JSON Output / CI
El reporter JSON debe ser compatible con herramientas de reporte de CI:
```json
{
  "ok": true,
  "stats": { "suites": 1, "tests": 5, "passed": 5, "failed": 0 },
  "durationMs": 1250
}
```

## 15. Implementation Plan

### Phase 1 — Remove Mock
- Eliminar los `console.log` hardcodeados en `packages/cli/src/commands/test.ts`.
- Implementar descubrimiento dinámico de archivos.
- Si no hay archivos, salir con advertencia (0) o error (1) según configuración.
- Cablear la API programática de Vitest.

### Phase 2 — Testing Package
- Crear `@hardkas/testing`.
- Definir el `hardkasTest` helper.
- Implementar la inyección de contexto de Vitest.

### Phase 3 — Localnet Fixtures
- Integrar `localnet.reset()` y `localnet.restore()` en los hooks de Vitest.
- Implementar sistema de carga de fixtures JSON.

### Phase 4 — Hardening
- Implementar reporter JSON estructurado.
- Documentación completa y ejemplos reales.

## 16. Files To Change

| File | Change |
| :--- | :--- |
| `packages/cli/src/commands/test.ts` | Reemplazar mock por llamada al runner real. |
| `packages/cli/src/runners/test-runner.ts` | [NEW] Implementar wrapper de Vitest. |
| `packages/testing/*` | [NEW] Paquete de utilidades para el usuario final. |
| `examples/basic/test/payment.test.ts` | [NEW] Ejemplo de test real funcional. |

## 17. Acceptance Criteria
1. `hardkas test` falla si no hay archivos o si los tests fallan.
2. Se inyecta una instancia funcional del SDK en el test.
3. El estado de la localnet se resetea entre tests.
4. Las snapshots de artefactos no incluyen claves privadas.
5. El exit code es `0` solo si todos los tests reales pasaron.

## 18. Tests Recommended
- `no-files-found`: Verificar comportamiento sin archivos `.test.ts`.
- `passing-test`: Ejecución exitosa de un test real.
- `failing-test`: El CLI devuelve exit code 1 cuando un test falla.
- `network-injection`: Verificar que el flag `--network` cambia el runtime del test.
- `mainnet-rejection`: Bloqueo de seguridad al intentar testear contra mainnet.

## 19. Risks

| Risk | Mitigation |
| :--- | :--- |
| **API de Vitest inestable** | Fijar versión exacta en `package.json`. |
| **Lentitud de arranque** | Usar carga perezosa (*lazy import*) del motor de Vitest. |
| **Estado de Localnet sucio** | `resetEachTest: true` por defecto en el runtime de testing. |
| **Fuga de secretos** | Aplicar máscaras de redacción en los reporters de test. |

## 20. Final Recommendation
Este cambio es de prioridad **CRÍTICA (P0)**. Mantener un mock en el comando de test socava la integridad del framework. El primer objetivo debe ser la **honestidad**: preferimos que `hardkas test` diga "0 archivos encontrados" a que mienta con "2 passing".

## 21. Checklist
- [x] Ejecutar archivos reales.
- [x] Integrar Vitest.
- [x] Runtime injection.
- [x] Fixture system.
- [x] Snapshot support.
- [x] Localnet hooks.
- [x] No modificar lógica productiva fuera del testing.
