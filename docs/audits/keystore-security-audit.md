# HardKas Keystore Security Audit

## 1. Scope
Esta auditoría analiza exhaustivamente el sistema de gestión de cuentas reales y almacenamiento persistente de HardKas, cubriendo:
- Almacenamiento local en el sistema de archivos (`.hardkas/`).
- Esquema de cifrado y derivación de claves (KDF).
- Flujos de generación, importación y cambio de contraseña.
- Modelo de sesión (Unlock/Lock).
- Gestión de secretos en memoria y prevención de fugas.
- Integración con el proceso de firma de transacciones L1 y L2.

## 2. Executive Summary
HardKas implementa actualmente dos sistemas paralelos para cuentas reales: un almacén en texto plano (`accounts.real.json`) para desarrollo rápido y un sistema de keystore cifrado basado en archivos JSON individuales. El sistema cifrado utiliza estándares modernos (**Argon2id** y **AES-256-GCM**), lo cual es positivo. Sin embargo, existe una **brecha arquitectónica crítica**: el motor de firma de transacciones solo soporta cuentas basadas en variables de entorno o texto plano, dejando el sistema cifrado como una funcionalidad de "solo verificación" sin utilidad práctica para el signing real.

**Conclusión Técnica**: HardKas posee capacidades reales de signing y networking, pero el flujo operativo principal **bypasséa** el sistema de seguridad. El camino de menor resistencia para el desarrollador (`accounts real generate`) es el más inseguro. El sistema es robusto como herramienta de tooling/RPC, pero se encuentra en estado **Alpha** en cuanto a infraestructura de wallet y manejo de secretos.

**Estado General: CRITICAL DX SECURITY FAILURE / HIGH RISK**

## 3. Commands Covered

| Command | Runner / Handler | Uses keystore | Risk | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `accounts real init` | `accounts-real-init-runner` | No | LOW | Inicializa el almacén (actualmente texto plano). |
| `accounts real generate`| `accounts-real-generate-runner`| No | **HIGH** | Genera llaves y las guarda en texto plano. |
| `accounts real import` | `accounts-keystore-runners` | Sí (opcional)| MEDIUM | Soporta importación cifrada (Keystore V2). |
| `accounts real unlock` | `accounts-keystore-runners` | Sí | LOW | Solo verifica la contraseña; no crea sesión. |
| `accounts real lock` | `accounts.ts` (inline) | No | LOW | Comando superficial; no limpia memoria/disco. |
| `accounts real change-password`| `accounts-keystore-runners`| Sí | MEDIUM | Recifra el payload atómicamente. |
| `tx sign` | `tx-sign-runner` | No | **HIGH** | Solo firma desde ENV o texto plano. |
| `l2 tx sign` | `l2-tx-runners` | No | **HIGH** | No integrado con el keystore cifrado. |
| `accounts list` | `accounts.ts` | Sí | LOW | Lee metadatos (address) sin desencriptar. |
| `faucet` | `accounts-fund-runner` | No | LOW | Usa direcciones públicas. |

## 4. Storage Local

| Item | Path / Location | Contains secrets | Encrypted | Risk | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Plaintext Store | `.hardkas/accounts.real.json` | **YES** | **NO** | **CRITICAL** | Almacena llaves privadas en JSON plano. |
| Encrypted Keystore| `.hardkas/keystore/*.json` | YES | YES | LOW | Formato Keystore V2 (AES-GCM). |
| Project Config | `hardkas.config.ts` | No | N/A | LOW | Solo referencia nombres de variables ENV. |
| Environment | `.env` | YES | NO | MEDIUM | Práctica estándar, pero riesgo de fuga. |

> [!CAUTION]
> HardKas no genera un archivo `.gitignore` por defecto. Esto significa que tanto el almacén en texto plano como el keystore cifrado son propensos a ser subidos a repositorios públicos accidentalmente.

## 5. Keystore File Format (V2)

| Field | Meaning | Sensitive | Encrypted | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `version` | Formato del contenedor | No | No | `2.0.0` |
| `type` | Identificador de tipo | No | No | `hardkas.encryptedKeystore.v2` |
| `kdf` | Parámetros de derivación | No | No | Algoritmo, salt, iteraciones, memoria. |
| `cipher` | Parámetros de cifrado | No | No | Algoritmo, nonce, auth tag. |
| `encryptedPayload` | Datos sensibles | **YES** | **YES** | Contiene `privateKey` y `address`. |
| `metadata` | Información pública | No | No | Label, network, address (duplicado para listado). |

## 6. Encryption Review

