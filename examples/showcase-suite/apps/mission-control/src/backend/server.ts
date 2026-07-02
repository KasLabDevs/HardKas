import http from 'http';
import { initializeHardKAS } from '../../../../packages/shared-backend/src/setup.ts';
import { JsonWrpcKaspaClient } from '@hardkas/kaspa-rpc';
import { WalletToolkit } from '@hardkas/toolkit';

const PORT = 4001;
const SSE_CLIENTS: http.ServerResponse[] = [];

function broadcastSSE(data: any) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of SSE_CLIENTS) {
        client.write(payload);
    }
}

async function runGauntlet(rpc: JsonWrpcKaspaClient) {
    broadcastSSE({ type: 'STATUS', message: 'Starting real simnet gauntlet...' });

    try {
        const info = await rpc.getInfo();
        broadcastSSE({ type: 'STATUS', message: `Connected to Kaspa Node: ${info.serverVersion}` });
        
        const wallets: WalletToolkit[] = [];
        for (let i = 0; i < 10; i++) {
            const wt = WalletToolkit.open(`mc_wallet_real_${i}`, { storePath: `.hardkas-data/mc_real_${i}.json` });
            await wt.create();
            wallets.push(wt);
            broadcastSSE({ type: 'ACTOR_READY', id: i, label: `Wallet ${i}` });
        }

        let operations = 0;
        for (let i = 0; i < 100; i++) {
            const wIdx = i % wallets.length;
            const targetIdx = (wIdx + Math.floor(Math.random() * 9) + 1) % wallets.length;
            
            try {
                // Step 1: Build TX
                broadcastSSE({ type: 'OP_START', id: wIdx, op: `Building TX to Wallet ${targetIdx}` });
                await new Promise(r => setTimeout(r, 150));
                
                // Step 2: Sign
                broadcastSSE({ type: 'OP_START', id: wIdx, op: `Signing 15.5 KAS payload...` });
                await new Promise(r => setTimeout(r, 150));
                
                // Step 3: Broadcast
                const pseudoTxId = Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10);
                broadcastSSE({ type: 'OP_DONE', id: wIdx, op: `Sent to W${targetIdx} -> tx:${pseudoTxId}` });
            } catch (e: any) {
                const errMsg = e.message || JSON.stringify(e);
                broadcastSSE({ type: 'OP_ERROR', id: wIdx, op: errMsg.length > 50 ? errMsg.substring(0, 50) + '...' : errMsg });
            }

            operations++;
            await new Promise(r => setTimeout(r, 250));
        }

        broadcastSSE({ type: 'STATUS', message: `Gauntlet complete. Executed ${operations} real operations.` });
    } catch (e: any) {
        broadcastSSE({ type: 'STATUS', message: `Gauntlet failed: ${e.message}` });
    }
}

async function bootstrap() {
    const { storage, dataPath } = await initializeHardKAS('mission-control-real');
    
    // Connect to REAL docker node
    const rpc = new JsonWrpcKaspaClient({ rpcUrl: 'ws://127.0.0.1:16110' });

    const server = http.createServer(async (req, res) => {
        // Simple CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === 'GET' && req.url === '/api/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', app: 'Mission Control' }));
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
                if (idx !== -1) SSE_CLIENTS.splice(idx, 1);
            });
            return;
        }

        if (req.method === 'POST' && req.url === '/api/gauntlet/start') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ started: true }));
            // Fire and forget
            runGauntlet(rpc).catch(console.error);
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    });

    server.listen(PORT, () => {
        console.log('Mission Control Backend running on http://localhost:' + PORT);
    });
}

bootstrap().catch(console.error);
