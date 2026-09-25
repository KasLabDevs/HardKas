export type Maturity = 'STABLE' | 'PARTIAL' | 'EXPERIMENTAL' | 'DISABLED';
export type EvidenceLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
export type EnvSupport = 'SUPPORTED' | 'PARTIAL' | 'EXPERIMENTAL' | 'UNSUPPORTED' | 'NOT_QUALIFIED';
export type PlannerAuthority = 'SYNTHETIC' | 'UPSTREAM' | 'MIXED' | 'N/A';

export interface CapabilityState {
  id: string;
  name: string;
  hardkasVersion: string;
  maturity: Maturity;
  evidenceLevel: EvidenceLevel;
  environments: {
    simulator: EnvSupport;
    localnet: EnvSupport;
    testnet: EnvSupport;
    mainnet: EnvSupport;
  };
  plannerAuthority: PlannerAuthority;
  artifactsProduced: string[];
  knownLimitations: string[];
}

export const qualificationData: Record<string, CapabilityState> = {
  'artifact-identity': {
    id: 'artifact-identity',
    name: 'Artifact Identity (artifactId)',
    hardkasVersion: '0.12.0-rc.23',
    maturity: 'STABLE',
    evidenceLevel: 'L2',
    environments: {
      simulator: 'SUPPORTED',
      localnet: 'SUPPORTED',
      testnet: 'NOT_QUALIFIED',
      mainnet: 'NOT_QUALIFIED',
    },
    plannerAuthority: 'N/A',
    artifactsProduced: [],
    knownLimitations: [],
  },
  'replay': {
    id: 'replay',
    name: 'Replay Engine',
    hardkasVersion: '0.12.0-rc.23',
    maturity: 'PARTIAL',
    evidenceLevel: 'L2',
    environments: {
      simulator: 'SUPPORTED',
      localnet: 'UNSUPPORTED',
      testnet: 'UNSUPPORTED',
      mainnet: 'UNSUPPORTED',
    },
    plannerAuthority: 'SYNTHETIC',
    artifactsProduced: [],
    knownLimitations: ['REPLAY_MODE_UNSUPPORTED on real node boundaries.'],
  },
  'transaction-planning': {
    id: 'transaction-planning',
    name: 'Transaction Planning',
    hardkasVersion: '0.12.0-rc.23',
    maturity: 'PARTIAL',
    evidenceLevel: 'L3',
    environments: {
      simulator: 'SUPPORTED',
      localnet: 'SUPPORTED',
      testnet: 'NOT_QUALIFIED',
      mainnet: 'NOT_QUALIFIED',
    },
    plannerAuthority: 'MIXED',
    artifactsProduced: ['TxPlanArtifact'],
    knownLimitations: ['Candidate B pending for unified upstream authority.'],
  }
};
