import { describe, it, expect } from 'vitest';
import { createDevServer } from '@hardkas/dev-server';

describe('Dev-Server Coverage Expansion', () => {
    const { app, token } = createDevServer({
        host: '127.0.0.1',
        port: 9999,
        unsafeNoAuth: false
    });

    const headers = {
        'Authorization': `Bearer ${token}`,
        'X-Hardkas-Request': 'true',
        'Host': '127.0.0.1:9999'
    };

    it('should hit health endpoint', async () => {
        const res = await app.request('http://127.0.0.1:9999/api/health', {
            method: 'GET',
            headers
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toBeDefined();
    });

    it('should hit observability endpoints', async () => {
        const res = await app.request('http://127.0.0.1:9999/api/observability/metrics', {
            method: 'GET',
            headers
        });
        expect(res.status).toBe(200);
    });

    it('should reject without auth', async () => {
        const res = await app.request('http://127.0.0.1:9999/api/health', {
            method: 'GET',
            headers: { 'Host': '127.0.0.1:9999' }
        });
        expect(res.status).toBe(401);
    });
});
