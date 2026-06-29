# Lab 08 — Full Stack Demo Functional

El Full Stack Demo ha sido completado y verificado.
Se construyó un monolito modular con Fastify que engloba:
1. **Frontend**: UI moderna con glassmorphism, servida estáticamente.
2. **Payment API**: Crea facturas y simula pagos.
3. **Oracle API**: Métricas de pagos en base a `ProjectionStore`.
4. **Explorer API**: Consulta de balances actualizados post-pago.
5. **Batch API**: Ejecuta reconciliación disparada desde la UI y reporta progreso.

## Fricciones Confirmadas
Para lograr que la interfaz de usuario mostrara una **barra de progreso real** al hacer click en "Run Reconciliation Job", y que el job se ejecutara en background sin bloquear las respuestas a otras peticiones del dashboard, fue **estrictamente necesario** reimplementar (en este caso, copiar casi exactamente) las primitivas ad-hoc de `JobRunner`, `JobCheckpoint`, `ProgressReporter`, `RetryPolicy` y `BatchCursor` dentro del lab.

Esto responde de forma afirmativa a la pregunta planteada:
> ¿JobRunner + ProgressReporter + RetryPolicy + Checkpoint reaparecieron con suficiente dolor? -> **SÍ.**

Queda así validada metodológicamente la necesidad de extraer esta lógica hacia un paquete transversal `@hardkas/jobs` en una subsecuente **Helper Extraction Round 3**.
