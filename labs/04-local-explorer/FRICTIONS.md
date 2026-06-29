# Fricciones Documentadas - Builder Lab 04

Este documento captura las fricciones (carencias del SDK o puntos de dolor) encontradas al construir el Local Explorer / Indexer en memoria.

## Fricciones Esperadas (a descubrir y documentar):
- `IndexerStore` / `ProjectionStore` persistente (SQLite)
- `AddressHistoryProjection` (abstracción estándar para proyectar historial de direcciones)
- `PaymentReceiptIndex` (indexación específica de facturas/pagos)
- `ArtifactIndex` (indexación general de artefactos por hash/schema)
- `ReconciliationReport` (artefacto estándar)
- `EventSubscriber` (modelo de suscripción a eventos locales)
