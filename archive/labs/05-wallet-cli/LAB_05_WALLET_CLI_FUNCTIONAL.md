# P35 — Lab 05 Certification

El **Builder Lab 05 — Wallet CLI** ha sido formalmente certificado.

## Capacidades Validadas

Todas las funcionalidades CLI requeridas han sido implementadas y verificadas consumiendo la SDK:

- [x] `wallet create`
- [x] `wallet address`
- [x] `wallet balance`
- [x] `wallet utxos`
- [x] `wallet history`
- [x] `wallet send` (simulated transaction plan)
- [x] `wallet estimate-fee`
- [x] `wallet export-evidence`

## Consumo y Ergonomía Evaluada

Este laboratorio validó la ergonomía de los helpers orientados a billeteras desde una perspectiva interactiva de usuario/scripting:

1. `WalletManager` y `AddressManager`: Fueron fáciles y limpios de integrar (Regla del Consumidor validada).
2. `WalletQuery`: Cumplió excelentemente con aislar el estado on-chain. Sin embargo, su tipo `Utxo` diverge del esperado por el builder.
3. `buildPaymentPlan` (y `estimateMass`): Demostraron buena abstracción para selección de monedas y cálculo de fees.

## Fricciones Confirmadas (Documentadas en `FRICTIONS.md`)

Varias de las hipótesis de fricción de labs anteriores se han visto confirmadas y exacerbadas al lidiar con un entorno CLI interactivo:

1. **`WalletStateStore`**: La necesidad de persistir y cargar un índice de direcciones locales es innegable; actualmente se improvisó sobre `fs.readFileSync`.
2. **`ArtifactIndex` / `EvidenceBatchExporter`**: Sin un index local o helper dedicado, buscar, organizar y exportar archivos de evidencia resulta sumamente doloroso e ineficiente, confirmando la necesidad de introducirlos en la SDK core próximamente.
3. **Mapeo de Tipos UTXO**: La incompatibilidad estructural menor entre los UTXOs retornados por `WalletQuery` y los esperados por `buildPaymentPlan` del TxBuilder requirió mapeo manual.
4. **Formateadores (Formatting Helpers)**: La conversión de `Sompi` a `Kas` y el formato visual de los montos no debería depender de implementaciones manuales del consumidor final (ej. `Number(sompi) / 100000000`).
