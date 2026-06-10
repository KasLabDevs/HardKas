import { HardkasArtifactSchema } from "./constants.js";
import { HardkasSchemas } from "@hardkas/core";
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
  schemaVersion?: string;
  hardkasVersion: string;
  version: string;
  hashVersion?: number | string;
  networkId: NetworkId;
  mode: ExecutionMode;
  createdAt: string;
}

export interface BaseArtifact<T extends ArtifactType> {
  schema: `hardkas.${T}`;
  schemaVersion?: string;
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

  lineage?:
    | {
        artifactId: ArtifactId;
        lineageId: LineageId;
        parentArtifactId?: ArtifactId | undefined;
        rootArtifactId: ArtifactId;
        sequence?: EventSequence | number | undefined;
      }
    | undefined;
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
  readonly schema: typeof HardkasSchemas.TxPlanV1;
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
  readonly schema: typeof HardkasSchemas.SignedTxV1;
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
  readonly schema: typeof HardkasSchemas.TxReceiptV1;
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
  readonly tracePath?: string | undefined; // Link to trace artifact

  readonly metadata?: Record<string, any> | undefined;
}

export interface TxTraceArtifactV1 extends HardkasArtifactBase {
  readonly schema: typeof HardkasSchemas.TxTraceV1;
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
  change?:
    | {
        address: string;
        amountSompi: string;
      }
    | undefined;
  networkProfileRef?: string | undefined;
  policyRef?: string | undefined;
  policyRefs?: string[] | undefined;
  assumptionRef?: string | undefined;
}

