export interface SilverClaims {
    realSilverCompiler: boolean;
    vmConsensusEquivalence: boolean;
    mainnetReady: boolean;
    productionSafe: boolean;
    simulatedOnly: boolean;
}

export interface SilverBuildResult {
    source: string;
    bytecode: string;
    claims: SilverClaims;
}

export interface SilverSimulationResult {
    success: boolean;
    executionTrace: string[];
    gasConsumed: number;
    claims: SilverClaims;
}

export interface SilverArtifact {
    id: string;
    name?: string;
    source: string;
    bytecode: string;
    createdAt: string;
    claims: SilverClaims;
}

export interface SilverEvidence {
    schema: string;
    artifactId: string;
    simulationResult: Omit<SilverSimulationResult, 'claims'>;
    timestamp: string;
    claims: SilverClaims;
}
