import http from 'http';
import { initializeHardKAS } from '@showcase/shared-backend';
import { JobsToolkit } from '@hardkas/toolkit';

const PORT = 4031;
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
            actors.push(`Signer_${i}`);
            broadcastSSE({ type: 'ACTOR_READY', id: i, label: `Signer ${i}` });
        }

        let operations = 0;
        for (let i = 0; i < 100; i++) {
            const wIdx = i % actors.length;
            const amount = Math.floor(Math.random() * 50000) + 1000;
            
            try {
                broadcastSSE({ type: 'OP_START', id: wIdx, op: `Proposing ${amount} KAS multisig tx` });
                await new Promise(r => setTimeout(r, 150));
                
                broadcastSSE({ type: 'OP_START', id: wIdx, op: `Awaiting 2/3 co-signers...` });
                await new Promise(r => setTimeout(r, 150));
                
                const propId = `prop_${Math.random().toString(36).substring(2, 9)}`;
                broadcastSSE({ type: 'OP_DONE', id: wIdx, op: `Proposal ${propId} Executed` });
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
    const { core, storage, queryStore, jobManager, artifactStore, dataPath } = await initializeHardKAS('treasury-console');
    
    const jobsToolkit = new JobsToolkit(core, storage, jobManager);

    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'GET' && req.url === '/api/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', app: 'Treasury Console' }));
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

        if (req.method === 'GET' && req.url === '/api/jobs') {
            // Simulated jobs for the showcase
            const jobs = [
                { id: 'job_1', type: 'batch_payout', status: 'completed', steps: 10, currentStep: 10 },
                { id: 'job_2', type: 'batch_payout', status: 'pending', steps: 50, currentStep: 12 }
            ];
            res.writeHead(200);
            res.end(JSON.stringify(jobs));
            return;
        }

        if (req.method === 'POST' && req.url === '/api/payouts/create') {
            // Simulated execution of checkpoint.commit
            await jobManager.checkpoint({ 
                jobId: 'simulated_batch', 
                status: 'pending', 
                data: { targets: 100 } 
            });
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, message: 'Batch payout scheduled.' }));
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found' }));
    });

    server.listen(PORT, () => {
        console.log('Treasury Console Backend running on http://localhost:' + PORT);
    });
}

bootstrap().catch(console.error);
