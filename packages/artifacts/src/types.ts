import { HardkasArtifactSchema } from "./constants.js";
import { 
  NetworkId, 
  ExecutionMode, 
  ArtifactType, 
  TxId, 
  KaspaAddress, 
  ArtifactId, 
  LineageId,
  ContentHash,
  EventSequence,
  WorkflowId
} from "@hardkas/core";

export type AssumptionLevel = "dev" | "trusted" | "network-observed";

export interface HardkasArtifactBase {
  schema: HardkasArtifactSchema;
  hardkasVersion: string;
  version: string;
  hashVersion?: number | string;
  networkId: NetworkId;
  mode: ExecutionMode;
  createdAt: string;
}

export interface BaseArtifact<T extends ArtifactType> {
  schema: `hardkas.${T}`;
  hardkasVersion: string;
  version: string; // usually "1.0.0-alpha" or "1.0.0"
  hashVersion?: number | string;
  networkId: NetworkId;
  mode: ExecutionMode;
  createdAt: string;
  
  contentHash?: ContentHash | undefined;
  workflowId?: WorkflowId | undefined;
  assumptionLevel?: AssumptionLevel | undefined;
  executionMode?: ExecutionMode | undefined; // Align with mode or specify deeper
  
  lineage?: {
    artifactId: ArtifactId;
    lineageId: LineageId;
    parentArtifactId?: ArtifactId | undefined;
    rootArtifactId: ArtifactId;
    sequence?: EventSequence | number | undefined;
  } | undefined;
}

export interface DagContext {
  mode: "linear" | "dag-light";
  sink: string;
  selectedParent?: string;
  branchId?: string;
  acceptedTxIds?: string[];
  displacedTxIds?: string[];
  conflictSet?: Array<{
    outpoint: string;
    winnerTxId: string;
    loserTxIds: string[];
  }>;
  nonSelectedContext?: boolean;
}

export interface UtxoArtifact {
  readonly outpoint: {
    readonly transactionId: TxId;
    readonly index: number;
  };
  readonly address: KaspaAddress;
  readonly amountSompi: string;
  readonly scriptPublicKey: string;
  readonly blockDaaScore?: string | undefined;
  readonly isCoinbase?: boolean | undefined;
}

export interface TxOutputArtifact {
  readonly address: string;
  readonly amountSompi: string;
  readonly amount?: string | undefined;
  readonly script?: string | undefined;
}

export interface TxPlanArtifactV1 extends HardkasArtifactBase {
  readonly schema: "hardkas.txPlan.v1";
  readonly status: "built" | "unsigned";
  
  readonly planId: string;
  
  readonly from: {
    readonly input: string;
    readonly address: string;
    readonly accountName?: string | undefined;
  };
  
  readonly to: {
    readonly input: string;
    readonly address: string;
  };
  
  readonly amountSompi: string;
  readonly amount: string;
  
  readonly selectedUtxos: readonly UtxoArtifact[];
  readonly outputs: readonly TxOutputArtifact[];
  readonly change?: TxOutputArtifact | undefined;
  
  readonly estimatedMass: string;
  readonly estimatedFeeSompi: string;
  readonly estimatedFee: string;
  
  readonly rpcUrl?: string | null | undefined;
  readonly metadata?: Record<string, any> | undefined;
}

export interface SignedTxArtifactV1 extends HardkasArtifactBase {
  readonly schema: "hardkas.signedTx.v1";
  readonly status: "signed";
  
  readonly signedId: string;
  readonly sourcePlanId: string;
  readonly sourcePlanPath?: string | undefined;
  
  readonly from: {
    readonly input: string;
    readonly address: string;
    readonly accountName?: string | undefined;
  };
  
  readonly to: {
    readonly input: string;
    readonly address: string;
  };
  
  readonly amountSompi: string;
  readonly amount: string;
  
  readonly signedTransaction: {
    readonly format: "kaspa-sdk" | "hex" | "simulated" | "unknown";
    readonly payload: string;
  };
  
  readonly txId?: string | undefined; // Proposed TxID if deterministic
  readonly metadata?: Record<string, any> | undefined;
}

export interface TxReceiptArtifactV1 extends HardkasArtifactBase {
  readonly schema: "hardkas.txReceipt.v1";
  readonly status: "submitted" | "accepted" | "confirmed" | "finalized" | "failed";
  
  readonly txId: TxId;
  readonly sourceSignedId?: ArtifactId | undefined;
  readonly sourceSignedPath?: string | undefined;
  
  readonly from: {
    readonly address: string;
    readonly accountName?: string | undefined;
  };
  
  readonly to: {
    readonly address: string;
  };
  
  readonly amountSompi: string;
  readonly amount: string;
  readonly feeSompi: string;
  
