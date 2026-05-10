# HardKAS CLI Reference

Guía de referencia completa para los comandos del CLI de HardKAS.

## Resumen Global

| Comando Base | Descripción | Madurez |
| :--- | :--- | :--- |
| `hardkas init` | Inicializa un nuevo proyecto HardKAS | `🟢 STABLE` |
| `hardkas tx` | Gestión y envío de transacciones L1 | `🟢 STABLE` |
| `hardkas accounts` | Gestión de cuentas y keystore | `🟢 STABLE` |
| `hardkas query` | Motor de búsqueda relacional de artefactos | `🧪 PREVIEW` |
| `hardkas node` | Orquestación de nodos locales (Docker) | `🟢 STABLE` |
| `hardkas l2` | Integración con Igra L2 (EVM) | `🟢 STABLE` |
| `hardkas test` | Runner de pruebas deterministas | `🟠 MOCK` |

---

## Comandos de Inicialización

### `hardkas init [name]`
Crea una estructura de proyecto HardKAS en el directorio actual.
- **Flags**:
  - `--force`: Sobrescribe archivos existentes.

### `hardkas up`
Verifica el entorno y levanta los servicios básicos configurados.

---

## Gestión de Transacciones (L1)

### `hardkas tx plan`
Crea un plan de transacción basado en la configuración actual.
- **Opciones**: `--from`, `--to`, `--amount`, `--network`.

### `hardkas tx sign <path>`
Firma un archivo de plan de transacción.
- **Opciones**: `--account <name>`.

### `hardkas tx send [path]`
Emite una transacción firmada a la red Kaspa.
- **Modo Shortcut**: `hardkas tx send --from alice --to bob --amount 10`

---

## Motor de Consultas (Query Engine)

El motor de consultas permite introspección profunda de la historia de transacciones y artefactos.

### `hardkas query artifacts list`
Busca artefactos en el store local.

### `hardkas query lineage chain <id>`
Reconstruye la cadena de procedencia de un artefacto.

### `hardkas query dag conflicts`
Busca posibles conflictos de doble gasto en el DAG local.

---

## Orquestación de Nodo

### `hardkas node start`
Inicia un contenedor Docker con `kaspad`.

### `hardkas node logs`
Muestra los logs en tiempo real del nodo.

### `hardkas node reset`
Borra los datos de la cadena y reinicia el nodo desde el genesis.

---

## Igra L2 (EVM)

Comandos para interactuar con la capa 2 de Kaspa compatible con EVM.

### `hardkas l2 tx build`
Crea una transacción EVM para Igra.

### `hardkas l2 balance <address>`
Consulta el saldo de una dirección en la red L2.

---

## Diagnóstico

### `hardkas doctor`
Realiza un chequeo completo del sistema (Node.js, Docker, RPC, Keystore, Query Engine).
