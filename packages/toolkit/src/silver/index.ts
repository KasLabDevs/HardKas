import { SILVER_TEMPLATES } from './templates.js';
import { SilverArtifact, SilverBuildResult, SilverClaims, SilverEvidence, SilverSimulationResult } from './types.js';

export class SilverTemplate {
    constructor(public readonly name: string, private readonly rawSource: string) {}

    public parameters(): string[] {
        const regex = /<([^>]+)>/g;
        const matches = [...this.rawSource.matchAll(regex)];
        return Array.from(new Set(matches.map(m => m[1] as string)));
    }

    public fill(params: Record<string, string | number>): string {
        let filledSource = this.rawSource;
        const requiredParams = this.parameters();
        
        for (const req of requiredParams) {
            if (!(req in params)) {
                throw new Error(`Missing parameter for template '${this.name}': <${req}>`);
            }
            filledSource = filledSource.replace(new RegExp(`<${req}>`, 'g'), String(params[req]));
        }
        return filledSource;
    }
}

export class SilverToolkit {
    private constructor() {}

    public static open(): SilverToolkit {
        return new SilverToolkit();
    }

    private getClaims(): SilverClaims {
        return {
            realSilverCompiler: false,
            vmConsensusEquivalence: false,
            mainnetReady: false,
            productionSafe: false,
            simulatedOnly: true
        };
    }

    public templates(): string[] {
        return Object.keys(SILVER_TEMPLATES);
    }

    public template(name: string): SilverTemplate {
        if (!SILVER_TEMPLATES[name]) {
            throw new Error(`Silver template not found: ${name}`);
        }
        return new SilverTemplate(name, SILVER_TEMPLATES[name]);
    }

    public async build(source: string): Promise<SilverBuildResult> {
        // Mock bytecode compilation
        const mockBytecode = Buffer.from(source).toString('hex');
        return {
            source,
            bytecode: mockBytecode,
            claims: this.getClaims()
        };
    }

    public async simulate(build: SilverBuildResult, args?: string[]): Promise<SilverSimulationResult> {
        // Mock VM execution
        return {
            success: true,
            executionTrace: ["OP_TRUE", "OP_CHECKSIG"],
            gasConsumed: 1000,
            claims: this.getClaims()
        };
    }

    public async artifact(build: SilverBuildResult, name?: string): Promise<SilverArtifact> {
        const art: any = {
            id: `silver-${Date.now()}`,
            source: build.source,
            bytecode: build.bytecode,
            createdAt: new Date().toISOString(),
            claims: this.getClaims()
        };
        if (name !== undefined) {
            art.name = name;
        }
        return art as SilverArtifact;
    }

    public async evidence(build: SilverBuildResult, simulation: SilverSimulationResult): Promise<SilverEvidence> {
        return {
            schema: "hardkas.script-evidence.v1",
            artifactId: `silver-${Date.now()}`,
            simulationResult: {
                success: simulation.success,
                executionTrace: simulation.executionTrace,
                gasConsumed: simulation.gasConsumed
            },
            timestamp: new Date().toISOString(),
            claims: this.getClaims()
        };
    }
}