export interface SignedTxArtifact extends BaseArtifact<"signedTx"> {
  status: "partially_signed" | "signed";
  signedId: ArtifactId;
  sourcePlanId: string;
  from: {
    address: KaspaAddress;
    accountName?: string | undefined;
    input?: string | undefined;
  };
  to: {
    address: KaspaAddress;
    accountName?: string | undefined;
    input?: string | undefined;
  };
  amountSompi: string;
  unsignedPayloadHash?: string | undefined;
  signedTransaction?:
    | {
        format: string;
        payload: string;
      }
    | undefined;
  txId?: TxId | undefined;
  multisig?:
    | {
        threshold: number;
        requiredSigners: string[];
        signatures: Array<{
          signer: string;
          signature: string;
        }>;
      }
    | undefined;
  signatureMetadata?:
    | Array<{
        signer: string;
        signedAt: string;
      }>
    | undefined;
  networkProfileRef?: string | undefined;
  policyRef?: string | undefined;
  policyRefs?: string[] | undefined;
  assumptionRef?: string | undefined;
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
  networkProfileRef?: string | undefined;
  policyRef?: string | undefined;
  policyRefs?: string[] | undefined;
  assumptionRef?: string | undefined;
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

export interface PolicyArtifact extends BaseArtifact<"policy.v1"> {
  decision: "ALLOW" | "DENY";
  rules: Array<{
    id: string;
    result: "PASS" | "FAIL";
    inputHash?: string | undefined;
  }>;
}

export interface NetworkProfileArtifact extends BaseArtifact<"networkProfile.v1"> {
  networkProfileId: string;
  layer: string;
  capabilities: Record<string, any>;
}

export interface AssumptionArtifact extends BaseArtifact<"assumption.v1"> {
  settlement?: string | undefined;
  securityModel?: string | undefined;
  bridgePhase?: string | undefined;
  exitModel?: string | undefined;
  customAssumptions?: Record<string, any> | undefined;
}

export interface MigrationReceiptArtifact extends BaseArtifact<"migrationReceipt.v1"> {
  oldHash: string;
  newHash: string;
  fromSchema: string;
  toSchema: string;
  migrationId: string;
  migrationVersion?: string | undefined;
  decision: "MIGRATED_WITH_PROOF";
}

// Igra L2 Artifacts (Imported from igra-artifacts.ts)
export * from "./igra-artifacts.js";

export interface WorkflowArtifact extends BaseArtifact<"workflow.v1"> {
  workflowId: WorkflowId;
  status: "pending" | "running" | "completed" | "failed";
  inputs?: Record<string, any>;
  steps: Array<{
    type: string;
    status: "pending" | "success" | "failed" | "skipped";
    startedAt?: string;
    completedAt?: string;
    producedArtifactId?: string;
    error?: string;
  }>;
  parentArtifacts?: string[];
  producedArtifacts: string[];
  generationRange?: {
    start?: string;
    end?: string;
  };
  policy?: {
    allowNetwork: boolean;
    allowMainnet: boolean;
    allowExternalWallet: boolean;
    requireDryRun: boolean;
  };
  generationId?: string;
  replayResult?: {
    verified: boolean;
    stateHash?: string;
  };
  errorEnvelope?: {
    code: string;
    message: string;
    redacted: boolean;
  };
}

export interface DeploymentRecord extends HardkasArtifactBase {
  schema: typeof HardkasSchemas.DeploymentV1;
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
  schema: typeof HardkasSchemas.DeploymentIndexV1;
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

export interface SilverCompileArtifact extends BaseArtifact<"silver.compile"> {
  sourcePath: string;
  sourceHash: string;
  compilerName: string;
  compilerVersion: string;
  compilerCommand: string;
  compiledScriptHex?: string | undefined;
  compiledScriptHash?: string | undefined;
  abi?: any | undefined;
  network: string;
  assumptions?: string[] | undefined;
}

export interface SilverTestArtifact extends BaseArtifact<"silver.test"> {
  compileArtifactHash: string;
  sourceHash: string;
  compiledScriptHash: string;
  testVectorsHash?: string | null | undefined;
  compilerName: string;
  compilerVersion: string;
  results: Array<{
    name: string;
    status:
      | "PASS"
      | "FAIL"
      | "SKIPPED"
      | "EXPECTED_COMPILER_FAILURE"
      | "PARTIAL_TEST_VECTOR_SUPPORT";
    reason?: string | undefined;
  }>;
  status: "PASS" | "FAIL" | "PARTIAL_TEST_VECTOR_SUPPORT" | "EXPECTED_COMPILER_FAILURE";
}

export interface SilverDeployPlanArtifact extends BaseArtifact<"silver.deployPlan"> {
  compileArtifactHash: string;
  compiledScriptHash: string;
  redeemScriptHex: string;
  redeemScriptHash: string;
  lockingScriptHex: string;
  scriptPublicKeyVersion: number;
  amountSompi: string;
  deployerAddress: string;
}

export interface SilverDeployArtifact extends BaseArtifact<"silver.deploy"> {
  deployPlanHash: string;
  compileArtifactHash: string;
  compiledScriptHash: string;
  redeemScriptHex: string;
  redeemScriptHash: string;
  lockingScriptHex: string;
  scriptPublicKeyVersion: number;
  deployTxId: string;
  outputIndex: number;
  amountSompi: string;
  nodeVersion: string;
}

export interface SilverSpendPlanArtifact extends BaseArtifact<"silver.spendPlan"> {
  deployArtifactHash: string;
  compileArtifactHash: string;
  redeemScriptHash: string;
  lockingScriptHex: string;
  contractUtxoRef: {
    transactionId: string;
    index: number;
  };
  args: Array<{ type: "hex"; value: string }>;
  argsHash: string;
  signatureScriptHex: string;
  expectedOutputs: Array<{
    address: string;
    amountSompi: string;
    scriptHash?: string | undefined;
  }>;
  assumptionLevel?: AssumptionLevel | undefined;
}

export interface SilverSpendReceiptArtifact extends BaseArtifact<"silver.spendReceipt"> {
  spendPlanHash: string;
  deployArtifactHash?: string | undefined;
  redeemScriptHash?: string | undefined;
  lockingScriptHex?: string | undefined;
  signatureScriptHex?: string | undefined;
  spentOutpoint?:
    | {
        transactionId: string;
        index: number;
      }
    | undefined;
  expectedOutputs?:
    | Array<{
        address: string;
        amountSompi: string;
        scriptHash?: string | undefined;
      }>
    | undefined;
  txId: string;
  status: "simulated" | "submitted" | "accepted" | "rejected";
}

export interface SilverDeploySimulationArtifact extends BaseArtifact<"silver.deploySimulation"> {
  deployPlanHash: string;
  compileArtifactHash: string;
  compiledScriptHash: string;
  redeemScriptHex: string;
  redeemScriptHash: string;
  lockingScriptHex: string;
  scriptPublicKeyVersion: 0;
  simulatedDeployTxId: string;
  syntheticOutpoint: {
    transactionId: string;
    index: number;
  };
  amountSompi: string;
  feeSompi: string;
  status: "SIMULATED_ACCEPTED";
}

export interface SilverSpendSimulationArtifact extends BaseArtifact<"silver.spendSimulation"> {
  deploySimulationHash: string;
  spendPlanHash: string;
  redeemScriptHash: string;
  lockingScriptHex: string;
  signatureScriptHex: string;
  simulatedSpendTxId: string;
  spentOutpoint: {
    transactionId: string;
    index: number;
  };
  expectedOutputs: Array<{
    address: string;
    amountSompi: string;
    scriptHash?: string | undefined;
  }>;
  feeSompi: string;
  status: "SIMULATED_ACCEPTED";
}

export interface ProgrammabilityClaims {
  artifactCoherence: "READY_MATCH";
  silverScriptBuilder: "SILVERSCRIPT_BUILDER_READY";
  zkCorpusSurface: "ZK_CORPUS_SURFACE_READY";
  zkLocalVerification: "READY_GROTH16_FIXTURE_COHERENCE";
  risc0InspectSurface: "RISC0_INSPECT_SURFACE_READY";
  vProgsInspectSurface: "VPROGS_INSPECT_SURFACE_READY";
  runtimeOutcome: "PARTIAL";
  vmConsensusEquivalence: "NOT_CLAIMED";
  zkOnchainVerification: "NOT_CLAIMED";
  vProgsRuntime: "NOT_CLAIMED";
  vProgsStableApi: "NOT_CLAIMED";
  mainnet: "BLOCKED_BY_POLICY";
}

export interface ProgrammabilityCapabilitiesArtifact {
  schema: typeof HardkasSchemas.ProgrammabilityCapabilitiesV1;
  ok: true;
  status: "PROGRAMMABILITY_SURFACE_READY";
  claims: ProgrammabilityClaims;
}

export interface ProgrammabilityInspectArtifact {
  schema: typeof HardkasSchemas.ProgrammabilityInspectV1;
  ok: boolean;
  status: "PROGRAMMABILITY_ARTIFACT_INSPECTED" | "PROGRAMMABILITY_ARTIFACT_INVALID";
  claims: ProgrammabilityClaims;
}

export interface ProgrammabilityVerifyArtifact {
  schema: typeof HardkasSchemas.ProgrammabilityVerifyV1;
  ok: boolean;
  status:
    | "PROGRAMMABILITY_VERIFY_PASS"
    | "PROGRAMMABILITY_VERIFY_FAIL"
    | "PROGRAMMABILITY_VERIFY_PARTIAL";
  claims: ProgrammabilityClaims;
}

export interface ProgrammabilityCorpusReportArtifact {
  schema: typeof HardkasSchemas.ProgrammabilityCorpusReportV1;
  ok: boolean;
  status: "PROGRAMMABILITY_CORPUS_PASS" | "PROGRAMMABILITY_CORPUS_FAIL";
  claims: ProgrammabilityClaims;
}

export interface ProgrammabilityAppPlanArtifact {
  schema: typeof HardkasSchemas.ProgrammabilityAppPlanV1;
  ok: true;
  status: "PROGRAMMABILITY_APP_PLAN_READY";
  claims: ProgrammabilityClaims;
}
