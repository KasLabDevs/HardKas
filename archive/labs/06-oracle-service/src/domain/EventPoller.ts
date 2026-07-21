import { OracleStore } from './OracleStore.js';
import { WalletQuery } from '@hardkas/query';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PollerConfig {
    watchedAddresses: string[];
    queryEngine: WalletQuery;
    store: OracleStore;
    artifactsDir: string;
}

/**
 * Fricción Esperada: EventSubscriber
 * Un loop de polling sobre query engine que deberíamos poder sustituir por 
 * algo como `hk.events.on("payment", handler)` en la V1.
 */
export class EventPoller {
    private config: PollerConfig;
    private lastSeenUtxos: Set<string>;

    constructor(config: PollerConfig) {
        this.config = config;
        this.lastSeenUtxos = new Set();
        
        if (!fs.existsSync(config.artifactsDir)) {
            fs.mkdirSync(config.artifactsDir, { recursive: true });
        }
    }

    private emitArtifact(type: string, data: any) {
        const artifactId = randomUUID();
        const artifactPath = path.join(this.config.artifactsDir, `${type}-${artifactId}.json`);
        
        const payload = {
            schema: "oracle-report.v1",
            type,
            timestamp: new Date().toISOString(),
            ...data
        };

        fs.writeFileSync(artifactPath, JSON.stringify(payload, null, 2));
        this.config.store.registerArtifact(artifactPath);
    }

    public async poll(): Promise<number> {
        if (this.config.watchedAddresses.length === 0) return 0;

        const result = await this.config.queryEngine.getUtxos(this.config.watchedAddresses);
        if (!result.ok) {
            console.error(`EventPoller error: ${result.status}`);
            return 0;
        }

        let newEventsCount = 0;

        for (const [address, utxos] of Object.entries(result.utxos)) {
            for (const utxo of utxos) {
                const utxoId = `${utxo.transactionId}:${utxo.outputIndex}`;
                
                if (!this.lastSeenUtxos.has(utxoId)) {
                    // Nuevo evento detectado!
                    this.lastSeenUtxos.add(utxoId);
                    this.config.store.trackVolume(utxo.amountSompi);
                    
                    this.emitArtifact("new_payment_detected", {
                        address,
                        transactionId: utxo.transactionId,
                        amountSompi: utxo.amountSompi.toString()
                    });

                    // Si es grande (>1000 KAS) = > 100_000_000_000n
                    if (utxo.amountSompi > 100_000_000_000n) {
                        this.emitArtifact("large_payment_detected", {
                            address,
                            transactionId: utxo.transactionId,
                            amountSompi: utxo.amountSompi.toString()
                        });
                    }

                    newEventsCount++;
                }
            }
        }

        return newEventsCount;
    }
}
