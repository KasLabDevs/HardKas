import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/api/server.js';

describe('Lab 09 - Toolkit Rebuild', () => {
    it('should build and initialize server using toolkits', async () => {
        const server = await buildServer();
        expect(server).toBeDefined();
        await server.close();
    });
});
