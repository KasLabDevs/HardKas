# RFC: HardKas Config v1

## 1. Executive Summary
Esta RFC propone un rediseño del sistema de configuración de HardKas hacia la versión v1. El sistema actual, aunque funcional para una etapa alpha, presenta limitaciones en la validación, mezcla dominios de ejecución (L1/L2) y carece de una abstracción formal para perfiles de entorno. 

La Configuración v1 se basa en los principios de separación de dominios (L1 vs L2), abstracción de signers (Account Abstraction) y validación en tiempo de ejecución. Este diseño garantiza que `hardkas.config.ts` sea la fuente única de verdad para el CLI y el SDK, eliminando ambigüedades en redes multi-capa y reforzando la seguridad mediante referencias a secretos en lugar de valores inline. Se mantiene la ejecución mediante TypeScript para máxima flexibilidad, subrayando que **hardkas.config.ts is trusted code. Do not run HardKas inside untrusted repositories.**

## 2. Goals
- **Minimal Surface Area**: Configuración inicial compacta y fácil de entender.
- **Strong TypeScript Inference**: Aprovechar el sistema de tipos para autocompletado avanzado.
- **Runtime Validation**: Validación estructural mediante esquemas (ej. Zod) en el arranque.
- **Explicit L1/L2 Separation**: Dominios diferenciados para Kaspa (UTXO) e Igra (EVM-based).
- **Provider Abstraction**: Desacoplar la definición de red de la implementación del nodo/RPC.
- **Account Abstraction**: Mapeo flexible de identidades (simuladas, keystore, env).
- **Environment Profiles**: Gestión de entornos (dev, testnet, prod) sin duplicación.
- **Safe Defaults**: Valores seguros y sensatos "out of the box".
- **No Inline Private Keys**: Prohibir o desincentivar llaves privadas en texto plano.
- **Generated Docs from Schema**: Capacidad de generar documentación técnica desde el esquema.
- **Future Plugin Compatibility**: Base preparada para extensiones de terceros.

## 3. Non-Goals
- **Plugin System completo**: El sistema de plugins se abordará en una RFC posterior.
- **Secret Manager empresarial**: HardKas no pretende reemplazar herramientas como HashiCorp Vault.
- **Ejecutar EVM en Kaspa L1**: L1 permanece como capa UTXO pura.
- **Resolver bridge trust assumptions**: La config reporta el estado, no garantiza la seguridad del bridge.
- **Reemplazar keystore implementation**: Se mantiene el sistema de archivos cifrados actual.
- **Breaking changes innecesarios**: Se proveerá un path de migración desde v0.2.
- **Hardhat Clone**: HardKas mantiene su identidad propia enfocada en Kaspa.

## 4. Design Principles

### 4.1 Minimal by default
La configuración generada por `hardkas init` debe tener menos de 20 líneas, exponiendo solo lo esencial para empezar.

### 4.2 Explicit over magic
Las redes críticas (Mainnet) deben estar definidas explícitamente. No se debe inferir el uso de Mainnet por omisión.

### 4.3 L1 and L2 are different execution domains
Kaspa L1 (UTXO/DAG) e Igra L2 (EVM/Rollup) tienen modelos de cuentas, transacciones y recibos fundamentalmente distintos. El esquema debe reflejar esta separación.

### 4.4 Secrets are references, not values
La configuración debe referenciar secretos mediante nombres de variables de entorno o alias de keystore. Nunca valores sensibles inline.

### 4.5 Runtime validation complements TypeScript
Aunque `defineHardkasConfig` proporciona ayuda en el IDE, la validación en tiempo de ejecución es obligatoria para garantizar la integridad antes de cualquier operación de red.

### 4.6 CLI and SDK share the same config model
Un único esquema rige el comportamiento de la herramienta de línea de comandos y el uso programático mediante el SDK.

## 5. Proposed Top-Level Shape

