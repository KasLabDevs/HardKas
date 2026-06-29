# P36 — App Labs Helper Extraction Round 1

## Status: READY

Los siguientes helpers han sido extraídos al SDK core exitosamente basándonos en las fricciones documentadas en Labs 03, 04 y 05:

### 1. Formateadores Sompi/KAS (`@hardkas/core`)
- Se verificó que `formatSompiToKas(sompi: bigint)` y `parseKasToSompi(kas: string)` ya estaban implementados de manera segura en `money.ts`, exponiéndolos correctamente para que sean usados por las UIs y CLIs. Manejan correctamente hasta 8 decimales, ceros a la izquierda y rechazan notación científica o números inseguros.

### 2. Normalizador UTXO (`@hardkas/tx-builder`)
- `toTxBuilderUtxo(flatUtxo)`: Mapea UTXOs planos (como los retornados por `WalletQuery`) al modelo jerárquico `outpoint: { transactionId, index }` esperado por `buildPaymentPlan`.
- `toWalletQueryUtxo(builderUtxo)`: Operación inversa.

### 3. Persistencia de Billeteras (`@hardkas/accounts`)
- `WalletStateStoreJson`: Una clase que permite persistir los índices de derivación `receiveIndex` y `changeIndex` de las cuentas locales en `.hardkas/wallet-state.json`.

Con esta extracción, resolvemos las primeras grandes fricciones arquitectónicas de integración en entornos Node, CLI y Fastify.

Las fricciones complejas (`ArtifactIndex`, `EvidenceBatchExporter`, `ProjectionStore`, `EventSubscriber`) permanecen pendientes intencionalmente hasta validarlas nuevamente en los próximos Labs (06 Oracle / 07 Batch Engine).
