import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectionStoreJson } from '../src/projection-store.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

describe('ProjectionStoreJson', () => {
    let testDirPath: string;

    beforeEach(() => {
        testDirPath = path.join(process.cwd(), `test-projections-${randomUUID()}`);
    });

    afterEach(() => {
        if (fs.existsSync(testDirPath)) {
            fs.rmSync(testDirPath, { recursive: true, force: true });
        }
    });

    it('should set and get values', () => {
        const store = new ProjectionStoreJson({ namespace: 'oracle', dirPath: testDirPath });
        store.set('volume', 1500);
        
        const val = store.get<number>('volume');
        expect(val).toBe(1500);
    });

    it('should update values correctly', () => {
        const store = new ProjectionStoreJson({ namespace: 'stats', dirPath: testDirPath });
        
        store.update<number>('counter', (prev) => (prev || 0) + 1);
        expect(store.get('counter')).toBe(1);

        store.update<number>('counter', (prev) => (prev || 0) + 1);
        expect(store.get('counter')).toBe(2);
    });

    it('should retrieve a full snapshot', () => {
        const store = new ProjectionStoreJson({ namespace: 'full', dirPath: testDirPath });
        store.set('a', 1);
        store.set('b', 2);
        
        const snap = store.snapshot();
        expect(snap.a).toBe(1);
        expect(snap.b).toBe(2);
    });
});
