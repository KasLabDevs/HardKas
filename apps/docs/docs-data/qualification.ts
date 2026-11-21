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

// Every capabilityId a page passes to <QualificationContext /> must be a key here: an unknown id fails the build.
// "localnet" = a real rusty-kaspad node on simnet. Mainnet is locked down (no keys, no connection, no broadcast).
export const qualificationData: Record<string, CapabilityState> = {
  'artifact-identity': {
    id: 'artifact-identity',
    name: 'Artifact Identity (artifactId)',
    hardkasVersion: '0.13.0-rc.3',
    maturity: 'STABLE',
    evidenceLevel: 'L3',
    environments: {
      simulator: 'SUPPORTED',
      localnet: 'SUPPORTED',
      testnet: 'NOT_QUALIFIED',
      mainnet: 'UNSUPPORTED',
    },
    plannerAuthority: 'N/A',
    artifactsProduced: [],
    knownLimitations: ['Two artifacts with the same semantic content share one artifactId (it is their contentHash).'],
  },
  'artifacts': {
    id: 'artifacts',
    name: 'Evidence Artifacts',
    hardkasVersion: '0.13.0-rc.3',
    maturity: 'STABLE',
    evidenceLevel: 'L3',
    environments: {
      simulator: 'SUPPORTED',
      localnet: 'SUPPORTED',
      testnet: 'NOT_QUALIFIED',
      mainnet: 'UNSUPPORTED',
    },
    plannerAuthority: 'N/A',
    artifactsProduced: ['TxPlan', 'SignedTx', 'TxReceipt (simulator)', 'TxSubmission (node send)'],
    knownLimitations: [
      'Artifacts are local evidence of what HardKAS planned, signed and sent; they are not consensus proofs.',
      'Mainnet: offline artifact verify only.',
    ],
  },
  'deterministicHashing': {
    id: 'deterministicHashing',
    name: 'Deterministic Hashing (contentHash)',
    hardkasVersion: '0.13.0-rc.3',
    maturity: 'STABLE',
    evidenceLevel: 'L3',
    environments: {
      simulator: 'SUPPORTED',
      localnet: 'SUPPORTED',
      testnet: 'NOT_QUALIFIED',
      mainnet: 'UNSUPPORTED',
    },
    plannerAuthority: 'N/A',
    artifactsProduced: [],
    knownLimitations: [
      'The contentHash covers every field except a closed list of top-level operational fields (timestamps, local paths, RPC URL, hardkasVersion, signature metadata), the labels derived from the hash (planId, signedId) and its own self references (hash version 5).',
    ],
  },
  'workspaceLocks': {
    id: 'workspaceLocks',
    name: 'Workspace Locks (.hardkas/locks)',
    hardkasVersion: '0.13.0-rc.3',
    maturity: 'STABLE',
    evidenceLevel: 'L1',
    environments: {
      simulator: 'SUPPORTED',
      localnet: 'SUPPORTED',
      testnet: 'NOT_QUALIFIED',
      mainnet: 'UNSUPPORTED',
    },
    plannerAuthority: 'N/A',
    artifactsProduced: [],
    knownLimitations: [
      'A local development protection, not a Kaspa protocol property.',
      'hardkas repair --force removes lock files without checking whether their process is alive.',
    ],
  },
  'consensusValidation': {
    id: 'consensusValidation',
    name: 'Consensus Validation (by the node)',
    hardkasVersion: '0.13.0-rc.3',
    maturity: 'PARTIAL',
    evidenceLevel: 'L3',
    environments: {
      simulator: 'UNSUPPORTED',
      localnet: 'SUPPORTED',
      testnet: 'EXPERIMENTAL',
      mainnet: 'UNSUPPORTED',
    },
    plannerAuthority: 'N/A',
    artifactsProduced: [],
    knownLimitations: [
      'HardKAS validates no consensus rules itself: a real rusty-kaspad node does.',
      'The simulator uses approximate rules and is not consensus-equivalent; testnet-10 needs the explicit opt-in.',
    ],
  },
  'silverScript': {
    id: 'silverScript',
    name: 'SilverScript v1 (silverc v1.0.0)',
    hardkasVersion: '0.13.0-rc.3',
    maturity: 'PARTIAL',
    evidenceLevel: 'L3',
    environments: {
      simulator: 'UNSUPPORTED',
      localnet: 'SUPPORTED',
      testnet: 'NOT_QUALIFIED',
      mainnet: 'UNSUPPORTED',
    },
    plannerAuthority: 'N/A',
    artifactsProduced: ['compile, deploy, spend and covenant records'],
    knownLimitations: [
      'compile, verify, deploy, spend and 1:1 covenants run on simnet; silver covenant start|advance and silver test --on-node are experimental.',
      'silver test on the local runner is SCRIPT_VM evidence, never consensus proof.',
    ],
  },
  'mempoolContamination': {
    id: 'mempoolContamination',
    name: 'Pending-Spend and Mempool Checks',
    hardkasVersion: '0.13.0-rc.3',
    maturity: 'STABLE',
    evidenceLevel: 'L3',
    environments: {
      simulator: 'UNSUPPORTED',
      localnet: 'SUPPORTED',
      testnet: 'NOT_QUALIFIED',
      mainnet: 'UNSUPPORTED',
    },
    plannerAuthority: 'UPSTREAM',
    artifactsProduced: [],
    knownLimitations: [
      'These checks run on the CLI\'s real-node path and read one node only: a spend that node has not seen can still win, and the node then refuses the transaction.',
    ],
  },
  'replay': {
    id: 'replay',
    name: 'Replay Engine',
    hardkasVersion: '0.13.0-rc.3',
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
    hardkasVersion: '0.13.0-rc.3',
    maturity: 'PARTIAL',
    evidenceLevel: 'L3',
    environments: {
      simulator: 'SUPPORTED',
      localnet: 'SUPPORTED',
      testnet: 'NOT_QUALIFIED',
      mainnet: 'UNSUPPORTED',
    },
    plannerAuthority: 'MIXED',
    artifactsProduced: ['TxPlanArtifact'],
    knownLimitations: ['Every plan comes from the kaspa-wasm Generator; a payment that needs several transactions is refused (MULTI_TRANSACTION_PLAN_REQUIRED).'],
  }
};
