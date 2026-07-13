import express from 'express';
import cors from 'cors';
import { DockerKaspadRunner } from '@hardkas/node-runner';
import { JsonWrpcKaspaClient } from '@hardkas/kaspa-rpc';

const app = express();
const port = 4016; // Using 4016 so backend and frontend don't collide

app.use(cors());
app.use(express.json());

// Initialize HardKAS tools
const orchestrator = new DockerKaspadRunner();
let rpcClient: JsonWrpcKaspaClient | null = null;

async function getRpcClient() {
  if (!rpcClient) {
    rpcClient = new JsonWrpcKaspaClient({
      rpcUrl: 'ws://127.0.0.1:18210'
    });
  }
  return rpcClient;
}

app.get('/api/status', async (_req, res) => {
  try {
    const status = await orchestrator.status();
    let blueScore = 0;
    
    // Attempt to get the blue score if it's running
    if (status.running) {
      try {
        const client = await getRpcClient();
        const info = await client.getInfo();
        if (info.virtualDaaScore) {
          blueScore = Number(info.virtualDaaScore);
        }
      } catch (e) {
        // RPC might not be ready yet even if container is running
      }
    }
    
    res.json({
      isRunning: status.running,
      containerId: status.containerName || null,
      blueScore
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/start', async (_req, res) => {
  try {
    await orchestrator.start();
    // Pre-warm the RPC client
    setTimeout(() => { getRpcClient().catch(() => {}) }, 2000);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stop', async (_req, res) => {
  try {
    await orchestrator.stop();
    if (rpcClient) {
      await rpcClient.close();
      rpcClient = null;
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mine', async (req, res) => {
  try {
    const { blocks = 1 } = req.body;
    // @hardkas/node-runner doesn't expose a mine function natively, we simulate success for demo
    // Alternatively we could run a docker run command using kaspa-miner
    res.json({ success: true, blocks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/faucet', async (req, res) => {
  try {
    const { address, amount } = req.body;
    if (!address || !amount) {
      return res.status(400).json({ error: 'Address and amount are required' });
    }
    res.json({ success: true, txId: 'mock-tx-id-for-' + address });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Localnet Studio Backend running on http://localhost:${port}`);
});
