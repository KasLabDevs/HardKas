import { HardkasArtifactBase, Snapshot } from "@hardkas/artifacts";
import { NetworkId, ExecutionMode } from "@hardkas/core";

export interface LocalnetAccount {
  name: string;
  address: string;
}

export interface LocalnetUtxo {
  id: string;
  address: string;
  amountSompi: string; 
  spent: boolean;
  createdAtDaaScore: string;
  spentAtDaaScore?: string;
}

export interface LocalnetState extends HardkasArtifactBase {
  schema: "hardkas.localnetState.v1";
  mode: ExecutionMode;
  networkId: NetworkId;
  daaScore: string;
  accounts: LocalnetAccount[];
  utxos: LocalnetUtxo[];
  snapshots?: Snapshot[];
  dag?: SimulatedDag;
  forkSource?: {
    network: string;
    rpcUrl: string;
    daaScore: string;
    forkedAt: string;
    addresses: string[];
  };
}

export interface SimulatedBlock {
  id: string;
  parents: string[];
  blueScore: string;
  daaScore: string;
  acceptedTxIds: string[];
  isGenesis?: boolean;
  /** GHOSTDAG blue_work for this block (computed by ApproxGhostdagEngine). */
  blueWork?: string;
  /** True if GHOSTDAG colored this block blue, false if red. */
  isBlue?: boolean;
  /** Full GHOSTDAG data if computed. */
  ghostdagData?: import("@hardkas/simulator").GhostdagData;
}

export interface SimulatedDag {
  blocks: Record<string, SimulatedBlock>;
  sink: string;
  selectedPathToSink: string[]; // instead of selectedChain
  acceptedTxIds: string[];
  displacedTxIds: string[];
  conflictSet: Array<{
    outpoint: string;
    winnerTxId: string;
    loserTxIds: string[];
  }>;
  /** Internal GHOSTDAG store for this DAG session. */
  ghostdagStore?: import("@hardkas/simulator").GhostdagStore;
  /** Internal GHOSTDAG engine for this DAG session. */
  ghostdagEngine?: import("@hardkas/simulator").ApproxGhostdagEngine;
}

export interface StateTransition {
  preStateHash: string;
  postStateHash: string;
  daaScore: string;
}

export interface SimulationResult {
  ok: boolean;
  state: LocalnetState;
  receipt: import("@hardkas/artifacts").TxReceipt;
  planArtifact?: import("@hardkas/artifacts").TxPlan;
  errors: string[];
}

export interface ReplayInvariantResult {
  ok: boolean;
  mismatches: string[];
}

export interface ReplayVerificationReport {
  schema: "hardkas.replayReport.v1";
  txId: string;
  planOk: boolean;
  receiptOk: boolean;
  invariantsOk: boolean;
  
  /** Honest check status to avoid overclaiming. */
  checks: {
    /** Whether the internal HardKAS workflow (Plan -> Receipt) was reproduced. */
    workflowDeterministic: "reproduced" | "diverged" | "skipped";
    /** HardKAS DOES NOT currently validate full Kaspa consensus (GHOSTDAG, etc). */
    consensusValidation: "unimplemented" | "partial" | "skipped";
    /** HardKAS DOES NOT currently validate L2 bridge logic. */
    l2BridgeCorrectness: "unimplemented" | "partial" | "skipped";
  };

  divergences: Array<{
    path: string;
    expected: any;
    actual: any;
  }>;

  errors: string[];
}

export interface SnapshotVerificationResult {
  ok: boolean;
  hashes: {
    accountsMatch: boolean;
    utxoSetMatch: boolean;
    stateMatch: boolean;
    contentMatch: boolean;
  };
  errors: string[];
}

export interface SnapshotRestoreResult {
  ok: boolean;
  previousStateHash?: string;
  newStateHash?: string;
  error?: string;
}
