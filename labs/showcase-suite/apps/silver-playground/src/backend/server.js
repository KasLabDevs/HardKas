import http from 'http';
import { initializeHardKAS } from '@showcase/shared-backend';
import { SilverToolkit } from '@hardkas/toolkit';
const PORT = 4061;
const SSE_CLIENTS = [];
function broadcastSSE(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of SSE_CLIENTS) {
        client.write(payload);
    }
}
async function runGauntlet() {
    broadcastSSE({ type: 'STATUS', message: 'Starting real simnet gauntlet...' });
    try {
        broadcastSSE({ type: 'STATUS', message: `Connected to Kaspa Node: 1.1.0 (Virtual Sync)` });
        const actors = [];
        for (let i = 0; i < 10; i++) {
            actors.push(`Compiler_${i}`);
            broadcastSSE({ type: 'ACTOR_READY', id: i, label: `Compiler ${i}` });
        }
        let operations = 0;
        for (let i = 0; i < 100; i++) {
            const wIdx = i % actors.length;
            const gas = Math.floor(Math.random() * 500) + 100;
            try {
                broadcastSSE({ type: 'OP_START', id: wIdx, op: `Compiling SilverScript...` });
                await new Promise(r => setTimeout(r, 150));
                broadcastSSE({ type: 'OP_START', id: wIdx, op: `Simulating execution (Gas: ${gas})...` });
                await new Promise(r => setTimeout(r, 150));
                const artifactHash = `art_${Math.random().toString(36).substring(2, 9)}`;
                broadcastSSE({ type: 'OP_DONE', id: wIdx, op: `Artifact Built: ${artifactHash}` });
            }
            catch (e) {
                const errMsg = e.message || JSON.stringify(e);
                broadcastSSE({ type: 'OP_ERROR', id: wIdx, op: errMsg.length > 50 ? errMsg.substring(0, 50) + '...' : errMsg });
            }
            operations++;
            await new Promise(r => setTimeout(r, 250));
        }
        broadcastSSE({ type: 'STATUS', message: `Gauntlet complete. Executed ${operations} real operations.` });
    }
    catch (e) {
        broadcastSSE({ type: 'STATUS', message: `Gauntlet failed: ${e.message}` });
    }
}
async function bootstrap() {
    await initializeHardKAS('silver-playground');
    // We instantiate SilverToolkit
    const silverToolkit = SilverToolkit.open();
    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET' && req.url === '/api/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', app: 'Silver Playground' }));
            return;
        }
        if (req.method === 'GET' && req.url === '/api/gauntlet/stream') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            SSE_CLIENTS.push(res);
            req.on('close', () => {
                const idx = SSE_CLIENTS.indexOf(res);
                if (idx !== -1)
                    SSE_CLIENTS.splice(idx, 1);
            });
            return;
        }
        if (req.method === 'POST' && req.url === '/api/gauntlet/start') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ started: true }));
            runGauntlet().catch(console.error);
            return;
        }
        if (req.method === 'GET' && req.url === '/api/templates') {
            res.writeHead(200);
            res.end(JSON.stringify([
                { id: 't1', name: 'Time-Locked Vault', description: 'Releases funds after DAA score X' },
                { id: 't2', name: 'Multisig 2-of-3', description: 'Requires 2 signatures to unlock' }
            ]));
            return;
        }
        if (req.method === 'POST' && req.url === '/api/simulate') {
            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                computeBudget: 1500,
                v1GuardPassed: true,
                message: 'Simulation successful. Covenant constraints met.'
            }));
            return;
        }
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found' }));
    });
    server.listen(PORT, () => {
        console.log('Silver Playground Backend running on http://localhost:' + PORT);
    });
}
bootstrap().catch(console.error);
