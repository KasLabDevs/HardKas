# What Actually Works in HardKas

## 1. Philosophy
HardKas se encuentra actualmente en etapa **v0.2-alpha (Developer Preview)**. El objetivo primordial de este documento es la **honestidad técnica**: evitar la "falsa completitud" y proporcionar a los desarrolladores y contribuidores una visión clara de qué pueden esperar del framework hoy.

En HardKas, seguimos estas premisas:
- "Implemented" != "Production-ready".
- "CLI command exists" != "Feature works end-to-end".
- La honestidad arquitectónica es preferible al marketing.

```text
This document intentionally separates:
- STABLE: Real, end-to-end functionality.
- PARTIAL: Works but has significant gaps or limitations.
- EXPERIMENTAL: Functional but based on simplified or research models.
- PLACEHOLDER: UX shape only; no real logic yet.
- BROKEN / UNWIRED: Subsystem exists but is disconnected from the runtime.
```

## 2. Classification Model

| Status | Meaning |
| :--- | :--- |
| **STABLE** | Funciona de forma reproducible, es determinista y está integrado en el flujo principal. |
| **PARTIAL** | La lógica core es funcional, pero faltan integraciones críticas (config, persistencia) o tiene limitaciones de DX. |
| **EXPERIMENTAL** | Herramientas de investigación o simulación ligera que no pretenden validar consenso real (GHOSTDAG) sino ayudar al debug. |
| **PLACEHOLDER** | "UX Theater": Imprime salida estática o existe solo para definir la forma futura de la interfaz. |
| **BROKEN / UNWIRED** | Código de alta calidad que existe en el repositorio pero NO es invocado por el motor principal (código muerto/desconectado). |

## 3. What Actually Works (Stable)

| Area | Status | Notes |
| :--- | :--- | :--- |
| **TX Plan (L1)** | STABLE | Genera planes de transacciones UTXO deterministas. Valida saldos y estructura correctamente el JSON. |
| **TX Sign (L1)** | STABLE | Firma planes usando `kaspa` WASM SDK. Soporta cuentas reales y simuladas. |
| **TX Send (Simnet)** | STABLE | Envía transacciones firmadas a nodos locales. Funciona end-to-end en entornos de desarrollo. |
| **Artifact Serialization** | STABLE | El motor de artefactos serializa correctamente planes, firmas y recibos en `.hardkas/`. |
| **Canonical Hashing** | STABLE | Implementa hashing de contenido para verificar la integridad de los artefactos (Lineage). |
| **Docker Node Runner** | STABLE | Levanta y detiene contenedores `kaspad` de forma fiable e idempotente. |
| **Localnet Orchestration** | STABLE | Orquesta el ciclo de vida del entorno local (`hardkas up`, `hardkas node start`). |
| **Mainnet Guards** | STABLE | Protecciones duras que bloquean firmas y broadcasts accidentales a la red principal. |
| **Query Store (SQLite)** | STABLE | El `QueryEngine` usa SQLite por defecto, reduciendo escaneos filesystem O(n). |
| **Artifact Determinism** | STABLE | Hashes reproducibles para equivalencia semántica (Whitelist), ignorando metadatos variables. |
| **Secret Redaction** | STABLE | Redacción recursiva automática de secretos en logs y errores del CLI. |
| **Gitignore Hardening** | STABLE | `hardkas init` añade automáticamente `.hardkas/` al `.gitignore`. |

## 4. Partial Systems

| Area | Why Partial | Missing |
| :--- | :--- | :--- |
| **Keystore Integration** | El keystore es robusto pero su uso es opcional y manual. | Integración automática en el flujo de `tx sign` sin requerir flags extra. |
| **L2 Deploy-plan** | Empaqueta bytecode y args. | No predice la dirección del contrato (CREATE/CREATE2 address prediction). |
| **Config Integration** | El CLI no consume todas las opciones de `hardkas.config.ts`. | Consistencia total entre flags y archivo de configuración. |
| **Snapshot Normalization** | Los snapshots de localnet funcionan pero son pesados. | Normalización de datos para que los snapshots de estado sean comparables entre máquinas. |

## 5. Experimental / Research Systems

| Area | Why Experimental | Reality |
| :--- | :--- | :--- |
| **DAG Tooling** | Simulación ligera de grafos. | **No es GHOSTDAG**. Es una herramienta educativa para visualizar conflictos y reorgs, no valida consenso real. |
| **Conflict Analysis** | Basado en modelos simplificados. | Útil para detectar doble gasto evidente, pero no emula la lógica de "Blue Score" real de Kaspa. |
| **L2 Bridge Assumptions** | Basado en el modelo de fases Igra. | Documenta asunciones de seguridad (pre-zk, mpc, zk) pero no valida las pruebas criptográficas del puente. |