| Component | Implementation | Strength | Risk | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| KDF | Argon2id | **HIGH** | LOW | Parámetros por defecto (64MB) son adecuados para dev. |
| Cipher | AES-256-GCM | **HIGH** | LOW | Cifrado autenticado estándar en la industria. |
| Nonce/IV | `crypto.randomBytes(12)` | **HIGH** | LOW | Unicidad garantizada por ejecución. |
| Salt | `crypto.randomBytes(16)` | **HIGH** | LOW | Salt aleatorio por cada entrada. |
| Integrity | GCM Auth Tag | **HIGH** | LOW | Previene manipulación del archivo cifrado. |

## 7. Password Prompt Flow

| Flow | Prompt hidden | Confirmation | Empty allowed | Strength check | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `import` | Sí (Enquirer) | Sí | No | Mínimo 8 caracteres | LOW |
| `generate` | N/A | N/A | N/A | N/A | **HIGH** (Solo texto plano) |
| `unlock` | Sí | No | No | No | LOW |
| `change-password` | Sí | Sí | No | Mínimo 8 caracteres | LOW |
| `tx sign` | **NO** | No | N/A | N/A | **HIGH** (Falla si no está en ENV) |

## 8. Unlock Flow
El comando `accounts real unlock` actualmente funciona como un **verificador de integridad**:
1. Carga el archivo JSON.
2. Pide la contraseña.
3. Deriva la clave y desencripta el payload.
4. Si tiene éxito, informa al usuario.
**Persistencia**: Ninguna. La llave desencriptada se limpia de memoria inmediatamente. No se crea ningún archivo de sesión ni token temporal.

## 9. Lock Flow
Clasificación: **SUPERFICIAL / NO-OP**
El comando `lock` simplemente imprime un mensaje indicando que la sesión ha sido cerrada. Dado que no existe un modelo de sesión persistente ni un agente en memoria (daemon), el comando no realiza ninguna acción técnica real.

## 10. Session Model
| Aspect | Current behavior | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Persistence | None | LOW | No hay riesgo de robo de token de sesión (no existe). |
| User Experience| Mala | MEDIUM | Obliga a ingresar contraseña en cada firma (si se implementara). |
| Implementation | Stateless | LOW | Cada operación de descifrado es independiente. |

## 11. Memory Leak / Secret Lifetime Review
| Secret | Representation | Lifetime | Zeroized | Risk |
| :--- | :--- | :--- | :--- | :--- |
| Derived Key | `Buffer` | Corto (ms) | **YES** (`fill(0)`) | LOW |
| Private Key | `string` | Corto (ms) | **NO** | MEDIUM (Garbage Collection) |
| Password | `string` | Corto (ms) | **NO** | MEDIUM (Garbage Collection) |

> [!WARNING]
> Aunque se utiliza `Buffer.fill(0)` para la clave derivada, las llaves privadas y contraseñas circulan como strings de JavaScript, lo que dificulta su borrado total de la memoria RAM debido a cómo funciona el motor V8.

## 12. Import / Generate Review
- **Entropy**: Usa `crypto.randomBytes` y el generador interno de Kaspa SDK. Correcto.
- **Validation**: Valida el prefijo de la dirección (`kaspa:`, etc.).
- **Bypass de Seguridad**: El runner de generación **solo guarda en texto plano**. Esto incentiva al usuario a permanecer en el flujo inseguro, convirtiendo al Keystore V2 en una característica decorativa para la mayoría de los casos de uso iniciales.

## 13. Fragmentación Arquitectónica (Hallazgo Clave)
Se ha identificado una separación peligrosa entre dos mundos desconectados:

1.  **Flujo Operativo (Inseguro)**: `generate` -> `.hardkas/accounts.real.json` (Texto Plano) -> `tx sign`.
2.  **Flujo de Seguridad (Incompleto)**: `import --encrypted` -> `.hardkas/keystore/*.json` -> `unlock` (Solo verificación).

**El problema real es que el Flujo Operativo no tiene forma de consumir el Flujo de Seguridad.** Keystore V2 no es actualmente el "Source of Truth" criptográfico para las operaciones de red.

## 13. Change Password Review
- **Atomicidad**: No es atómico. Si el proceso falla durante `saveEncryptedKeystore`, el archivo original se sobrescribe.
- **Seguridad**: Correcto. Desencripta el payload antiguo y crea un nuevo contenedor V2 con nuevos salts y nonces.

## 14. Integration With Signing
| Sign flow | Reads keystore | Prompts password | Output artifact contains secret | Mainnet guard | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `tx sign` | No | No | No | Sí | **HIGH** |
| `l2 tx sign` | No | No | No | N/A | **HIGH** |

