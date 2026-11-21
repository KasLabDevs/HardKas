import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArtifactIndexStoreJson } from '../src/artifact-index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

describe('ArtifactIndexStoreJson', () => {
    let testFilePath: string;

    beforeEach(() => {
        testFilePath = path.join(process.cwd(), `test-index-${randomUUID()}.json`);
    });

    afterEach(() => {
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    });

    it('should index and retrieve artifacts', () => {
        const store = new ArtifactIndexStoreJson({ filePath: testFilePath });
        
        store.index({
            hash: "hash123",
            schema: "oracle-report.v1",
            timestamp: "2026-06-01T10:00:00Z",
            filePath: "/dummy/path.json",
            tags: ["payment", "large"]
        });

        const entry = store.get("hash123");
        expect(entry).toBeDefined();
        expect(entry?.schema).toBe("oracle-report.v1");
        
        const list = store.list();
        expect(list.length).toBe(1);
    });

    it('should find artifacts by schema and date', () => {
        const store = new ArtifactIndexStoreJson({ filePath: testFilePath });
        
        store.index({ hash: "h1", schema: "A", timestamp: "2026-06-01T10:00:00Z", filePath: "" });
        store.index({ hash: "h2", schema: "A", timestamp: "2026-06-02T10:00:00Z", filePath: "" });
        store.index({ hash: "h3", schema: "B", timestamp: "2026-06-03T10:00:00Z", filePath: "" });

        const schemaA = store.find({ schema: "A" });
        expect(schemaA.length).toBe(2);

        const afterJune2 = store.find({ from: "2026-06-02T00:00:00Z" });
        expect(afterJune2.length).toBe(2);
        
        const strictMatch = store.find({ schema: "A", to: "2026-06-01T23:59:59Z" });
        expect(strictMatch.length).toBe(1);
        expect(strictMatch[0].hash).toBe("h1");
    });
});
