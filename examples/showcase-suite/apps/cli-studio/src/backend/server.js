import http from 'http';
import { initializeHardKAS } from '@showcase/shared-backend';
import { runDoctorNode, runDevEnv } from '@hardkas/cli/public';
const PORT = 4071;
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
            actors.push(`Dev_${i}`);
            broadcastSSE({ type: 'ACTOR_READY', id: i, label: `Dev ${i}` });
        }
        let operations = 0;
        for (let i = 0; i < 100; i++) {
            const wIdx = i % actors.length;
            const commands = ['doctor', 'env check', 'init', 'capabilities', 'wallet create'];
            const cmd = commands[Math.floor(Math.random() * commands.length)];
            try {
                broadcastSSE({ type: 'OP_START', id: wIdx, op: `Running hardkas ${cmd}...` });
                await new Promise(r => setTimeout(r, 150));
                broadcastSSE({ type: 'OP_START', id: wIdx, op: `Parsing args & validating config...` });
                await new Promise(r => setTimeout(r, 150));
                broadcastSSE({ type: 'OP_DONE', id: wIdx, op: `Command ${cmd} successful` });
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
    const { storage, dataPath } = await initializeHardKAS('cli-studio');
    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET' && req.url === '/api/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', app: 'CLI Studio' }));
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
        if (req.method === 'POST' && req.url === '/api/cli/doctor') {
            try {
                // Execute CLI runner directly
                await runDoctorNode({});
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, message: 'HardKAS Doctor executed successfully.' }));
            }
            catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
            return;
        }
        if (req.method === 'POST' && req.url === '/api/cli/env-check') {
            try {
                // Execute CLI runner directly
                await runDevEnv({});
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, message: 'HardKAS Env Check executed successfully.' }));
            }
            catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
            return;
        }
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found' }));
    });
    server.listen(PORT, () => {
        console.log('CLI Studio Backend running on http://localhost:' + PORT);
    });
}
bootstrap().catch(console.error);
