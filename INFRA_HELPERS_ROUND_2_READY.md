# Infra Helpers Round 2 Ready

Se han extraído de forma exitosa las siguientes abstracciones de infraestructura hacia el SDK core de HardKAS:

- **`ArtifactIndexStoreJson`** en `@hardkas/artifacts`: Abstracción JSON para indexar localmente los artifacts producidos, filtrando por schema, fecha o tags, evitando los lentos `readdir`.
- **`EvidenceBatchExporter`** en `@hardkas/artifacts`: Abstracción que facilita agrupar artifacts desde el index o directos para preparar envíos y `EvidencePackage`s.
- **`ProjectionStoreJson`** en `@hardkas/query-store`: Una base para mantener proyecciones ligeras de estado en memoria/JSON (`set`, `update`, `snapshot`) sin requerir aún SQLite.
- **`EventSubscriber`** en `@hardkas/core`: Una interfaz de abstracción por `polling` (V1) sobre fuentes de consulta (`WalletQuery`), exponiendo eventos nativos (`on payment`) en lugar de timers rudimentarios.

## Estado V1
Todo usa persistencia ligera e in-memory para aligerar la carga del Builder sin añadir fricción operativa. Estos helpers se usarán en el **Lab 07 - Batch Engine**.
