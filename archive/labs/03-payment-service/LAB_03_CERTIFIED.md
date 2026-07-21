# P33.5 — Lab 03 Certification

El **Builder Lab 03 — Payment Service** ha sido formalmente certificado.

## Capacidades Validadas

Todas las capacidades requeridas han sido implementadas, testeadas y verificadas:

- [x] Merchant registration
- [x] Invoice creation
- [x] Address derivation (vía `AddressManager` y `WalletManager`)
- [x] URI generation (vía `KaspaURIBuilder`)
- [x] Payment check (vía `WalletQuery` y `PaymentTracker` de forma abstracta)
- [x] Webhook mock (`WebhookTransport` síncrono in-memory/fetch)
- [x] Reconciliation (balance local vs. balance onchain simulado)
- [x] Payment receipt artifact (creación de `payment-receipt.v1`)
- [x] Evidence export (exportación de artifacts validados en lote)
- [x] No secrets (mnemónicos y claves privadas no se exponen)
- [x] No forbidden claims (`absoluteFinality: false`, `economicSafetyGuarantee: false`)

## Consumo y Consolidación de Helpers

Este laboratorio validó por **segunda vez** los siguientes componentes, cimentando su diseño en el SDK:

1. `WalletManager` y `AddressManager` (`@hardkas/accounts`)
2. `KaspaURIBuilder` (`@hardkas/tx-builder`)
3. `WalletQuery` y `PaymentTracker` (`@hardkas/query`)
4. Artefactos de evidencia y esquemas de pólizas (`@hardkas/artifacts`)

## Fricciones Descubiertas (para el futuro)

Las fricciones encontradas quedan documentadas en `FRICTIONS.md` para ser resueltas en futuras iteraciones del SDK:

1. `WebhookDispatcher`
2. `PaymentServiceStore / PersistenceAdapter`
3. `ReconciliationReport`
4. `EvidenceBatchExporter`

El servicio cumple estrictamente con el enfoque local, delegando el acceso a red a providers inyectables.