```ts
export default defineHardkasConfig({
  version: 1,

  // Perfil activo por defecto si no se especifica --profile
  defaultProfile: "dev",

  // Perfiles de entorno que orquestan el uso de redes y cuentas
  profiles: {
    dev: {
      l1: "simnet",
      l2: "igraDev",
      accounts: ["alice", "bob"],
      defaultAccount: "alice"
    },
    testnet: {
      l1: "kaspaTestnet",
      l2: "igraTestnet",
      accounts: ["deployer"]
    }
  },

  // Definición de redes Kaspa L1
  l1: {
    simnet: { kind: "simulated", network: "simnet" },
    kaspaTestnet: { 
      kind: "kaspa-rpc", 
      network: "testnet-10", 
      rpcUrl: process.env.KASPA_RPC_URL 
    }
  },

  // Definición de redes Igra L2
  l2: {
    igraDev: { 
      kind: "igra", 
      l1: "simnet", 
      chainId: 19416, 
      rpcUrl: "http://localhost:8545" 
    },
    igraTestnet: { 
      kind: "igra", 
      l1: "kaspaTestnet", 
      chainId: 19417, 
      rpcUrl: "https://rpc.igra.testnet" 
    }
  },

  // Registro central de cuentas e identidades
  accounts: {
    alice: { kind: "simulated" },
    deployer: { kind: "keystore", ref: "deployer" }
  },

  // Configuración de rutas del proyecto
  paths: {
    artifacts: ".hardkas/artifacts",
    queryStore: ".hardkas/query.sqlite",
    keystore: ".hardkas/keystore"
  }
});
```

**Justificación de la estructura**:
- **profiles**: Permite cambiar todo el contexto (redes + cuentas) con un solo flag.
- **l1 / l2**: Separa las responsabilidades de infraestructura. L2 referencia a L1.
- **accounts**: Centraliza quién firma, independientemente de la red.
- **paths**: Elimina rutas hardcoded, permitiendo setups de CI y monorepos.

## 6. L1 Network Model

```ts
type L1Network =
  | {
      kind: "simulated";
      network: "simnet";
      provider?: "in-memory" | "localnet";
    }
  | {
      kind: "kaspa-node";
      network: "simnet" | "testnet-10" | "mainnet";
      rpcUrl: string;
      dataDir?: string;
      binaryPath?: string;
    }
  | {
      kind: "kaspa-rpc";
      network: "simnet" | "testnet-10" | "mainnet";
      rpcUrl: string;
      timeoutMs?: number;
      headers?: Record<string, string>;
    };
```
- **mainnet safety**: Las redes Mainnet requieren confirmación explícita o flags de seguridad adicionales.
- **rpcUrl requirements**: Validación de protocolo (ws/wss/http/https).

## 7. L2 Network Model

```ts
type L2Network =
  | {
      kind: "igra";
      execution: "evm";
      basedOn: "kaspa";
      l1: keyof Config["l1"]; // Referencia a una red L1 definida
      chainId: number;
      rpcUrl: string;
      explorerUrl?: string;
      currencySymbol?: string;
      bridge?: {
        mode: "pre-zk" | "mpc" | "zk";
        assumptions?: string[];
      };
    };
```
- **L2 references L1**: Crucial para orquestar retiros y validación de bridge.
- **Bridge info**: Puramente informativo para la UI del CLI y auditoría de riesgos.

## 8. Provider Abstraction

**Recomendación v1: Option A (Embedded Provider)**.
Para mantener la simplicidad inicial, la definición del provider (RPC URL, auth) vive dentro de la red.
- **Pros**: Configuración más plana y legible para proyectos pequeños.
- **Cons**: Duplicación si varias redes usan el mismo endpoint con distintos parámetros.
- **Evolución**: En v2 se considerará un `registry` de providers si la complejidad lo justifica.

## 9. Account Abstraction

```ts
accounts: {
  alice: { kind: "simulated" },
  deployer: {
    kind: "keystore",
    ref: "deployer-key",
    networks: ["kaspaTestnet", "igraTestnet"] // Restricción opcional
  },
  ci: {
    kind: "env",
    address: "kaspa:...",
    privateKeyEnv: "KASPA_PRIVATE_KEY"
  }
}
```
- **No inline keys**: El esquema prohibirá campos tipo `privateKey: "0x..."`.
- **Redaction**: El SDK debe ocultar los valores de las variables de entorno en cualquier log de diagnóstico o comando `config show`.

## 10. Environment Profiles

Los perfiles son orquestadores de contexto:
- **Default Profile**: Determina qué redes y cuentas se usan por defecto.
- **HARDKAS_PROFILE**: Variable de entorno para sobreescribir el perfil.
- **Strict Mode**: Si un perfil es `strict`, no se permiten cuentas no declaradas explícitamente en ese perfil.

## 11. Paths Model

- **CI-safe paths**: Permite apuntar a directorios temporales en CI.
- **gitignore**: El comando `init` generará un `.gitignore` basado en estas rutas.

## 12. Runtime Validation