  readonly daaScore?: string | undefined;
  readonly blueScore?: string | undefined;
  
  readonly submittedAt: string;
  readonly confirmedAt?: string | undefined;
  readonly rpcUrl: string;
  
  readonly receiptPath?: string | undefined; // Link to detailed receipt if applicable
  readonly tracePath?: string | undefined;   // Link to trace artifact
  
  readonly metadata?: Record<string, any> | undefined;
}

export interface TxTraceArtifactV1 extends HardkasArtifactBase {
  readonly schema: "hardkas.txTrace.v1";
  readonly txId: TxId;
  readonly steps: Array<{
    phase: string;
    status: string;
    timestamp: string;
    details?: any;
  }>;
}

// --- V2 Artifact Interfaces ---

export interface TxPlanArtifact extends BaseArtifact<"txPlan"> {
  planId: string;
  from: { address: string; accountName?: string | undefined; input?: string | undefined };
  to: { address: string; accountName?: string | undefined; input?: string | undefined };
  amountSompi: string;
  estimatedFeeSompi: string;
  estimatedMass: string;
  inputs: Array<{
    outpoint: { transactionId: string; index: number };
    amountSompi: string;
  }>;
  outputs: Array<{
    address: string;
    amountSompi: string;
  }>;
  change?: {
    address: string;
    amountSompi: string;
  } | undefined;
}

export interface SignedTxArtifact extends BaseArtifact<"signedTx"> {
  status: "signed";
  signedId: ArtifactId;
  sourcePlanId: string;
  from: { address: KaspaAddress; accountName?: string | undefined; input?: string | undefined };
  to: { address: KaspaAddress; accountName?: string | undefined; input?: string | undefined };
  amountSompi: string;
  signedTransaction: {
    format: string;
    payload: string;
  };
  txId?: TxId | undefined;
  metadata?: any | undefined;
}

export interface TxReceiptArtifact extends BaseArtifact<"txReceipt"> {
  txId: TxId;
  status: "pending" | "submitted" | "accepted" | "confirmed" | "failed";
  from: { address: KaspaAddress };
  to: { address: KaspaAddress };
  amountSompi: string;
  feeSompi: string;
  mass?: string | undefined;
  daaScore?: string | undefined;
  submittedAt?: string | undefined;
  confirmedAt?: string | undefined;
  preStateHash?: string | undefined;
  postStateHash?: string | undefined;
  tracePath?: string | undefined;
  rpcUrl?: string | undefined;
  sourceSignedId?: ArtifactId | undefined;
  metadata?: any | undefined;
}

export interface SnapshotArtifact extends BaseArtifact<"snapshot"> {
  name?: string | undefined;
  daaScore: string;
  accounts: Array<{ name: string; address: string }>;
  utxos: Array<{
    id: string;
    address: string;
    amountSompi: string;
    spent: boolean;
    createdAtDaaScore: string;
  }>;
}

export interface TxTraceArtifact extends BaseArtifact<"txTrace"> {
  txId: TxId;
  steps: Array<{
    phase: string;
    status: string;
    timestamp: string;
    details?: any;
  }>;
  dagContext?: DagContext | undefined;
}

// Igra L2 Artifacts (Imported from igra-artifacts.ts)
export * from "./igra-artifacts.js";

export interface DeploymentRecord extends HardkasArtifactBase {
  schema: "hardkas.deployment.v1";
  /** Human-readable label (e.g., "initial-funding", "vault-covenant-v1") */
  label: string;
  /** Network where this was deployed */
  networkId: NetworkId;
  /** Deployment status */
  status: "planned" | "sent" | "confirmed" | "failed" | "unknown";
  /** The transaction ID (if sent) */
  txId?: TxId;
  /** Reference to the plan artifact that produced this deployment */
  planArtifactId?: ArtifactId;
  /** Reference to the receipt artifact (if confirmed) */
  receiptArtifactId?: ArtifactId;
  /** Deployed addresses or outputs (for covenant/contract deployments) */
  deployedAddresses?: string[];
  /** Deployment metadata */
  deployer?: string;
  /** Content hash of the deployed payload (bytecode, script, or tx content) */
  payloadHash?: string;
  /** Timestamp of deployment */
  deployedAt: string;
  /** HardKAS version used */
  hardkasVersion: string;
  /** Canonical content hash of this record */
  contentHash?: ContentHash;
  /** Notes */
  notes?: string;
}

export interface DeploymentIndex extends HardkasArtifactBase {
  schema: "hardkas.deploymentIndex.v1";
  networkId: NetworkId;
  deployments: DeploymentSummary[];
  lastUpdated: string;
}

export interface DeploymentSummary {
  label: string;
  networkId: NetworkId;
  status: string;
  txId?: string;
  deployedAt: string;
  contentHash: string;
}
