# Guion de vídeo · HardKAS 0.12.0-rc.23 · "De directorio vacío a pagos Kaspa reales"

Probado el 2026-09-26 contra el paquete publicado en npm (`@hardkas/cli@0.12.0-rc.23`, dist-tag `rc`) y un nodo `rusty-kaspad v2.0.1` en Docker. Todos los comandos de abajo se ejecutaron y dieron el resultado indicado.

**Mensaje del vídeo:** con un comando tienes un nodo Kaspa real, cuentas, pagos de verdad, y cada paso deja una prueba que cualquiera puede verificar. Si alguien la manipula, HardKAS lo detecta.

**Duración objetivo:** 4–5 min montados. Cortar las esperas (instalación ~2 min, cada minado 15–150 s).

## Antes de grabar

- Docker Desktop arrancado. Las imágenes `kaspanet/rusty-kaspad:v2.0.1` y `kaspanet/cpuminer` ya están descargadas en este equipo.
- Terminal en UTF-8 (Windows Terminal, o `chcp 65001`) para que los iconos salgan bien.
- Fuente grande, fondo oscuro, ventana a ~110 columnas.
- Nombres: la CLI añade un `1` al nombre de cada cuenta (`ana` → `ana1`). El guion ya usa `minera1`, `ana1`, `ben1`.

## Escenas

### 1 · Directorio vacío → proyecto (≈20 s montado)
> "Carpeta vacía. Un comando y tengo un proyecto Kaspa."
```powershell
mkdir demo-kaspa; cd demo-kaspa
npx @hardkas/cli@0.12.0-rc.23 init wallet-demo
cd wallet-demo
npm install
npm install -D @hardkas/cli@0.12.0-rc.23
```
Cortar la instalación. El `init` imprime "HardKAS project 'wallet-demo' initialized successfully" y fija la versión rc.23.

### 2 · Un nodo Kaspa real (≈20 s)
> "Esto no es un simulador: es el nodo oficial de Kaspa, en Docker, y HardKAS comprueba que es exactamente la imagen fijada."
```powershell
npx hardkas localnet start --toccata
npx hardkas localnet status
```
Enseñar: `TOCCATA_NODE_READY` en ~6 s y `Identity: VERIFIED (… sha256:db36449e2f41…)`, `Version: 2.0.1`.

### 3 · Tres cuentas (≈20 s)
> "Una minera, Ana y Ben. Claves de desarrollo, solo para esta red local."
```powershell
npx hardkas accounts real generate --name minera --unsafe-plaintext --yes
npx hardkas accounts real generate --name ana --unsafe-plaintext --yes
npx hardkas accounts real generate --name ben --unsafe-plaintext --yes
```
Frase útil: "HardKAS me obliga a escribir `--unsafe-plaintext --yes` para guardar claves en claro. No te deja hacerlo sin querer."

### 4 · Minar dinero de verdad (≈15 s montado, real ~40 s)
> "El minero de Kaspa mina bloques reales y el premio va a la minera."
```powershell
npx hardkas localnet fund minera1
```
Enseñar: `TOCCATA_ACCOUNT_FUNDED` y el saldo maduro.

### 5 · Primer pago, paso a paso (≈40 s)
> "Tres pasos, tres ficheros: el plan, la firma y el envío. Cada uno es una prueba."
```powershell
npx hardkas tx plan --from minera1 --to ana1 --amount 1000 --network simnet --out pago.plan.json
npx hardkas tx sign pago.plan.json --account minera1 --out pago.signed.json
npx hardkas tx send pago.signed.json --network simnet --yes
```
Enseñar del plan: entradas, `Fee` y `Mass` calculados por el Generator oficial de Kaspa. Del envío: el `Tx ID` real.

### 6 · Confirmar y ver saldos (≈20 s montado, real 15–150 s)
> "Minamos unos bloques para que la red lo incluya… y Ana tiene sus 1000 KAS."
```powershell
npx hardkas localnet fund minera1 --amount 1
npx hardkas accounts balance ana1 --network simnet
```

### 7 · Ana paga a Ben en un solo comando (≈30 s)
```powershell
npx hardkas tx send --from ana1 --to ben1 --amount 250 --network simnet --yes
npx hardkas localnet fund minera1 --amount 1
npx hardkas accounts balance ana1 --network simnet
npx hardkas accounts balance ben1 --network simnet
```
Enseñar: Ben 250 KAS, Ana 1000 − 250 − una fee de milésimas. "Y la fee se la ha llevado la minera en el siguiente bloque."

