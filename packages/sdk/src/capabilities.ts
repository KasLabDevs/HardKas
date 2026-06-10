import { CURRENT_HASH_VERSION, HARDKAS_VERSION } from "@hardkas/artifacts";

export interface HardkasCapabilities {
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

export class HardkasCapabilitiesApi {
  async get(): Promise<HardkasCapabilities> {
    return createHardkasCapabilities();
  }
}

export function createHardkasCapabilities(): HardkasCapabilities {
  return {
    version: HARDKAS_VERSION,
    maturity: "hardened-alpha",
    proofVersion: "repro-v0",
    hashVersion: CURRENT_HASH_VERSION,
    capabilities: {
      artifacts: true,
      lineageVerification: true,
      deterministicHashing: true,
      atomicPersistence: true,
      workspaceLocks: true,
      corruptionDetection: true,
      secretRedaction: true,
      mainnetGuards: true,
      localnetSimulation: true,
      ghostdagSimulation: true,
      dagConflictResolution: true,
      massProfiler: true,
      simulationScenarios: true,
      queryStore: true,
      replayVerification: true,
      schemaMigrations: true,
      dockerNode: true,
      scriptRunner: true,
      testingFramework: true,
      l2Profiles: true,
      l2BridgeAssumptions: true,
      consensusValidation: false,
      productionWallet: false,
      silverScript: false,
      covenants: false,
      trustlessExit: false,
      differentialDagValidation: false
    },
    trustBoundaries: {
      replay: "local-workflow-only",
      artifacts: "internal-integrity-only",
      simulator: "research-experimental",
      queryStore: "rebuildable-read-model",
      l2Bridge: "pre-zk-assumptions"
    }
  };
}
