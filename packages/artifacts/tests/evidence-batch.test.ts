import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArtifactIndexStoreJson } from '../src/artifact-index.js';
import { EvidenceBatchExporter } from '../src/evidence-batch.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

describe('EvidenceBatchExporter', () => {
    let testIndexFilePath: string;
    let testExportDir: string;
    let store: ArtifactIndexStoreJson;
    let exporter: EvidenceBatchExporter;

    beforeEach(() => {
        const uuid = randomUUID();
        testIndexFilePath = path.join(process.cwd(), `test-index-${uuid}.json`);
        testExportDir = path.join(process.cwd(), `test-exports-${uuid}`);
        
        store = new ArtifactIndexStoreJson({ filePath: testIndexFilePath });
        exporter = new EvidenceBatchExporter(store);

        store.index({ hash: "h1", schema: "oracle-report", timestamp: "2026-06-01T10:00:00Z", filePath: "dummy.json" });
        store.index({ hash: "h2", schema: "oracle-report", timestamp: "2026-06-02T10:00:00Z", filePath: "dummy2.json" });
    });

    afterEach(() => {
        if (fs.existsSync(testIndexFilePath)) fs.unlinkSync(testIndexFilePath);
        if (fs.existsSync(testExportDir)) fs.rmSync(testExportDir, { recursive: true, force: true });
    });

    it('should export all from index schema', () => {
        const exportPath = exporter.exportFromIndex({
            schema: "oracle-report",
            name: "daily-oracle-export",
            exportDir: testExportDir
        });

        expect(fs.existsSync(exportPath)).toBe(true);
        const data = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
        expect(data.schema).toBe("evidence-batch.v1");
        expect(data.artifacts.length).toBe(2);
        expect(data.name).toBe("daily-oracle-export");
    });
});
