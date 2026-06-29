import { ArtifactIndexStoreJson, ArtifactEntry } from './artifact-index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface EvidenceBatchExportOptions {
    artifacts: ArtifactEntry[];
    name: string;
    claims?: Record<string, any> | undefined;
    exportDir?: string | undefined;
}

export interface EvidenceBatchExportFromIndexOptions {
    schema: string;
    name: string;
    from?: string | undefined;
    to?: string | undefined;
    claims?: Record<string, any> | undefined;
    exportDir?: string | undefined;
}

/**
 * Groups multiple local artifacts into a single export batch for external consumption.
 * Does not replace the EvidencePackage concept, just facilitates its grouping.
 */
export class EvidenceBatchExporter {
    private readonly indexStore: ArtifactIndexStoreJson;

    constructor(indexStore: ArtifactIndexStoreJson) {
        this.indexStore = indexStore;
    }

    public export(options: EvidenceBatchExportOptions): string {
        const outDir = options.exportDir || path.join(process.cwd(), '.hardkas', 'exports');
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        const batchId = randomUUID();
        const exportPath = path.join(outDir, `batch-${options.name}-${batchId}.json`);

        const payload = {
            schema: "evidence-batch.v1",
            batchId,
            name: options.name,
            exportedAt: new Date().toISOString(),
            claims: options.claims || {},
            artifacts: options.artifacts
        };

        fs.writeFileSync(exportPath, JSON.stringify(payload, null, 2), 'utf-8');
        return exportPath;
    }

    public exportFromIndex(options: EvidenceBatchExportFromIndexOptions): string {
        const artifacts = this.indexStore.find({
            schema: options.schema,
            from: options.from,
            to: options.to
        });

        return this.export({
            artifacts,
            name: options.name,
            claims: options.claims,
            exportDir: options.exportDir
        });
    }
}
