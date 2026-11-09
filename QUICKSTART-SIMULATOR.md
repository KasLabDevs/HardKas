# Guía rápida del simulador HardKAS (Windows PowerShell)

> **Simulador HardKAS (EXPERIMENTAL).** Nodo Kaspa en memoria para desarrollo local: arranca sin Docker, imita la RPC de
> rusty-kaspad 2.1.0 y **aproxima** sus reglas. **No es equivalente al consenso** y nunca es evidencia del comportamiento
> de un nodo: timelocks, covenants, masas, RBF y GHOSTDAG se validan contra rusty-kaspad (nivel simnet).
> Divergencias conocidas: [`packages/simulator/README.md`](packages/simulator/README.md).

## 1. Requisitos

- Node.js 24.22.1 (el que exige `hardkas doctor`) y pnpm 9.
- kaspa-wasm gestionado (`hardkas toolchain install kaspa-wasm`): lo usan el id de las transacciones v1 y algunos tests.

## 2. Compilar

```powershell
# en la raíz del repositorio
pnpm install --frozen-lockfile
pnpm --filter @hardkas/simulator build
pnpm --filter @hardkas/cli build
```

## 3. Arrancar el simulador

```powershell
pnpm --filter @hardkas/cli exec hardkas simulator start              # simnet, automine, puerto 19110
pnpm --filter @hardkas/cli exec hardkas simulator start --port 19111 --network simnet --no-automine
```

Salida esperada (resumen):

```text
✔ Kaspa simulator (EXPERIMENTAL, 2.1.0-kaspa-simulator) running on ws://127.0.0.1:19110
ℹ HTTP JSON-RPC endpoint: http://127.0.0.1:19110
```

- Puerto propio (19110 por defecto): nunca el del localnet canónico (16210/17210/18210) ni el de una red Kaspa.
- `mainnet` se rechaza: las cuentas de desarrollo salen de una semilla pública.
- Se identifica como `2.1.0-kaspa-simulator` en `getServerInfo`: `hardkas localnet`, `hardkas silver deploy|spend|covenant`,
  `hardkas capabilities` y el harness simnet **no lo aceptan** como el rusty-kaspad canónico.
- Una página web no puede llamarlo: se rechaza cualquier petición con cabecera `Origin` (`--allow-origin` en el binario
  `kaspa-simulator` para permitir una concreta).

## 4. Migración desde la rama anterior (auditoría 6-nov-2026)

| Antes | Ahora |
| :-- | :-- |
| `HARDKAS_SIMULATOR=1` / `HARDKAS_ALLOW_SIMULATOR_NODE=1` hacían pasar el simulador por el nodo canónico | No tienen ningún efecto. Apunta la RPC del workspace al URL del simulador. |
| Simulador en `127.0.0.1:18210` | Puerto propio, 19110 por defecto; un puerto canónico se rechaza. |
| `scripts/start-simulator-service.mjs` y `run-simulator-merchant-e2e.mjs` con rutas `D:/proyectos/...` | `--workspace <ruta>` (o `HARDKAS_SIMULATOR_WORKSPACE`) y `--port`; el test recibe `HARDKAS_SIMULATOR_WS_URL`. |
| `getServerInfo` decía `2.1.0` | `2.1.0-kaspa-simulator` (pre-release semver válida). |
| Fee mínima 1 sompi/g sobre la masa total | 100 sompi/g sobre la masa de fee (compute / transitoria normalizada), como el mempool de rusty-kaspad 2.1.0. |
| Madurez de coinbase 100 | 1000 DAA (10 BPS). |
| `getFeeEstimate` con dos formas | Solo `{ estimate: { priorityBucket, normalBuckets, lowBuckets } }`. |
| Métodos desconocidos devolvían `null` | Error `SIMULATOR_RPC_METHOD_UNSUPPORTED`; RBF: `SIMULATOR_RBF_UNSUPPORTED`. |

```powershell
node scripts/start-simulator-service.mjs --workspace C:\ruta\a\mi-workspace
node scripts/run-simulator-merchant-e2e.mjs --workspace C:\ruta\al\merchant-workspace
```

## 5. Demo y tests

```powershell
node scripts/demo-simulator.mjs                       # demo local (resultados del simulador, no de un nodo)
pnpm --filter @hardkas/simulator test                 # tests del simulador (unitarios, autorreferentes)
```

Los tests que comparan con un nodo real están en el nivel simnet (`*.simnet.test.ts`, Docker) y fallan si falta el nodo:

```powershell
node node_modules\vitest\vitest.mjs run --config vitest.simnet.config.ts packages/simulator/test/rpc-shape-vs-rusty-kaspad.simnet.test.ts
```
