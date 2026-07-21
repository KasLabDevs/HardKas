# P37 — Lab 06 Certification

El **Builder Lab 06 — Oracle Service** ha sido formalmente certificado.

## Capacidades Validadas

El servicio de Oráculo se construyó empleando una arquitectura API (Fastify) acoplada a un mock del `WalletQuery`, permitiéndonos simular y observar flujos asíncronos on-chain y generar evidencia.

- [x] Oracle Service (Fastify API)
- [x] `EventPoller` (Monitoreo activo simulado)
- [x] `OracleStore` (Persistencia manual JSON de proyecciones estadísticas)
- [x] `ReportExporter` (Exportación en lote manual de artefactos diarios)

## Fricciones Confirmadas (Documentadas en `FRICTIONS.md`)

Las hipótesis del usuario sobre el Oráculo fueron acertadas, ratificando la necesidad urgente de abstraer los siguientes mecanismos en el SDK:

1. **`EventSubscriber`**: El acto de sondear periódicamente el query engine con un `EventPoller` es ineficiente y no semántico. Hace falta un mecanismo pasivo (`onNewPayment`).
2. **`ProjectionStore`**: Escribir y leer manualmente un estado (volumen total y contadores) en formato JSON desde disco vuelve a ser propenso a errores y repetitivo.
3. **`ArtifactIndex`**: Identificar "qué reportes he emitido hoy" requirió cargar todos los archivos JSON del directorio, abrirlos e inspeccionar sus campos internos (`timestamp`), lo cual escala terriblemente.
4. **`EvidenceBatchExporter`**: Empaquetar artefactos individuales en un reporte por lotes tuvo que hacerse manualmente iterando el FS y fabricando un nuevo esquema ad-hoc.
5. **`WebhookDispatcher`**: Notificar a entidades externas del export o de la detección de un pago grande exige infraestructura boilerplate (reintentos, log, etc.).

Al permitir que estas necesidades surgieran orgánicamente de la aplicación, el "SDK de infraestructura HardKAS" está ahora completamente respaldado por fricciones reales de consumo.
