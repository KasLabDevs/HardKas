# Fricciones Documentadas - Builder Lab 01

Este documento captura las fricciones (carencias del SDK o puntos de dolor) encontradas al construir el Backend de Wallet.
Cada fricción se convertirá en un requerimiento para un nuevo Helper, Plugin o Template en HardKAS.

### FRICTION #01: Gestión de Semillas / Mnemonics (✅ RESUELTA)
**Contexto:** Un wallet backend necesita crear nuevas "cuentas" para los usuarios. Cada cuenta suele estar respaldada por una semilla (mnemonic).
**Problema con HardKAS actual:** HardKAS no exponía una API de alto nivel para generar mnemonicos y administrar carteras de forma segura.
**Solución propuesta:** Añadir `@hardkas/accounts/WalletManager` al SDK.
*(Resuelta en P31 con la implementación de `hk.walletManager` y ciclo de vida de `seedRef` sin custodia)*

### FRICTION #02: Derivación de Direcciones (✅ RESUELTA)
**Contexto:** En `generateAddress`, necesitamos derivar `m/44'/111111'/0'/0/x`.
**Problema con HardKAS actual:** No hay un `AddressManager` nativo para llevar la cuenta del `pathIndex` y derivar fácilmente de la seed de la wallet.
**Solución propuesta:** `AddressManager` helper en el SDK que guarde el estado del index.
*(Resuelta en P30 con la implementación de `hk.addressManager.derive` y generadores stateless)*

### FRICTION #03: Obtención de Balance y UTXOs Masiva (✅ RESUELTA)
**Contexto:** `getBalance` y `getUtxos` requieren obtener el estado de múltiples direcciones derivadas de la wallet.
**Problema con HardKAS actual:** Hay que iterar manualmente llamando al RPC `getBalancesByAddresses` lo cual puede ser ineficiente o complejo de orquestar. El nodo Kaspa por defecto no tiene un índice por wallet (xpub).
**Solución propuesta:** `WalletQuery` helper con `WalletQueryProvider` inyectable.
*(Resuelta en P32 con `hk.walletQuery` — provider DI, degraded results, claims explícitas)*

### FRICTION #04: Coin Selection (✅ RESUELTA)
**Contexto:** Al hacer `send(amount)`, necesitamos juntar varios UTXOs.
**Problema con HardKAS actual:** Falta un algoritmo de `CoinSelector` en el SDK.
**Solución propuesta:** SDK Helper `CoinSelector`.
*(Resuelta en P28 con la implementación de `hk.coinSelector.select`)*

### FRICTION #05: Estimación de Fees (✅ RESUELTA)
**Contexto:** Al hacer `send` o `estimateFee`, necesitamos calcular el fee de red de Kaspa basado en el tamaño en masa (mass) de la transacción.
**Problema con HardKAS actual:** No hay `FeeEstimator` nativo para orquestar la masa y obtener el costo exacto antes de firmar.
**Solución propuesta:** SDK Helper `FeeEstimator`.
*(Resuelta en P29 con la implementación de `hk.feeEstimator.estimate`)*
