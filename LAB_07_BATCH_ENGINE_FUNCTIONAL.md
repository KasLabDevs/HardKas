# Lab 07 — Batch Engine Functional

El Batch Engine ha sido implementado satisfactoriamente siguiendo las restricciones del laboratorio:
- **No** se utilizaron herramientas de colas distribuidas externas (Redis, BullMQ, RabbitMQ).
- La ejecución se realizó asíncronamente en memoria, controlada por un `JobRunner` interno y rudimentario.
- Los trabajos simularon operaciones pesadas (reconciliación, exportación de evidencia, y reconstrucción de proyecciones) paginando a través de cursores ad-hoc (`BatchCursor`).
- Las abstracciones `ProjectionStoreJson`, `ArtifactIndexStoreJson`, `EvidenceBatchExporter`, y `EventSubscriber` introducidas en Round 2 probaron ser robustas y ergonómicas para este caso de uso. No hubo necesidad de re-implementar su lógica, lo cual valida su extracción exitosa al SDK core.

## Endpoints Implementados
- `POST /jobs/reconcile`
- `POST /jobs/export-evidence`
- `POST /jobs/rebuild-projections`
- `GET /jobs/:id`
- `POST /jobs/:id/retry`

La persistencia de estado para el seguimiento del progreso se realizó de forma local en disco, lo que genera fricciones claras (como se esperaba).
