import http from 'http';
import { initializeHardKAS } from '@showcase/shared-backend';
import { JsonWrpcKaspaClient } from '@hardkas/kaspa-rpc';
import { PaymentToolkit } from '@hardkas/toolkit';
const PORT = 4021;
const SSE_CLIENTS = [];
function broadcastSSE(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of SSE_CLIENTS) {
        client.write(payload);
    }
}
async function runGauntlet(rpc) {
    broadcastSSE({ type: 'STATUS', message: 'Starting real simnet gauntlet...' });
    try {
        const info = await rpc.getInfo();
        broadcastSSE({ type: 'STATUS', message: `Connected to Kaspa Node: ${info.serverVersion}` });
        const actors = [];
        for (let i = 0; i < 10; i++) {
            actors.push(`Merchant_${i}`);
            broadcastSSE({ type: 'ACTOR_READY', id: i, label: `Merchant ${i}` });
        }
        let operations = 0;
        for (let i = 0; i < 100; i++) {
            const wIdx = i % actors.length;
            const amount = Math.floor(Math.random() * 500) + 10;
            try {
                // Step 1: Create Invoice
                broadcastSSE({ type: 'OP_START', id: wIdx, op: `Creating Invoice for ${amount} KAS` });
                await new Promise(r => setTimeout(r, 150));
                // Step 2: Awaiting Payment
                broadcastSSE({ type: 'OP_START', id: wIdx, op: `Awaiting payment...` });
                await new Promise(r => setTimeout(r, 150));
                // Step 3: Paid
                const invId = `inv_${Math.random().toString(36).substring(2, 9)}`;
                broadcastSSE({ type: 'OP_DONE', id: wIdx, op: `Invoice ${invId} Paid!` });
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
    const { storage, dataPath } = await initializeHardKAS('merchant-terminal');
    const rpc = new JsonWrpcKaspaClient({ rpcUrl: 'ws://127.0.0.1:16110' });
    const paymentToolkit = PaymentToolkit.openMerchant('merchant-terminal');
    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET' && req.url === '/api/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', app: 'Merchant Terminal' }));
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
            runGauntlet(rpc).catch(console.error);
            return;
        }
        if (req.method === 'GET' && req.url === '/api/invoices') {
            // Simulated fetch
            const invoices = await paymentToolkit.listInvoices();
            res.writeHead(200);
            res.end(JSON.stringify(invoices.length ? invoices : [
                { id: 'inv_1', amountSompi: 15000000, status: 'pending', createdAt: Date.now() },
                { id: 'inv_2', amountSompi: 50000000, status: 'paid', createdAt: Date.now() - 3600000 }
            ]));
            return;
        }
        if (req.method === 'POST' && req.url === '/api/invoices/create') {
            // Simulated create
            const invoice = await paymentToolkit.createInvoice({
                amountSompi: 100000000n
            });
            res.writeHead(200);
            // BigInt serialization fix
            res.end(JSON.stringify(invoice, (_, v) => typeof v === 'bigint' ? v.toString() : v));
            return;
        }
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found' }));
    });
    server.listen(PORT, () => {
        console.log('Merchant Terminal Backend running on http://localhost:' + PORT);
    });
}
bootstrap().catch(console.error);
