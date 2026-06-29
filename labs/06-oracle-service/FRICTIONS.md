# Fricciones Documentadas — Lab 06 (Oracle Service)

1. **`EventSubscriber`**: El polling es ineficiente y doloroso. Debería existir un mecanismo en HardKAS que abstraiga: `onNewPayment`, `onNewBlock`.
2. **`ProjectionStore`**: Mantener contadores como volumen diario en memoria o JSON puro resulta propenso a errores. Se necesita un proyector confiable local.
3. **`ArtifactIndex`**: Imposible saber qué reportes se emitieron en el pasado sin un índice persistente dedicado.
4. **`EvidenceBatchExporter`**: Empaquetar y despachar artifacts diariamente se hace completamente a mano iterando directorios de archivos.
5. **`WebhookDispatcher`**: Notificar a otros sistemas de un pago o reporte grande es otro dolor que debería abstraerse.
