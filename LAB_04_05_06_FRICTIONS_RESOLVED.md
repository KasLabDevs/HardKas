# Fricciones Lab 04, 05 y 06 Resueltas

Durante la construcción del **Local Explorer (Lab 04)**, la **Wallet CLI (Lab 05)** y el **Oracle Service (Lab 06)**, se experimentó repetición real y dolorosa en el manejo de persistencia local y subscripción a eventos de Kaspa. 

Dichas fricciones ahora han sido resueltas estructuralmente introduciendo estas capacidades fundacionales al SDK:

1. **Repetición en la Indexación de Artifacts**: Se abstrajo en `ArtifactIndexStoreJson` (`@hardkas/artifacts`).
2. **Repetición en Agrupación de Evidencia**: Se resolvió con `EvidenceBatchExporter` (`@hardkas/artifacts`).
3. **Repetición en Proyecciones Locales/Caché**: Se resolvió con `ProjectionStoreJson` (`@hardkas/query-store`).
4. **Repetición en el Polling Manual de `WalletQuery`**: Se resolvió introduciendo `EventSubscriber` (`@hardkas/core`), que abstrae el polling mediante eventos.

Con estas piezas de infraestructura extraídas al nivel del SDK, los próximos laboratorios, especialmente **Lab 07 — Batch Engine**, gozarán de un ecosistema mucho más limpio para iterar la lógica de negocio sin preocuparse del "fontanería" de indexado y polling.
