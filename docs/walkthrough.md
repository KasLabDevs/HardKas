# HardKAS Escrow Module - Canonical Record

Este documento representa el registro final del diseño y estabilización del módulo Escrow P2SH dentro del framework HardKAS (versión 0.12.0-rc.1). A partir de este Gate, el módulo se considera congelado funcionalmente, marcando la separación oficial entre el motor de escrow y los laboratorios que lo consumen.

---

## 1. Historical Evolution

### Prototipo Inicial
El origen del escrow comenzó como una prueba de concepto. Dicho enfoque acoplaba fuertemente la lógica de dominio de Kaspa (compilación de SilverScript, firmas Schnorr, hashes P2SH) con un caso de uso de aplicación que excedía la responsabilidad del SDK. 

### El Salto a Builder Labs
El equipo determinó que HardKAS no es una aplicación, sino un framework L1 local-first. La experimentación se migró a `examples/builder-labs/bl-002-escrow-multisig`.

### Refinamiento Hacia el Motor Definitivo
Las primeras iteraciones del backend automatizaban agresivamente los flujos, escondiendo detalles de red y asumiendo un éxito condicionado a la desaparición del UTXO de fondeo. 

Tras una auditoría exhaustiva, la arquitectura evolucionó para recuperar rigor de capa base:
- Se implementó una **Resolution Policy** que unifica ramas distintas en un motor determinista.
- El servidor ya no mina bloques; la API de `simnet` es explícita y aislada bajo protección loopback estricta.
- Se implementaron verificaciones exactas de outputs on-chain para prevenir maleabilidad.
- Se aislaron las máquinas de estado de dominio y red.

---

## 2. Current Canonical Architecture

El ciclo de vida del escrow se gestiona a través de un esquema inmutable. 

### Matriz de Resolución

| Rama (`branch`) | Firmas Requeridas | Recipiente Final | Monto Liberado |
| --- | --- | --- | --- |
| `mutualRelease` | Buyer, Seller | Buyer | `refundAmount` |
| `refundBuyer` | Buyer, Arbiter | Buyer | `refundAmount` |
| `releaseToSeller` | Seller, Arbiter | Seller | `releaseAmount` |

### Flujo de Estados

1. **CREATED**: Contrato `escrow.sil` es compilado por `silverc`.
2. **FUNDED**: Ocurre tras el fondeo del P2SH. 
3. **PARTIALLY_SIGNED**: Ocurre tras `/release/prepare`. El backend congela la transacción, su `policyHash` y `expectedOutputsHash`. Los firmantes proveen firmas sobre este payload exacto.
4. **READY_TO_RELEASE**: Todas las firmas requeridas han sido verificadas y almacenadas.
5. **RELEASED**: `/release` compila el `unlocking_script`, anexa las firmas y la emite al nodo. La API verifica si la transacción emisora coincide exactamente (inputs y outputs) con el plan y si se confirma exitosamente (`getTransactionByHash`).

---

## 3. Verified Evidence

El módulo Escrow cuenta con certificación E2E automatizada contra Simnet mediante el runner estricto `verify-escrow`. 

### Garantías Demostradas
- **Resolution Matrix**: Flujo positivo para los tres caminos de desembolso confirmando balances exactos y destinatarios.
- **Negative Matrix**: Fallo criptográfico ante firmas cruzadas, inyección de roles incorrectos y manipulación de payloads de políticas en tiempo de ejecución.
- **Simnet E2E**: Ejecución desacoplada donde el servidor responde `verification_timeout` en caso de no avance del DAG, permitiendo reconciliaciones.
- **Session Recovery**: Resiliencia básica para restaurar el estado transitorio del Escrow a través del ID inyectado.
- **Idempotency**: Protección ante dobles firmas o llamados superpuestos de `reconcile`.

### Resultado de la Certificación
```text
Preconditions              PASS
Resolution matrix          PASS
Negative matrix            PASS
Simnet E2E                 PASS
Session recovery           PASS
Idempotency                PASS
Evidence validation        PASS
API contract generation    PASS
Exit code                  0
```

La ejecución exitosa produce los artefactos de certificación `escrow-evidence.json` y `escrow-api-contract.json`. Este estado ha sido etiquetado en el repositorio como `escrow-p2sh-v1.0.0`.
