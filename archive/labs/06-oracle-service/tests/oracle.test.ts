import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildOracleServer } from '../src/server.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Oracle Service', () => {
    let server: any;
    const testDataDir = path.join(process.cwd(), '.oracle-data');

    beforeEach(async () => {
        // Limpiar para test
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true, force: true });
        }
        server = await buildOracleServer();
    });

    afterEach(async () => {
        await server.close();
    });

    it('should return health', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/health'
        });
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload).status).toBe('ok');
    });

    it('should start with zero stats', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/stats'
        });
        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        expect(data.eventsProcessed).toBe(0);
        expect(data.totalVolumeSompi).toBe("0");
    });

    it('should perform a manual poll (which might find 0 depending on query engine mock)', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/poll'
        });
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload).success).toBe(true);
    });

    it('should generate an export batch (empty or not)', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/export'
        });
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.payload).success).toBe(true);
        expect(JSON.parse(response.payload).batchPath).toContain('batch-export-');
    });
});
