import { OracleStore } from './OracleStore.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Fricción Esperada: EvidenceBatchExporter
 * El Oracle debe leer los artifacts de hoy de disco y exportarlos. 
 * Sin una API oficial, es un for readdir sync.
 */
export class ReportExporter {
    private store: OracleStore;
    private exportDir: string;

    constructor(store: OracleStore, exportDir: string) {
        this.store = store;
        this.exportDir = exportDir;
        
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }
    }

    public exportDailySnapshot(): string {
        const state = this.store.load();
        
        // Fricción: iterar sobre un índice manual de artefactos guardado en JSON.
        const todayArtifacts = state.artifacts.filter(p => {
            try {
                const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
                const date = new Date(data.timestamp);
                const today = new Date();
                return date.toDateString() === today.toDateString();
            } catch {
                return false;
            }
        });

        const batchId = randomUUID();
        const exportPath = path.join(this.exportDir, `batch-export-${batchId}.json`);

        const payload = {
            schema: "evidence-batch.v1",
            batchId,
            exportedAt: new Date().toISOString(),
            statsSnapshot: {
                totalVolumeSompi: state.stats.totalVolumeSompi.toString(),
                eventsProcessed: state.stats.eventsProcessed
            },
            artifactsIncluded: todayArtifacts.length
        };

        // Emitimos snapshot
        fs.writeFileSync(exportPath, JSON.stringify(payload, null, 2));

        // Además, WebhookDispatcher friction: tendríamos que hacer un POST a algún lado manualmente.
        console.log(`[Webhook Simulation] POST /external-oracle-aggregator -> ${exportPath}`);

        return exportPath;
    }
}