### 8 · El momento "vale, esto sirve para algo" (≈45 s)
> "Cada paso deja un fichero con su huella. Lo verifico… y ahora hago trampa."
```powershell
npx hardkas verify pago.signed.json
copy pago.signed.json trucado.signed.json
notepad trucado.signed.json      # cambiar a mano un dígito de "amountSompi" y guardar
npx hardkas verify trucado.signed.json
npx hardkas tx send trucado.signed.json --network simnet --yes
```
Resultado probado: el original da `VERIFICATION SUCCESSFUL · Scope: FULL`. El trucado da `VERIFICATION FAILED` con `ARTIFACT_HASH_MISMATCH` (hash esperado frente a hash real) y el envío se niega antes de tocar la red.

### 9 · Sin confirmación no se ejecuta nada (≈15 s)
> "Y si un script o una IA intenta enviar a una red pública sin confirmación humana…"
```powershell
npx hardkas tx send --from ben1 --to ana1 --amount 1 --network testnet-10
echo $LASTEXITCODE
```
Resultado probado: `NOT EXECUTED … Nothing was planned, signed, broadcast or written`, código de salida 3. Nada se envía.

### 10 · Cierre (≈10 s)
```powershell
npx hardkas localnet stop --toccata
```
> "Directorio vacío, nodo real, pagos reales y pruebas verificables. Eso es HardKAS."

## Qué NO enseñar en cámara (fallos reales del rc.23)

| Qué | Por qué evitarlo |
|---|---|
| La línea `Consensus Validated: YES` al enviar en red, y `Consensus Validation: performed by remote node` en `explain` | Es falsa: la transacción solo está en el mempool. Es el punto (f) T-A14b pendiente. Recortar esas líneas o usar `--json`. |
| Saldos en el simulador (`--network simulated`) tras un envío | Bug: el envío escribe las salidas en `kaspa:sim_<nombre>` y el saldo por nombre mira `kaspasim:…`. Tras enviar 25 KAS, Alice sale con 0 y Bob con 1000. |
| Planificar con el minero encendido (`--keep-miner`) | El plan falla con `UTXO_VIRTUAL_STATE_UNSTABLE` y una traza cruda. Por eso el guion mina en ráfagas después de enviar. |
| `tx send <signed> --network simnet` sin `--yes` | En simnet la confirmación no se exige y SÍ emite. Para la escena 9 usar `testnet-10`. |
| `accounts list` | Mezcla las 5 cuentas sintéticas y etiqueta como `(encrypted)` las cuentas guardadas en claro. |
| Reenviar el mismo firmado | El nodo lo rechaza ("already in the mempool") pero la salida pone ✔ delante de "NOT accepted" y `Tx ID unknown`. |

## Hallazgos para después (no bloquean el vídeo)

1. **Grave para TN10/mainnet:** la protección del plan real compara el hash de `virtualDaaScore` + padres virtuales + sink antes y después de planificar (`packages/cli/src/runners/tx-plan-runner.ts`). A 10 BPS ese estado cambia entre medias casi siempre, así que `tx plan`/`tx send --from` de la CLI fallarán en una red viva. Ya existe la comprobación correcta (las entradas elegidas siguen presentes); la igualdad del estado virtual sobra.
2. **Simulador, identidad doble:** `applySimulatedPayment` escribe las salidas con la dirección del plan (`kaspa:sim_*`) mientras las entradas se resolvieron a `kaspasim:*`.
3. **T-A14b:** narrativas `Consensus Validated: YES` y `explain` "performed by remote node" sobre envíos que solo están en mempool; ✔ en rechazos.
4. **Pulido:** sufijo `1` en nombres; texto `account(s, { cwd })`; etiqueta `(encrypted)` en cuentas en claro; `console.error("[runTxFlow catch]")` imprime trazas; `tx plan` no dice dónde guardó el artefacto; el scaffold no incluye `@hardkas/cli`; `init` anuncia `test/payment.scenario.ts` pero crea `test/payment.test.ts`; `accounts balance alice` muestra `Account: Unknown`.

Ningún cambio en el repo. Todo esto se probó en un directorio aparte.
