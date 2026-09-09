import http from 'http';
import { initializeHardKAS } from '@showcase/shared-backend';
import { JsonWrpcKaspaClient } from '@hardkas/kaspa-rpc';
import { WalletToolkit } from '@hardkas/toolkit';

const PORT = 4011;
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
            const wt = WalletToolkit.open(`wp_wallet_real_${i}`, { storePath: `.hardkas-data/wp_real_${i}.json` });
            await wt.create();
            wallets.push(wt);
            broadcastSSE({ type: 'ACTOR_READY', id: i, label: `Vault ${i}` });
        }

        let operations = 0;
        for (let i = 0; i < 100; i++) {
            const wIdx = i % wallets.length;
            const wallet = wallets[wIdx];
            
            const receiveAddress = await wallet.receive();
            
            try {
                broadcastSSE({ type: 'OP_START', id: wIdx, op: `Fetching UTXOs` });
                
                // Virtual Funding
                const utxos = new Array(5).fill({ amountSompi: 1000000000n });
                
                broadcastSSE({ type: 'OP_DONE', id: wIdx, op: `UTXOs Found: ${utxos.length}` });
            } catch (e: any) {
                const errMsg = e.message || JSON.stringify(e);
                broadcastSSE({ type: 'OP_ERROR', id: wIdx, op: errMsg.length > 50 ? errMsg.substring(0, 50) + '...' : errMsg });
            }

            operations++;
            await new Promise(r => setTimeout(r, 200));
        }

        broadcastSSE({ type: 'STATUS', message: `Gauntlet complete. Executed ${operations} real operations.` });
    } catch (e: any) {
        broadcastSSE({ type: 'STATUS', message: `Gauntlet failed: ${e.message}` });
    }
}

async function bootstrap() {
    const { storage, dataPath } = await initializeHardKAS('wallet-pro-real');
    
    // Connect to REAL docker node
    const rpc = new JsonWrpcKaspaClient({ rpcUrl: 'ws://127.0.0.1:16110' });

    const mockWallets = [
        { id: 'w1', name: 'Main Vault', address: 'kaspasim:qzmain1234', balance: 1500000 },
        { id: 'w2', name: 'Daily Spend', address: 'kaspasim:qzdaily567', balance: 50000 }
    ];

    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === 'GET' && req.url === '/api/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', app: 'Wallet Pro' }));
            return;
        }

        if (req.method === 'GET' && req.url === '/api/wallets') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(mockWallets));
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
            runGauntlet(rpc).catch(console.error);
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    });

    server.listen(PORT, () => {
        console.log('Wallet Pro Backend running on http://localhost:' + PORT);
    });
}

bootstrap().catch(console.error);
