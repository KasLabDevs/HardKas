import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

export class Rng {
    private seed: number;
    constructor(seed: number) {
        this.seed = seed;
    }
    
    public next(): number {
        // Mulberry32 simple PRNG
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

export interface FaultProxyOptions {
    targetUrl: string;
    listenPort: number;
    seed: number;
}

export class FaultProxy {
    private server?: WebSocketServer;
    private options: FaultProxyOptions;
    public rng: Rng;
    
    public config = {
        dropProbability: 0,
        corruptProbability: 0,
        slowlorisDelayMs: 0,
        killConnections: false
    };

    public metrics = {
        corruptFramesInjected: 0,
        droppedFramesInjected: 0,
        connectionsKilled: 0
    };

    private clients: Set<WebSocket> = new Set();

    constructor(options: FaultProxyOptions) {
        this.options = options;
        this.rng = new Rng(options.seed);
    }

    public async start(): Promise<void> {
        return new Promise((resolve) => {
            this.server = new WebSocketServer({ port: this.options.listenPort }, () => {
                resolve();
            });

            this.server.on('connection', (ws) => {
                this.clients.add(ws);

                if (this.config.killConnections) {
                    this.metrics.connectionsKilled++;
                    ws.close();
                    return;
                }

                // Proxy to real node (For simplicity, if we don't have a real node, we can mock responses)
                // For Chaos tests, we can just intercept the RPC request and return a mocked response,
                // OR we can actually connect to `targetUrl`.
                // Given this is a local simnet replacement if Docker isn't running, we will mock the minimum Kaspa responses.
                // If the user wants a transparent proxy to Docker, we would use a client WebSocket here.
                
                ws.on('message', async (data) => {
                    const msg = data.toString();
                    
                    if (this.config.killConnections) {
                        this.metrics.connectionsKilled++;
                        ws.close();
                        return;
                    }

                    if (this.rng.next() < this.config.dropProbability) {
                        this.metrics.droppedFramesInjected++;
                        return; // drop silently (triggers timeout on client)
                    }

                    if (this.config.slowlorisDelayMs > 0) {
                        await new Promise(r => setTimeout(r, this.config.slowlorisDelayMs));
                    }

                    let response = "";
                    try {
                        const parsed = JSON.parse(msg);
                        // Mocking valid Kaspa rpc responses for balance and utxos
                        if (parsed.method === "getBalanceByAddress") {
                            response = JSON.stringify({ id: parsed.id, result: { balance: 1000000000 } });
                        } else if (parsed.method === "getUtxosByAddresses") {
                            response = JSON.stringify({ id: parsed.id, result: { entries: [] } });
                        } else {
                            response = JSON.stringify({ id: parsed.id, result: {} });
                        }
                    } catch (e) {
                        response = JSON.stringify({ error: "parse error" });
                    }

                    if (this.rng.next() < this.config.corruptProbability) {
                        this.metrics.corruptFramesInjected++;
                        response = `{ "error": "{" }`; // corrupt JSON
                    }

                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(response);
                    }
                });

                ws.on('close', () => {
                    this.clients.delete(ws);
                });
            });
        });
    }

    public async killAll(): Promise<void> {
        for (const ws of this.clients) {
            ws.close();
            this.metrics.connectionsKilled++;
        }
    }

    public async stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => resolve());
            } else {
                resolve();
            }
        });
    }
}