Se propone el uso de **Zod** para:
- Mensajes de error humanos (ej. "networks.testnet.rpcUrl is missing").
- Agregación de errores (mostrar todos los problemas de config de una vez).
- **Redaction**: Asegurar que secretos cargados no se impriman en errores.
- Comandos `hardkas config validate` y `hardkas config doctor`.

## 13. Typed Config Inference

La inferencia de literales exactos (ej. para que `keyof Config["l1"]` devuelva los nombres reales de las redes) se preserva mediante el uso de **genéricos con parámetros de tipo constantes** (`const type parameters`) en la función `defineHardkasConfig`. Esto evita que TypeScript "ensanche" los tipos de las claves a `string` genérico.

```ts
export function defineHardkasConfig<const T extends HardkasConfig>(config: T): T {
  return config;
}
```

## 14. Migration From Current Config

**Path de migración**:
- **v0.2 Adapter**: El loader detectará si falta el campo `version: 1` y aplicará un adaptador de compatibilidad.
- **Deprecation**: Se emitirá un warning en el CLI sugiriendo ejecutar `hardkas config migrate`.
- **Automated Migration**: El comando `config migrate` reescribirá el archivo (vía `jiti` y manipulación de AST) al nuevo formato.

## 15. CLI Changes Required
- `--profile <name>`: Flag global.
- `hardkas config validate`: Nuevo comando.
- `hardkas config doctor`: Extendido para validar conectividad de cada perfil.
- Comandos de ejecución (`tx`, `node`, `l2`): Deben ser "profile-aware".

## 16. SDK Changes Required
- `Hardkas.open({ profile: "dev" })`.
- `sdk.l1` y `sdk.l2` como namespaces separados.
- Resolución tipada de redes y cuentas.

## 17. Security Model

> [!IMPORTANT]
> **hardkas.config.ts is trusted code. Do not run HardKas inside untrusted repositories.** HardKas ejecuta este archivo durante el arranque.

- **Confirmación en Mainnet**: Los perfiles asociados a Mainnet deben activar por defecto `requireConfirmations: true`.
- **Secrets redaction**: Garantizar que el SDK no exponga accidentalmente valores de variables de entorno en la salida estándar.

## 18. Example Configs

### Minimal dev config
```ts
export default defineHardkasConfig({
  version: 1,
  defaultProfile: "dev",
  profiles: {
    dev: { l1: "simnet", accounts: ["alice", "bob"] }
  },
  l1: {
    simnet: { kind: "simulated", network: "simnet" }
  },
  accounts: {
    alice: { kind: "simulated" },
    bob: { kind: "simulated" }
  }
});
```

### L1 + Igra config
```ts
export default defineHardkasConfig({
  version: 1,
  defaultProfile: "igra-test",
  profiles: {
    "igra-test": {
      l1: "testnet",
      l2: "igra",
      accounts: ["deployer"]
    }
  },
  l1: {
    testnet: { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: "ws://..." }
  },
  l2: {
    igra: { kind: "igra", l1: "testnet", chainId: 19416, rpcUrl: "https://..." }
  },
  accounts: {
    deployer: { kind: "keystore", ref: "deployer-key" }
  }
});
```

## 19. Open Questions
1. ¿Debería el registro de providers ser independiente para soportar plugins de infraestructura?
2. ¿Las asunciones de seguridad de L2 deben vivir en config o ser descargadas de un registro oficial?
3. ¿Soportar interpolación automática de `${ENV_VAR}` en strings o dejarlo a la lógica de TS?
4. ¿Deshabilitar el broadcast en Mainnet por defecto en todos los perfiles salvo que se habilite explícitamente?

## 20. Acceptance Criteria
- [x] Define top-level shape.
- [x] Separa L1/L2.
- [x] Define abstracción de proveedores.
- [x] Define abstracción de cuentas.
- [x] Define perfiles de entorno.
- [x] Define modelo de rutas.
- [x] Define validación runtime.
- [x] Define plan de migración.
- [x] Define modelo de seguridad.

## 21. Checklist
- [x] Config minimalista
- [x] Separar L1/L2
- [x] Provider abstraction
- [x] Account abstraction
- [x] Environment profiles
- [x] Typed config inference
- [x] No modificar lógica runtime
- [x] No modificar schema actual
- [x] No modificar loader actual

## Guardrails
No se modificó lógica runtime.
No se modificó el loader actual.
No se modificó el schema actual.
No se modificaron comandos.
Esta RFC es diseño, no implementación.