## 6. Placeholder / Mock Systems

| Area | Current State | Risk |
| :--- | :--- | :--- |
| **CLI Hints** | `Next: hardkas l2 tx send` (cuando no estaba implementado). | **BAJO**: Confusión de usuario. Muchos hints sugieren comandos que apenas están en desarrollo. |
| **Session Lock/Unlock** | El comando existe pero no limpia memoria real. | **MEDIO**: "Security Theater". Da una falsa sensación de que la llave ha sido "borrada" de la sesión. |
| **Profile Loading** | Los perfiles L2 están hardcodeados en el binario. | **MEDIO**: Impide que el usuario defina sus propias redes Igra en el config. |

## 7. Broken / Unwired Systems

Estos son los "Wiring Gaps" más críticos del proyecto. El código está escrito y testeado, pero el CLI/SDK no lo llama.

| Area | Problem | Impact |
| :--- | :--- | :--- |
| **L2 User Networks** | `registry.ts` ignora las redes L2 del config. | **MEDIO**: El usuario solo puede usar el perfil "igra" built-in. |
| **Standard Lineage** | No todos los artefactos verifican su `sourceId`. | **BAJO**: Rompe la cadena de procedencia formal en algunos flujos de L2. |

## 8. Security Reality
HardKas **prioriza la seguridad del desarrollador contra errores accidentales**, NO la custodia de activos de grado institucional.

- **NO es una wallet custodial.**
- **NO usa HSM ni enclaves de memoria segura.**
- **Cuentas en texto plano** (`accounts.real.json`): Existen para desarrollo rápido (Hardhat style).
- **.gitignore automatizado**: `hardkas init` protege la carpeta `.hardkas/` por defecto.
- **Mainnet está protegido** por guardas de red y banderas explícitas.

## 9. Testing Reality
Tras la reciente eliminación del mock:
- **Testing es REAL**: Ejecuta archivos `.test.ts` reales usando **Vitest**.
- **Runtime inyectado**: El SDK está disponible dentro de los tests.
- **Estado determinista**: Se intenta resetear Localnet entre tests, pero el costo de performance es alto.
- **Limitación**: Todavía es inmaduro y falta documentación detallada de los helpers de aserción.

## 10. L2 / Igra Reality
- **Separación total**: El Tooling entiende que L1 != L2.
- **Igra Tx Pipeline**: Build, Sign y Send funcionan (vía RPC).
- **Bridge Honesty**: No afirma que el puente sea trustless hoy (advierte fase `pre-zk`).
- **Gaps**: Falta conectar el sistema de perfiles a la configuración del usuario.

## 11. Performance Reality
- **Indexación eficiente**: Gracias a SQLite, el rendimiento mejora significativamente al evitar escaneos O(n); el rendimiento final depende de la query e índices.
- **JSON Overhead**: Gran parte de la comunicación interna es JSON pesado; aceptable para desarrollo pero ineficiente para indexación masiva.

## 12. What Is Production-Ready?

| Ready For | Status |
| :--- | :--- |
| **Local Developer Workflows** | YES |
| **CI/CD Experimentation** | YES (con equivalencia semántica) |
| **Educational Tooling** | YES (Excellent architecture) |
| **Production Custody** | **NO** |
| **Mainnet Automation** | **NO** |
| **Large-scale Indexing** | **NO** |

## 13. What Needs Immediate Hardening (P0)
1. **Estabilización de Invariantes**: Validar formalmente los contratos de replay en escenarios complejos.
2. **Normalización de Snapshots**: Lograr que los estados de red sean comparables bit-a-bit.

## 14. What Is Surprisingly Good
- **Arquitectura de Artefactos**: El modelo de datos es escalable y muy limpio.
- **Serialización Canónica**: Garantiza que el mismo objeto produzca el mismo JSON.
- **Honestidad del Bridge**: No sobre-vende la seguridad de la L2.
- **Postura ante Mainnet**: Muy conservadora y segura para el desarrollador.

## 15. Final Assessment

HardKas es actualmente:
**Un laboratorio de flujos de trabajo transaccionales deterministas para desarrolladores Kaspa, NO una plataforma de blockchain para producción.**

La mayor virtud del proyecto hoy no es su completitud, sino su **honestidad arquitectónica**. Las piezas están en su lugar; ahora solo falta conectarlas.
