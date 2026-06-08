import { Command } from "commander";
export interface HardKasCapabilities {
    version: string;
    maturity: "alpha" | "hardened-alpha" | "beta" | "stable";
    proofVersion: string;
    hashVersion: number;
    capabilities: {
        artifacts: boolean;
        lineageVerification: boolean;
        deterministicHashing: boolean;
        atomicPersistence: boolean;
        workspaceLocks: boolean;
        corruptionDetection: boolean;
        secretRedaction: boolean;
        mainnetGuards: boolean;
        localnetSimulation: boolean;
        ghostdagSimulation: boolean;
        dagConflictResolution: boolean;
        massProfiler: boolean;
        simulationScenarios: boolean;
        queryStore: boolean;
        replayVerification: boolean;
        schemaMigrations: boolean;
        dockerNode: boolean;
        scriptRunner: boolean;
        testingFramework: boolean;
        l2Profiles: boolean;
        l2BridgeAssumptions: boolean;
        consensusValidation: boolean;
        productionWallet: boolean;
        silverScript: boolean;
        covenants: boolean;
        trustlessExit: boolean;
        differentialDagValidation: boolean;
    };
    trustBoundaries: {
        replay: "local-workflow-only";
        artifacts: "internal-integrity-only";
        simulator: "research-experimental";
        queryStore: "rebuildable-read-model";
        l2Bridge: "pre-zk-assumptions";
    };
}
export declare function registerCapabilitiesCommand(program: Command): void;
//# sourceMappingURL=capabilities.d.ts.map