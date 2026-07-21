# P34 — Lab 04 Certification

El **Builder Lab 04 — Local Explorer / Indexer** ha sido formalmente certificado.

## Capacidades Validadas

Todas las rutas requeridas han sido implementadas, testeadas y verificadas:

- [x] `GET /addresses/:address/balance`
- [x] `GET /addresses/:address/utxos`
- [x] `GET /addresses/:address/history`
- [x] `GET /transactions/:txid`
- [x] `GET /payments/:invoiceId`
- [x] `GET /reconciliation/:merchantId`
- [x] `GET /artifacts/:hash`
- [x] `GET /health`

## Consumo y Consolidación de Helpers

Este laboratorio validó **exclusivamente por ingesta de artefactos** (Artifact -> Projection -> API):

1. `PaymentReceiptArtifactV1` y `TxReceiptArtifactV1` (`@hardkas/artifacts`)

## Fricciones Descubiertas (para el futuro)

Las fricciones encontradas quedan documentadas en `FRICTIONS.md` para ser resueltas en futuras iteraciones del SDK:

1. `IndexerStore` / `ProjectionStore` (persistencia a SQLite)
2. `AddressHistoryProjection` (abstracción estándar)
3. `PaymentReceiptIndex` y `ArtifactIndex`
4. `EventSubscriber` (mecanismo para mantener el estado actualizado en vivo)

El explorador actual demuestra cómo las aplicaciones futuras consumirán directamente el modelo de eventos/artefactos generados por el framework para construir interfaces complejas, sin requerir una conexión a red RPC directa, confirmando la viabilidad arquitectónica local-first.