**Hallazgo Crítico**: Los procesos de firma **no consultan el Keystore cifrado**. Solo buscan llaves en variables de entorno (`process.env`) o en el almacén de texto plano. Esto obliga al usuario a elegir entre "Seguridad sin firma" (Keystore) o "Firma sin seguridad" (Texto plano/ENV).

## 15. Maturity Level Assessment

| Subsystem | Maturity | Status |
| :--- | :--- | :--- |
| CLI Infrastructure | Advanced | Modular, robust command registry. |
| Artifact System | Solid | Typed schemas, consistent versioning. |
| Query Engine | Advanced | Relational indexing, SQLite integration. |
| RPC Orchestration | Solid | Reliable node/RPC connectivity. |
| Wallet Security | **Alpha** | Architectural fragmentation present. |
| Secret Management | **Incomplete** | Plaintext bypasses encrypted system. |

## 16. Security Findings

### Critical
- **Architectural Bypass**: El sistema de seguridad existe, pero el flujo operativo principal (Signing) lo ignora.
- **Texto Plano por Defecto**: `accounts.real.json` almacena llaves privadas sin cifrar. Es el sistema usado por `generate` por defecto.

### High
- **Ausencia de .gitignore**: El comando `init` no protege la carpeta `.hardkas/`, aumentando el riesgo de fuga masiva de llaves.
- **Lock Superficial**: El comando `lock` genera una falsa sensación de seguridad al no tener un estado de sesión que cerrar.

### Medium
- **Falta de Atomicidad**: La escritura de archivos JSON puede corromperse si el proceso se interrumpe, perdiendo el acceso a la llave.
- **Fuga en Memoria**: Uso extensivo de strings para material sensible en lugar de Uint8Arrays/Buffers con zeroization estricta.

## 16. Recommendations

### Critical
- **Eliminar Texto Plano**: Migrar `accounts real generate` para que use el sistema de Keystore cifrado de forma obligatoria o por defecto.
- **Integrar Signing + Keystore**: Modificar `signTxPlanArtifact` para que pida la contraseña si detecta una cuenta de tipo Keystore.

### High
- **Generar .gitignore**: `hardkas init` DEBE crear un `.gitignore` que excluya `.hardkas/`.
- **Atomic Writes**: Usar archivos temporales + rename para guardar el keystore y evitar corrupciones.
- **Documentar Trust Boundary**: Aclarar que el Keystore es para desarrollo local y no para custodia de fondos de producción.

### Medium
- **Implementar Sesión (Opcional)**: Considerar un agente en memoria con TTL para evitar prompts repetitivos de contraseña.
- **Zeroization**: Migrar el manejo de llaves a `Uint8Array` para permitir limpieza manual de memoria.

## 17. Proposed Keystore v1 Hardening

```ts
type KeystoreEntryV1 = {
  version: "2.1.0";
  id: string;
  label: string;
  address: string;
  network: "simnet" | "testnet-10" | "mainnet";
  crypto: {
    kdf: "argon2id";
    kdfParams: {
      memoryCost: 65536;
      timeCost: 3;
      parallelism: 1;
      salt: string; // base64
    };
    cipher: "aes-256-gcm";
    cipherParams: {
      nonce: string; // base64
      authTag: string; // base64
    };
    ciphertext: string; // base64
  };
  createdAt: string;
  updatedAt: string;
};
```

## 18. Tests Recommended
- `generate` crea entrada cifrada por defecto.
- `sign` pide contraseña si la cuenta es del keystore.
- `.gitignore` se crea con los patrones correctos.
- Fallo de escritura atómica no corrompe el archivo original.
- El artifact firmado no contiene la llave privada en ningún campo oculto.

## 19. Documentation Updates Required
- Guía de seguridad: "Cómo proteger tus llaves en HardKas".
- Explicación de por qué `lock/unlock` son stateless por ahora.
- Advertencia sobre el uso de variables de entorno en sistemas compartidos (history, logs).

## 20. Checklist
- [x] Revisar storage local
- [x] Revisar encryption
- [x] Revisar unlock flow
- [x] Revisar password prompts
- [x] Revisar memory leaks
- [x] Revisar session model
- [x] No modificar lógica runtime
- [x] No modificar crypto
- [x] No modificar keystore
- [x] No modificar comandos

## Guardrails
No se modificó lógica runtime.
No se modificó criptografía.
No se modificó keystore.
No se modificaron comandos.
Esta auditoría es documental.
