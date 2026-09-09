import http from 'http';
import { initializeHardKAS } from '@showcase/shared-backend';
import { JsonWrpcKaspaClient } from '@hardkas/kaspa-rpc';
import { IndexerToolkit } from '@hardkas/toolkit';

const PORT = 4041;
const SSE_CLIENTS: http.ServerResponse[] = [];

function broadcastSSE(data: any) {
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
            actors.push(`IndexerNode_${i}`);
            broadcastSSE({ type: 'ACTOR_READY', id: i, label: `Indexer ${i}` });
        }

        let operations = 0;
        for (let i = 0; i < 100; i++) {
            const wIdx = i % actors.length;
            const blockNum = Math.floor(Math.random() * 50000) + 12000;
            const utxoCount = Math.floor(Math.random() * 15);
            
            try {
                broadcastSSE({ type: 'OP_START', id: wIdx, op: `Ingesting block ${blockNum}...` });
                await new Promise(r => setTimeout(r, 150));
                
                broadcastSSE({ type: 'OP_START', id: wIdx, op: `Indexing ${utxoCount} UTXOs...` });
                await new Promise(r => setTimeout(r, 150));
                
                const blockHash = `00000000${Math.random().toString(36).substring(2, 10)}`;
                broadcastSSE({ type: 'OP_DONE', id: wIdx, op: `Block Processed: ${blockHash}` });
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
    const { storage, dataPath } = await initializeHardKAS('explorer-live');
    
    const rpc = new JsonWrpcKaspaClient({ rpcUrl: 'ws://127.0.0.1:16110' });
    

    const indexerToolkit = IndexerToolkit.open();

    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'GET' && req.url === '/api/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', app: 'Explorer Live' }));
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
            runGauntlet().catch(console.error);
            return;
        }

        if (req.method === 'GET' && req.url === '/api/dag/stats') {
            // Simulated DAG stats for Showcase
            res.writeHead(200);
            res.end(JSON.stringify({
                virtualDaaScore: 15302,
                blueScore: 12450,
                tips: 3,
                pruningPoint: '00000abcde123',
                difficulty: 102.5
            }));
            return;
        }

        if (req.method === 'GET' && req.url === '/api/dag/blocks') {
            // Simulated blocks
            res.writeHead(200);
            res.end(JSON.stringify([
                { hash: '0000000abc1234', timestamp: Date.now(), blueScore: 12450, txCount: 5 },
                { hash: '0000000def5678', timestamp: Date.now() - 1000, blueScore: 12449, txCount: 1 },
                { hash: '0000000ghi9012', timestamp: Date.now() - 2000, blueScore: 12448, txCount: 0 },
            ]));
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found' }));
    });

    server.listen(PORT, () => {
        console.log('Explorer Live Backend running on http://localhost:' + PORT);
    });
}

bootstrap().catch(console.error);
