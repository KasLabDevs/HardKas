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
}

export interface SimulatedBlock {
  id: string;
  parents: string[];
  blueScore: string;
  daaScore: string;
  acceptedTxIds: string[];
  isGenesis?: boolean;
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
}

export interface StateTransition {
  preStateHash: string;
  postStateHash: string;
  daaScore: string;
}

export interface SimulationResult {
  ok: boolean;
  state: LocalnetState;
  receipt: any; // TxReceiptV2
  planArtifact?: any; // TxPlanArtifact
  errors: string[];
}

export interface ReplayInvariantResult {
  ok: boolean;
  mismatches: string[];
}

export interface ReplayVerificationReport {
  planOk: boolean;
  receiptOk: boolean;
  invariantsOk: boolean;
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
