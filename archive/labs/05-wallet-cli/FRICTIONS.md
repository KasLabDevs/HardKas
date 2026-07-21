# Fricciones Documentadas - Builder Lab 05

Este documento captura las fricciones encontradas al construir una Wallet CLI consumiendo los helpers orientados a carteras (`WalletManager`, `AddressManager`, `WalletQuery`, `CoinSelector`, `FeeEstimator`).

## Fricciones Esperadas a documentar:
- `WalletStateStore` (Cómo persistir estado local de forma segura)
- `EvidenceBatchExporter` (Si la CLI sufre manejando y exportando artifacts a disco)
- `ArtifactIndex` (Si se requiere consultar el index local de forma recurrente)
- Helpers de formateo amigables (ej. convertir SOMPI a KAS cómodamente en la CLI)
- Helper para parseo seguro de cantidades ingresadas por usuario
