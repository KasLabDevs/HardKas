import * as fs from 'node:fs';
import * as path from 'node:path';

export interface OracleStats {
    totalVolumeSompi: bigint;
    eventsProcessed: number;
    lastPolledAt: string;
}

export interface OracleStoreState {
    stats: OracleStats;
    artifacts: string[]; // List of generated artifact hashes/paths
}

/**
 * Fricción Esperada: ProjectionStore / ArtifactIndex
 * Guardar proyecciones manualmente en JSON e indexar hashes de los artifacts.
 */
export class OracleStore {
    private readonly filePath: string;
    
    constructor(filePath?: string) {
        this.filePath = filePath || path.join(process.cwd(), '.oracle-state.json');
        this.ensureDir();
    }

    private ensureDir() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    public load(): OracleStoreState {
        if (!fs.existsSync(this.filePath)) {
            return {
                stats: { totalVolumeSompi: 0n, eventsProcessed: 0, lastPolledAt: new Date(0).toISOString() },
                artifacts: []
            };
        }
        
        try {
            const raw = fs.readFileSync(this.filePath, 'utf-8');
            const data = JSON.parse(raw);
            return {
                stats: {
                    totalVolumeSompi: BigInt(data.stats.totalVolumeSompi || '0'),
                    eventsProcessed: data.stats.eventsProcessed || 0,
                    lastPolledAt: data.stats.lastPolledAt || new Date(0).toISOString()
                },
                artifacts: data.artifacts || []
            };
        } catch {
            return {
                stats: { totalVolumeSompi: 0n, eventsProcessed: 0, lastPolledAt: new Date(0).toISOString() },
                artifacts: []
            };
        }
    }

    public save(state: OracleStoreState): void {
        const payload = {
            stats: {
                totalVolumeSompi: state.stats.totalVolumeSompi.toString(),
                eventsProcessed: state.stats.eventsProcessed,
                lastPolledAt: state.stats.lastPolledAt
            },
            artifacts: state.artifacts
        };
        fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    }

    public trackVolume(amountSompi: bigint): void {
        const state = this.load();
        state.stats.totalVolumeSompi += amountSompi;
        state.stats.eventsProcessed += 1;
        state.stats.lastPolledAt = new Date().toISOString();
        this.save(state);
    }

    public registerArtifact(artifactPath: string): void {
        const state = this.load();
        if (!state.artifacts.includes(artifactPath)) {
            state.artifacts.push(artifactPath);
            this.save(state);
        }
    }
}
