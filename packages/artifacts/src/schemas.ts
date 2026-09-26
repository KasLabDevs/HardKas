import { z } from "zod";
import { HardkasSchemas } from "@hardkas/core";
import {
  kaspaNetworkIdSchema,
  executionModeSchema
} from "@hardkas/core";

export const ARTIFACT_VERSION = "1.0.0-alpha";

export type DraftArtifact<TFinal, THashFields extends keyof TFinal> = Omit<
  TFinal,
  THashFields
> &
  Partial<Pick<TFinal, THashFields>>;

// A version-5 root stores only artifactId (+ sequence); children carry the rest.
// verifyLineage enforces which form applies (Closure Pack D-Q1.d).
export const ArtifactLineageSchema = z.object({
  artifactId: z.string(),
  lineageId: z.string().optional(),
  parentArtifactId: z.string().optional(),
  rootArtifactId: z.string().optional(),
  sequence: z.number().optional()
});

export const ScriptCapabilitySchema = z.enum([
  "p2pk",
  "multisig",
  "timelock",
  "covenant-experimental",
  "silverscript-experimental",
  "tockata-experimental"
]);

export const ScriptMetadataSchema = z.object({
  language: z.enum(["native", "silverscript", "tockata"]).optional(),
  version: z.string().optional(),
  experimental: z.boolean(),
  notes: z.array(z.string()).optional(),
  consensusImpact: z.enum(["none", "experimental"]).optional()
});

export const BaseArtifactSchema = z.object({
  schema: z.string(),
  schemaVersion: z.string().optional(),
  hardkasVersion: z.string(),
  version: z.literal(ARTIFACT_VERSION),
  hashVersion: z.union([z.number(), z.string()]).optional(),
  networkId: kaspaNetworkIdSchema,
  mode: executionModeSchema,
  contentHash: z.string().optional(),
  createdAt: z.string().datetime(),
  lineage: ArtifactLineageSchema.optional(),
  parents: z.array(z.string()).optional(),
  lineageDepth: z.number().optional(),
  workflowId: z.string().optional(),
  assumptionLevel: z.string().optional(),
  scriptProfile: z.enum(["standard", "experimental"]).optional(),
  scriptCapabilities: z.array(ScriptCapabilitySchema).optional(),
  scriptMetadata: ScriptMetadataSchema.optional(),
  metadata: z.any().optional()
});

export const AccountRefSchema = z.object({
  address: z.string(),
  accountName: z.string().optional(),
  input: z.string().optional()
});

export const PolicySchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.PolicyV1),
  decision: z.enum(["ALLOW", "DENY"]),
  rules: z.array(
    z.object({
      id: z.string(),
      result: z.enum(["PASS", "FAIL"]),
      inputHash: z.string().optional()
    })
  )
});

export const NetworkProfileSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.NetworkProfileV1),
  networkProfileId: z.string(),
  layer: z.string(),
  capabilities: z.record(z.any())
});

export const AssumptionSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.AssumptionV1),
  settlement: z.string().optional(),
  securityModel: z.string().optional(),
  bridgePhase: z.string().optional(),
  exitModel: z.string().optional(),
  customAssumptions: z.record(z.any()).optional()
});

export const MigrationReceiptSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.MigrationReceiptV1),
  oldHash: z.string(),
  newHash: z.string(),
  fromSchema: z.string(),
  toSchema: z.string(),
  migrationId: z.string(),
  migrationVersion: z.string().optional(),
  decision: z.literal("MIGRATED_WITH_PROOF")
});

export const TxPlanSchemaV2 = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.TxPlanV2),
  networkId: kaspaNetworkIdSchema,
  mode: executionModeSchema,
  planId: z.string(),
  from: AccountRefSchema,
  to: AccountRefSchema,
  amountSompi: z.string(),
  estimatedFeeSompi: z.string(),
  estimatedMass: z.string(),
  txVersion: z.union([z.literal(0), z.literal(1)]).optional(),
  computeBudget: z.string().optional(),
  storageMass: z.string().optional(),
  lane: z.string().optional(),
  inputs: z.array(
    z.object({
      outpoint: z.object({
        transactionId: z.string(),
        index: z.number()
      }),
      amountSompi: z.string(),
      address: z.string().optional(),
      scriptPublicKey: z.string().optional(),
      blockDaaScore: z.string().optional(),
      isCoinbase: z.boolean().optional(),
      covenantId: z.string().optional(),
      lane: z.string().optional()
    })
  ),
  outputs: z.array(
    z.object({
      address: z.string(),
      amountSompi: z.string()
    })
  ),
  change: z
    .object({
      address: z.string(),
      amountSompi: z.string()
    })
    .optional(),
  rpcUrl: z.string().optional(),
  networkProfileRef: z.string().optional(),
  policyRef: z.string().optional(),
  policyRefs: z.array(z.string()).optional(),
  assumptionRef: z.string().optional()
});

const executionTargetSchema = z.object({
  mode: z.enum(["simulator", "localnet", "rpc", "l2-rpc"]),
  domain: z.enum(["kaspa-l1", "evm-l2"]),
  network: z.string()
});

export const TxPlanSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.TxPlan),
  execution: executionTargetSchema,
  networkId: kaspaNetworkIdSchema,
  mode: executionModeSchema,
  planId: z.string(),
  from: AccountRefSchema,
  to: AccountRefSchema,
  amountSompi: z.string(),
  estimatedFeeSompi: z.string(),
  estimatedMass: z.string(),
  txVersion: z.union([z.literal(0), z.literal(1)]).optional(),
  computeBudget: z.string().optional(),
  storageMass: z.string().optional(),
  lane: z.string().optional(),
  inputs: z.array(
    z.object({
      outpoint: z.object({
        transactionId: z.string(),
        index: z.number()
      }),
      amountSompi: z.string(),
      address: z.string().optional(),
      scriptPublicKey: z.string().optional(),
      blockDaaScore: z.string().optional(),
      isCoinbase: z.boolean().optional(),
      covenantId: z.string().optional(),
      lane: z.string().optional()
    })
  ),
  outputs: z.array(
    z.object({
      address: z.string(),
      amountSompi: z.string()
    })
  ),
  change: z
    .object({
      address: z.string(),
      amountSompi: z.string()
    })
    .optional(),
  rpcUrl: z.string().optional(),
  networkProfileRef: z.string().optional(),
  policyRef: z.string().optional(),
  policyRefs: z.array(z.string()).optional(),
  assumptionRef: z.string().optional(),
  // M10-B-completion authority projection. The planner that produced this artifact
  // records itself here so downstream verify/lineage tools can distinguish real-
  // network authority (`KASPA_WASM_GENERATOR`) from the synthetic developer
  // harness (`SYNTHETIC_SIMULATOR`). Absence = authority was not established;
  // NEVER synthesize a value. Historical plan artifacts legitimately omit this
  // field and remain readable — the fields are optional to preserve backward
  // compatibility with rc.22-era artifacts.
  plannerAuthority: z.enum(["KASPA_WASM_GENERATOR", "SYNTHETIC_SIMULATOR"]).optional(),
  plannerAuthorityDetail: z.string().optional()
});

export const DagContextSchema = z.object({
  mode: z.enum(["linear", "dag-light"]),
  sink: z.string(),
  selectedParent: z.string().optional(),
  branchId: z.string().optional(),
  acceptedTxIds: z.array(z.string()).optional(),
  displacedTxIds: z.array(z.string()).optional(),
  conflictSet: z
    .array(
      z.object({
        outpoint: z.string(),
        winnerTxId: z.string(),
        loserTxIds: z.array(z.string())
      })
    )
    .optional(),
  nonSelectedContext: z.boolean().optional()
});

export const LocalnetUtxoSchemaV2 = z.object({
  id: z.string(),
  address: z.string(),
  amountSompi: z.string(),
  spent: z.boolean(),
  createdAtDaaScore: z.string()
});

export const SnapshotSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.SnapshotV1),
  name: z.string().optional(),
  daaScore: z.string(),
  accountsHash: z.string().optional(),
  utxoSetHash: z.string().optional(),
  stateHash: z.string().optional(),
  accounts: z.array(
    z.object({
      name: z.string(),
      address: z.string()
    })
  ),
  utxos: z.array(LocalnetUtxoSchemaV2)
});

export const TxReceiptSchemaV2 = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.TxReceiptV2),
  txId: z.string(),
  status: z.enum(["submitted", "accepted", "confirmed", "failed"]),
  mode: executionModeSchema,
  networkId: kaspaNetworkIdSchema,
  from: AccountRefSchema,
  to: AccountRefSchema,
  amountSompi: z.string(),
  feeSompi: z.string(),
  mass: z.string().optional(),
  txVersion: z.union([z.literal(0), z.literal(1)]).optional(),
  computeBudget: z.string().optional(),
  storageMass: z.string().optional(),
  lane: z.string().optional(),
  changeSompi: z.string().optional(),
  spentUtxoIds: z.array(z.string()).optional(),
  createdUtxoIds: z.array(z.string()).optional(),
  daaScore: z.string().optional(),
  preStateHash: z.string().optional(),
  postStateHash: z.string().optional(),
  submittedAt: z.string().optional(),
  confirmedAt: z.string().optional(),
  dagContext: DagContextSchema.optional(),
  tracePath: z.string().optional(),
  rpcUrl: z.string().optional(),
  sourceSignedId: z.string().optional(),
  errors: z.array(z.string()).optional(),
  metadata: z.any().optional(),
  confirmations: z.number().optional(),
  acceptingBlockHash: z.string().optional(),
  observedAtDaaScore: z.string().optional()
});

export const TxReceiptSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.TxReceipt),
  execution: executionTargetSchema,
  txId: z.string(),
  status: z.enum(["submitted", "accepted", "confirmed", "failed"]),
  mode: executionModeSchema,
  networkId: kaspaNetworkIdSchema,
  from: AccountRefSchema,
  to: AccountRefSchema,
  amountSompi: z.string(),
  feeSompi: z.string(),
  mass: z.string().optional(),
  txVersion: z.union([z.literal(0), z.literal(1)]).optional(),
  computeBudget: z.string().optional(),
  storageMass: z.string().optional(),
  lane: z.string().optional(),
  changeSompi: z.string().optional(),
  spentUtxoIds: z.array(z.string()).optional(),
  createdUtxoIds: z.array(z.string()).optional(),
  daaScore: z.string().optional(),
  preStateHash: z.string().optional(),
  postStateHash: z.string().optional(),
  submittedAt: z.string().optional(),
  confirmedAt: z.string().optional(),
  dagContext: DagContextSchema.optional(),
  tracePath: z.string().optional(),
  rpcUrl: z.string().optional(),
  sourceSignedId: z.string().optional(),
  errors: z.array(z.string()).optional(),
  metadata: z.any().optional()
});

/**
 * R-iii part 1 (Closure Pack IC-2′.2, Wave 1.3): the immutable record of what
 * HardKAS DID when it broadcast a signed transaction. Authenticated: the signed
 * artifact by artifactId, the txId the node returned, the submit call's result.
 * It carries NO post-send state (no status, confirmedAt, dagContext…): that is
 * observation, Wave 2. The raw RPC locator stays in the unauthenticated `rpcUrl`
 * (IC-1′.1b); a normalised `endpoint` is ARCHITECTURE_BLOCKED until its
 * normalisation is ratified, so no `endpoint` field is written.
 */
export const TxSubmissionSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.TxSubmissionV1),
  execution: executionTargetSchema.optional(),
  signedArtifactId: z.string().regex(/^[0-9a-f]{64}$/),
  txId: z.string(),
  submitResult: z.object({
    accepted: z.boolean(),
    transactionId: z.string().optional(),
    error: z.string().optional()
  }),
  submittedAt: z.string().optional(),
  rpcUrl: z.string().optional(),
  policyRefs: z.array(z.string()).optional(),
  networkProfileRef: z.string().optional(),
  assumptionRef: z.string().optional(),
  /**
   * Wave 2(a) · the observer's cursor: where the virtual was when HardKAS submitted
   * (authenticated; it is a fact about the submit, not a post-send state).
   */
  submitPoint: z
    .object({
      virtualDaaScore: z.string().regex(/^\d+$/),
      sinkHash: z.string(),
      sinkBlueScore: z.string().regex(/^\d+$/)
    })
    .optional(),
  /**
   * Wave 2(d) · AUD-18: the fee DERIVED from the signed transaction (Σ consumed −
   * Σ produced) or an explicit statement that the evidence did not allow it.
   * Never an estimate copied from metadata, never "0" by default.
   */
  fee: z
    .discriminatedUnion("status", [
      z.object({
        status: z.literal("derived"),
        method: z.literal("inputs-minus-outputs"),
        inputsSompi: z.string().regex(/^\d+$/),
        outputsSompi: z.string().regex(/^\d+$/),
        feeSompi: z.string().regex(/^\d+$/),
        inputCount: z.number().int().positive(),
        outputCount: z.number().int().positive(),
        planArtifactId: z.string().regex(/^[0-9a-f]{64}$/)
      }),
      z.object({ status: z.literal("insufficient-evidence"), reason: z.string().min(1) })
    ])
    .optional()
});

const decimalString = z.string().regex(/^\d+$/);
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

/** Wave 2(a) · IC-2′.3 · where the observer's virtual was when it looked (authenticated). */
export const TxObservationPointSchema = z.object({
  virtualDaaScore: decimalString,
  sinkHash: z.string(),
  sinkBlueScore: decimalString,
  pruningPointHash: z.string().optional()
});

/**
 * Wave 2(a) · IC-2′.3 · the typed finding of ONE observation. The consensus meaning
 * of each type is fixed by Q4 (ratified 2026-09-26); an observation is never a
 * consensus verdict by itself — `deriveTxStatus` turns a set of them into a state.
 */
export const TxObservationFindingSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mempool_entry"), isOrphan: z.boolean(), feeSompi: decimalString.optional() }),
  z.object({ type: z.literal("mempool_absent") }),
  z.object({
    type: z.literal("chain_accepted"),
    acceptingBlockHash: z.string(),
    acceptingBlueScore: decimalString,
    acceptingDaaScore: decimalString.optional(),
    confirmationsBlue: decimalString,
    confirmationsDaa: decimalString.optional()
  }),
  z.object({ type: z.literal("chain_removed"), acceptingBlockHash: z.string() }),
  z.object({
    type: z.literal("finality_reached"),
    acceptingBlockHash: z.string(),
    acceptingBlueScore: decimalString,
    confirmationsBlue: decimalString,
    finalityDepth: decimalString
  }),
  z.object({ type: z.literal("pruned_unobservable"), reason: z.string() }),
  z.object({
    type: z.literal("not_found"),
    scannedFrom: z.string().optional(),
    /** The last chain block the scan reached: the next observation's cursor. */
    scannedTo: z.string().optional(),
    scannedChainBlocks: z.number().int().nonnegative().optional()
  }),
  z.object({ type: z.literal("synthetic_executed"), receiptArtifactId: hex64 })
]);

/**
 * Wave 2(a) · IC-2′.3 / Q4 · `hardkas.txObservation.v1`: what ONE observer saw about a
 * txId at ONE point. Everything material is authenticated (v5). It references its
 * subject; it is not a lineage link (IC-2′.5). "Persist facts; derive states."
 */
export const TxObservationSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.TxObservationV1),
  execution: executionTargetSchema.optional(),
  subject: z.object({
    txId: z.string(),
    submissionArtifactId: hex64.optional()
  }),
  observer: z.object({
    /**
     * Opaque, stable identity of the HardKAS observer INSTANCE (Wave 2(a) security
     * review): "these observations come from the same logical observer", so that a
     * temporal history is only ever derived within one observer. It does NOT identify
     * a node cryptographically (D-Q1.a stays blocked).
     */
    observerId: z.string().regex(/^obs_[0-9a-f]{64}$/),
    kind: z.enum(["rpc", "synthetic"]),
    networkId: kaspaNetworkIdSchema,
    serverVersion: z.string().optional(),
    capabilities: z.object({
      reorgAware: z.boolean(),
      prunedBelowBlueScore: decimalString.optional()
    }),
    /** Interim until D-Q1.a: describes the observer; it does NOT identify a node cryptographically. */
    description: z.string()
  }),
  point: TxObservationPointSchema,
  finding: TxObservationFindingSchema,
  evidence: z.array(
    z.object({
      method: z.string(),
      params: z.any(),
      responseDigest: hex64
    })
  ),
  observedAt: z.string().datetime(),
  rpcUrl: z.string().optional()
});

/**
 * A replay report is an artifact like any other (IC-4′.1): its producer seals it
 * and the verifier checks it; no schema skips verification.
 */
export const ReplayReportSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.ReplayReportV1),
  txId: z.string(),
  planOk: z.boolean(),
  receiptOk: z.boolean(),
  invariantsOk: z.boolean(),
  checks: z.object({
    workflowDeterministic: z.enum(["reproduced", "diverged", "skipped"]),
    consensusValidation: z.enum(["unimplemented", "partial", "skipped"]),
    l2BridgeCorrectness: z.enum(["unimplemented", "partial", "skipped"])
  }),
  divergences: z.array(z.any()),
  errors: z.array(z.string())
});

/**
 * A multisig entry is EITHER a real signature ({ signer, signature }) OR, in the
 * simulator's synthetic model (Wave 1.4 · IC-6′.4), a synthetic marker
 * ({ signer, kind: "synthetic" }) — never presented as a signature.
 */
export const SignatureEntrySchema = z
  .object({
    signer: z.string(),
    signature: z.string().optional(),
    kind: z.literal("synthetic").optional()
  })
  .refine((e) => (e.kind === "synthetic" ? e.signature === undefined : typeof e.signature === "string"), {
    message: "a multisig entry is either { signer, signature } or { signer, kind: \"synthetic\" }"
  });

/**
 * Wave 1.4 · IC-6′.1/.3: the authenticated binding of a simulator "signed"
 * artifact to ONE plan (by artifactId) by the account identities that
 * authorized it. Lives in the hashed body; never in `signatureMetadata`.
 */
export const SyntheticAuthorizationSchema = z
  .object({
    kind: z.literal("synthetic"),
    planArtifactId: z.string().regex(/^[0-9a-f]{64}$/),
    signers: z.array(z.string().min(1)).min(1)
  })
  .strict();

export const SignatureMetadataEntrySchema = z.object({
  signer: z.string(),
  signedAt: z.string().datetime()
});

export const SignedTxSchemaV2 = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.SignedTxV2),
  status: z.enum(["partially_signed", "signed"]),
  signedId: z.string(),
  sourcePlanId: z.string(),
  networkId: kaspaNetworkIdSchema,
  mode: executionModeSchema,
  from: AccountRefSchema,
  to: AccountRefSchema,
  amountSompi: z.string(),
  txVersion: z.union([z.literal(0), z.literal(1)]).optional(),
  computeBudget: z.string().optional(),
  storageMass: z.string().optional(),
  lane: z.string().optional(),
  unsignedPayloadHash: z.string().optional(),
  signedTransaction: z
    .object({
      format: z.string(),
      payload: z.string()
    })
    .optional(),
  txId: z.string().optional(),
  multisig: z
    .object({
      threshold: z.number(),
      requiredSigners: z.array(z.string()),
      signatures: z.array(SignatureEntrySchema)
    })
    .optional(),
  signatureMetadata: z.array(SignatureMetadataEntrySchema).optional(),
  metadata: z.any().optional()
});

export const SignedTxSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.SignedTx),
  execution: executionTargetSchema,
  status: z.enum(["partially_signed", "signed"]),
  signedId: z.string(),
  sourcePlanId: z.string(),
  networkId: kaspaNetworkIdSchema,
  mode: executionModeSchema,
  from: AccountRefSchema,
  to: AccountRefSchema,
  amountSompi: z.string(),
  txVersion: z.union([z.literal(0), z.literal(1)]).optional(),
  computeBudget: z.string().optional(),
  storageMass: z.string().optional(),
  lane: z.string().optional(),
  unsignedPayloadHash: z.string().optional(),
  signedTransaction: z
    .object({
      format: z.string(),
      payload: z.string()
    })
    .optional(),
  txId: z.string().optional(),
  authorization: SyntheticAuthorizationSchema.optional(),
  multisig: z
    .object({
      threshold: z.number(),
      requiredSigners: z.array(z.string()),
      signatures: z.array(SignatureEntrySchema)
    })
    .optional(),
  signatureMetadata: z.array(SignatureMetadataEntrySchema).optional(),
  metadata: z.any().optional()
});

export const TxTraceSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.TxTrace),
  txId: z.string(),
  networkId: kaspaNetworkIdSchema,
  mode: executionModeSchema,
  steps: z.array(
    z.object({
      phase: z.string(),
      status: z.string(),
      timestamp: z.string().datetime(),
      details: z.any().optional()
    })
  ),
  dagContext: DagContextSchema.optional()
});

export const WorkflowSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.WorkflowV1),
  workflowId: z.string(),
  status: z.enum(["pending", "running", "completed", "failed"]),
  inputs: z.record(z.any()).optional(),
  steps: z.array(
    z.object({
      type: z.string(),
      status: z.enum(["pending", "success", "failed", "skipped"]),
      startedAt: z.string().datetime().optional(),
      completedAt: z.string().datetime().optional(),
      producedArtifactId: z.string().optional(),
      error: z.string().optional()
    })
  ),
  parentArtifacts: z.array(z.string()).optional(),
  producedArtifacts: z.array(z.string()),
  generationRange: z
    .object({
      start: z.string().optional(),
      end: z.string().optional()
    })
    .optional(),
  policy: z
    .object({
      allowNetwork: z.boolean(),
      allowMainnet: z.boolean(),
      allowExternalWallet: z.boolean(),
      requireDryRun: z.boolean()
    })
    .optional(),
  generationId: z.string().optional(),
  replayResult: z
    .object({
      verified: z.boolean(),
      stateHash: z.string().optional()
    })
    .optional(),
  errorEnvelope: z
    .object({
      code: z.string(),
      message: z.string(),
      redacted: z.boolean()
    })
    .optional()
});

export type TxPlan = z.infer<typeof TxPlanSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type TxReceipt = z.infer<typeof TxReceiptSchema>;
export type SignedTx = z.infer<typeof SignedTxSchema>;
export type TxTrace = z.infer<typeof TxTraceSchema>;
export type DagContext = z.infer<typeof DagContextSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type ScriptCapability = z.infer<typeof ScriptCapabilitySchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type NetworkProfile = z.infer<typeof NetworkProfileSchema>;
export type Assumption = z.infer<typeof AssumptionSchema>;
export type MigrationReceipt = z.infer<typeof MigrationReceiptSchema>;
export type TxSubmission = z.infer<typeof TxSubmissionSchema>;
export type TxObservation = z.infer<typeof TxObservationSchema>;
export type TxObservationFinding = z.infer<typeof TxObservationFindingSchema>;
export type TxObservationPoint = z.infer<typeof TxObservationPointSchema>;
export type ReplayReport = z.infer<typeof ReplayReportSchema>;

export const RuntimeSessionSchema = BaseArtifactSchema.extend({
  sessionId: z.string(),
  workflowIds: z.array(z.string()),
  artifactIds: z.array(z.string()),
  startedAt: z.string().datetime(),
  network: z.string(),
  deterministic: z.boolean(),
  snapshotOf: z.string().optional(),
  parentSessionId: z.string().optional(),
  notes: z.string().optional()
});

export type RuntimeSession = z.infer<typeof RuntimeSessionSchema>;

export const SilverCompileArtifactSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.SilverCompile),
  sourcePath: z.string(),
  sourceHash: z.string(),
  compilerName: z.string(),
  compilerVersion: z.string(),
  compilerCommand: z.string(),
  compiledScriptHex: z.string(),
  compiledScriptHash: z.string(), // semantic hash
  abi: z.any().optional(),
  network: z.string(),
  assumptions: z.array(z.string()).optional()
});

export type SilverCompileArtifact = z.infer<typeof SilverCompileArtifactSchema>;

export const SilverDeployPlanArtifactSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.SilverDeployPlan),
  compileArtifactHash: z.string(),
  compiledScriptHash: z.string(),
  redeemScriptHex: z.string(),
  redeemScriptHash: z.string(), // blake2b32 of raw bytes
  lockingScriptHex: z.string(),
  scriptPublicKeyVersion: z.number(),
  amountSompi: z.string(),
  networkId: kaspaNetworkIdSchema,
  deployerAddress: z.string()
});

export type SilverDeployPlanArtifact = z.infer<typeof SilverDeployPlanArtifactSchema>;

export const SilverDeployArtifactSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.SilverDeploy),
  deployPlanHash: z.string(),
  compileArtifactHash: z.string(),
  compiledScriptHash: z.string(),
  redeemScriptHex: z.string(),
  redeemScriptHash: z.string(),
  lockingScriptHex: z.string(),
  scriptPublicKeyVersion: z.number(),
  deployTxId: z.string(),
  outputIndex: z.number(),
  amountSompi: z.string(),
  networkId: kaspaNetworkIdSchema,
  nodeVersion: z.string()
});

export type SilverDeployArtifact = z.infer<typeof SilverDeployArtifactSchema>;

export const SilverScriptArgSchema = z.object({
  type: z.literal("hex"),
  value: z.string()
});

export const SilverSpendPlanArtifactSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.SilverSpendPlan),
  deployArtifactHash: z.string(),
  compileArtifactHash: z.string(),
  redeemScriptHash: z.string(),
  lockingScriptHex: z.string(),
  contractUtxoRef: z.object({
    transactionId: z.string(),
    index: z.number()
  }),
  args: z.array(SilverScriptArgSchema),
  argsHash: z.string(),
  signatureScriptHex: z.string(),
  expectedOutputs: z.array(
    z.object({
      address: z.string(),
      amountSompi: z.string(),
      scriptHash: z.string().optional()
    })
  ),
  networkId: kaspaNetworkIdSchema,
  assumptionLevel: z.string().optional()
});

export type SilverSpendPlanArtifact = z.infer<typeof SilverSpendPlanArtifactSchema>;

export const SilverSpendReceiptArtifactSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.SilverSpendReceipt),
  spendPlanHash: z.string(),
  deployArtifactHash: z.string().optional(),
  redeemScriptHash: z.string().optional(),
  lockingScriptHex: z.string().optional(),
  signatureScriptHex: z.string().optional(),
  spentOutpoint: z
    .object({
      transactionId: z.string(),
      index: z.number()
    })
    .optional(),
  expectedOutputs: z
    .array(
      z.object({
        address: z.string(),
        amountSompi: z.string(),
        scriptHash: z.string().optional()
      })
    )
    .optional(),
  txId: z.string(),
  status: z.enum(["simulated", "submitted", "accepted", "rejected"])
});

export type SilverSpendReceiptArtifact = z.infer<typeof SilverSpendReceiptArtifactSchema>;

export const SilverDeploySimulationArtifactSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.SilverDeploySimulation),
  deployPlanHash: z.string(),
  compileArtifactHash: z.string(),
  compiledScriptHash: z.string(),
  redeemScriptHex: z.string(),
  redeemScriptHash: z.string(),
  lockingScriptHex: z.string(),
  scriptPublicKeyVersion: z.literal(0),
  simulatedDeployTxId: z.string(),
  syntheticOutpoint: z.object({
    transactionId: z.string(),
    index: z.number()
  }),
  amountSompi: z.string(),
  feeSompi: z.string(),
  status: z.literal("SIMULATED_ACCEPTED")
});

export type SilverDeploySimulationArtifact = z.infer<
  typeof SilverDeploySimulationArtifactSchema
>;

export const SilverSpendSimulationArtifactSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.SilverSpendSimulation),
  deploySimulationHash: z.string(),
  spendPlanHash: z.string(),
  redeemScriptHash: z.string(),
  lockingScriptHex: z.string(),
  signatureScriptHex: z.string(),
  simulatedSpendTxId: z.string(),
  spentOutpoint: z.object({
    transactionId: z.string(),
    index: z.number()
  }),
  expectedOutputs: z.array(
    z.object({
      address: z.string(),
      amountSompi: z.string(),
      scriptHash: z.string().optional()
    })
  ),
  feeSompi: z.string(),
  status: z.literal("SIMULATED_ACCEPTED")
});

export type SilverSpendSimulationArtifact = z.infer<
  typeof SilverSpendSimulationArtifactSchema
>;

export const SilverTestArtifactSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.SilverTest),
  compileArtifactHash: z.string(),
  sourceHash: z.string(),
  compiledScriptHash: z.string(),
  testVectorsHash: z.string().optional().nullable(),
  compilerName: z.string(),
  compilerVersion: z.string(),
  results: z.array(
    z.object({
      name: z.string(),
      status: z.enum([
        "PASS",
        "FAIL",
        "SKIPPED",
        "EXPECTED_COMPILER_FAILURE",
        "PARTIAL_TEST_VECTOR_SUPPORT"
      ]),
      reason: z.string().optional()
    })
  ),
  status: z.enum([
    "PASS",
    "FAIL",
    "PARTIAL_TEST_VECTOR_SUPPORT",
    "EXPECTED_COMPILER_FAILURE"
  ])
});

export type SilverTestArtifact = z.infer<typeof SilverTestArtifactSchema>;

// SilverScript v1 records (`hardkas silver`): identities and digests only;
// constructor arguments appear as a digest, signatures never.
const SilverScriptPublicKeySchema = z.object({ version: z.number(), script: z.string().regex(/^[0-9a-f]+$/) });
const Hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const SilverOutpointSchema = z.object({ transactionId: Hex64, index: z.number().int().nonnegative() });
const SilverRecordRefSchema = z.object({ path: z.string(), contentHash: z.string(), artifactSha256: Hex64.optional() });
const SilverNodeRefSchema = z.object({
  verified: z.literal(true),
  container: z.string().optional(),
  imageDigest: z.string(),
  serverVersion: z.string().optional()
});
const SilverRecordBaseSchema = BaseArtifactSchema.extend({
  networkId: z.literal("simnet"),
  artifactId: z.string(),
  capability: z.enum(["silver.compile.v1", "silver.p2sh.deploy-spend.v1", "toccata.covenant.auth-1to1-transition.v1"])
});
const SilverOnChainSchema = SilverRecordBaseSchema.extend({
  txId: Hex64,
  outpoint: SilverOutpointSchema,
  feeSompi: z.string().regex(/^\d+$/),
  status: z.enum(["submitted", "confirmed"]),
  confirmedAtBlockDaaScore: z.string().regex(/^\d+$/).optional(),
  node: SilverNodeRefSchema
});

export const SilverCompileV1Schema = SilverRecordBaseSchema.extend({
  schema: z.literal(HardkasSchemas.SilverCompileV1),
  source: z.object({ path: z.string(), sha256: Hex64, text: z.string() }),
  provenance: z
    .object({
      schema: z.literal("hardkas.silver.compileProvenance.v1"),
      compiler: z.object({ id: z.literal("silverc"), releaseTag: z.string(), commit: z.string(), assetSha256: Hex64, binarySha256: Hex64 }).passthrough(),
      sourceSha256: Hex64,
      constructorArgsSha256: Hex64,
      artifactSha256: Hex64
    })
    .passthrough(),
  artifactJson: z.string(),
  contracts: z.array(z.object({ name: z.string(), lockingScript: SilverScriptPublicKeySchema, address: z.string() }).passthrough())
});

export const SilverDeployV1Schema = SilverOnChainSchema.extend({
  schema: z.literal(HardkasSchemas.SilverDeployV1),
  compileRecord: SilverRecordRefSchema,
  contract: z.string(),
  lockingScript: SilverScriptPublicKeySchema,
  address: z.string(),
  valueSompi: z.string().regex(/^\d+$/)
});

export const SilverSpendV1Schema = SilverOnChainSchema.omit({ outpoint: true }).extend({
  schema: z.literal(HardkasSchemas.SilverSpendV1),
  deployRecord: SilverRecordRefSchema,
  contract: z.string(),
  entry: z.string(),
  dispatchTag: z.string().optional(),
  spentOutpoint: SilverOutpointSchema,
  to: z.string(),
  outputSompi: z.string().regex(/^\d+$/),
  sequence: z.string(),
  sigOpCount: z.number().int().nonnegative(),
  signatureScriptSha256: Hex64
});

export const SilverCovenantV1Schema = SilverOnChainSchema.extend({
  schema: z.literal(HardkasSchemas.SilverCovenantV1),
  kind: z.enum(["genesis", "transition"]),
  compileRecord: SilverRecordRefSchema,
  previous: z.object({ path: z.string(), contentHash: z.string(), outpoint: SilverOutpointSchema }).optional(),
  contract: z.string(),
  covenantId: Hex64,
  covenantIdFromNode: Hex64.optional(),
  lockingScript: SilverScriptPublicKeySchema,
  address: z.string(),
  valueSompi: z.string().regex(/^\d+$/),
  computeBudget: z.number().int().nonnegative()
}).passthrough();

export const ProgrammabilityClaimsSchema = z.object({
  artifactCoherence: z.literal("READY_MATCH"),
  silverCapabilities: z.object({
    "silver.compile.v1": z.literal("REAL_NODE_EVIDENCE"),
    "silver.p2sh.deploy-spend.v1": z.literal("REAL_NODE_EVIDENCE"),
    "silver.p2sh.relative-timelock.v1": z.literal("REAL_NODE_EVIDENCE"),
    "toccata.covenant.auth-1to1-transition.v1": z.literal("REAL_NODE_EVIDENCE")
  }),
  silverCompiler: z.literal("OFFICIAL_SILVERC_V1_0_0_MANAGED"),
  generalCovenantSupport: z.literal("NOT_CLAIMED"),
  zkCorpusSurface: z.literal("ZK_CORPUS_SURFACE_READY"),
  zkLocalVerification: z.literal("READY_GROTH16_FIXTURE_COHERENCE"),
  risc0InspectSurface: z.literal("RISC0_INSPECT_SURFACE_READY"),
  vProgsInspectSurface: z.literal("VPROGS_INSPECT_SURFACE_READY"),
  runtimeOutcome: z.literal("PARTIAL"),
  vmConsensusEquivalence: z.literal("NOT_CLAIMED"),
  zkOnchainVerification: z.literal("NOT_CLAIMED"),
  vProgsRuntime: z.literal("NOT_CLAIMED"),
  vProgsStableApi: z.literal("NOT_CLAIMED"),
  mainnet: z.literal("BLOCKED_BY_POLICY")
});

export const ProgrammabilityCapabilitiesSchema = z.object({
  schema: z.literal(HardkasSchemas.ProgrammabilityCapabilitiesV1),
  ok: z.literal(true),
  status: z.literal("PROGRAMMABILITY_SURFACE_READY"),
  surfaces: z.object({
    silverScript: z.literal("SILVERSCRIPT_V1_LIFECYCLE"),
    zkCorpus: z.literal("ZK_CORPUS_SURFACE_READY"),
    groth16FixtureCoherence: z.literal("READY_GROTH16_FIXTURE_COHERENCE"),
    risc0Inspect: z.literal("RISC0_INSPECT_SURFACE_READY"),
    vProgsInspect: z.literal("VPROGS_INSPECT_SURFACE_READY")
  }),
  claims: ProgrammabilityClaimsSchema,
  nonClaims: z.array(z.string())
});

export const ProgrammabilityInspectSchema = z.object({
  schema: z.literal(HardkasSchemas.ProgrammabilityInspectV1),
  ok: z.boolean(),
  status: z.enum([
    "PROGRAMMABILITY_ARTIFACT_INSPECTED",
    "PROGRAMMABILITY_ARTIFACT_INVALID"
  ]),
  kind: z.enum(["silver", "zk", "vprog"]),
  path: z.string(),
  artifactSchema: z.string().optional(),
  contentHash: z.string().optional(),
  sourceStatus: z.string().optional(),
  claims: ProgrammabilityClaimsSchema,
  issues: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      file: z.string().optional()
    })
  )
});

export const ProgrammabilityVerifySchema = z.object({
  schema: z.literal(HardkasSchemas.ProgrammabilityVerifyV1),
  ok: z.boolean(),
  status: z.enum([
    "PROGRAMMABILITY_VERIFY_PASS",
    "PROGRAMMABILITY_VERIFY_FAIL",
    "PROGRAMMABILITY_VERIFY_PARTIAL"
  ]),
  kind: z.enum(["silver", "zk", "vprog"]),
  path: z.string(),
  sourceStatus: z.string().optional(),
  claims: ProgrammabilityClaimsSchema,
  issues: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      file: z.string().optional()
    })
  )
});

export const ProgrammabilityCorpusReportSchema = z.object({
  schema: z.literal(HardkasSchemas.ProgrammabilityCorpusReportV1),
  ok: z.boolean(),
  path: z.string(),
  status: z.enum(["PROGRAMMABILITY_CORPUS_PASS", "PROGRAMMABILITY_CORPUS_FAIL"]),
  summary: z.object({
    silver: z.enum(["PASS", "FAIL", "SKIPPED"]),
    zk: z.enum(["PASS", "FAIL", "SKIPPED"]),
    vprogs: z.enum(["PASS", "FAIL", "SKIPPED"]),
    rootManifest: z.enum(["PASS", "FAIL"]),
    knownLimitations: z.array(z.string())
  }),
  claims: ProgrammabilityClaimsSchema,
  issues: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      file: z.string().optional()
    })
  )
});

export const ProgrammabilityAppPlanSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.ProgrammabilityAppPlanV1),
  status: z.enum(["PROGRAMMABILITY_APP_PLAN_READY"]),
  kind: z.string(),
  template: z.string(),
  commands: z.array(z.string()),
  sdkSurfaces: z.array(z.string()),
  claims: ProgrammabilityClaimsSchema,
  nonClaims: z.array(z.string())
});

export const CovenantSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.CovenantV1),
  scriptHash: z.string(),
  userLane: z.string().optional(),
  computeBudget: z.number().optional(),
  covenant: z.object({ covenantId: z.string(), authorizingInput: z.number() }).optional(),
  networkId: kaspaNetworkIdSchema,
  isExperimental: z.literal(true)
});

export const ToccataCapabilitiesSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.ToccataCapabilitiesV1),
  available: z.boolean(),
  version: z.string().optional(),
  covenantsSupported: z.boolean(),
  silverScriptSupported: z.boolean()
});

export const IgraStatusSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.IgraStatusV1),
  status: z.enum(["AVAILABLE", "MISSING_DEPENDENCY", "UNSUPPORTED_CAPABILITY"]),
  rpcUrl: z.string().optional(),
  version: z.string().optional()
});

export const ToccataProgrammabilityCorpusSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.ToccataProgrammabilityCorpusV1),
  version: z.string(),
  network: z.literal("simnet"),
  profile: z.literal("toccata-v2"),
  status: z.literal("PROGRAMMABILITY_SURFACE_READY"),
  components: z.record(z.any()),
  claims: z.object({
    artifactCoherence: z.literal("READY_MATCH"),
    runtimeOutcome: z.literal("PARTIAL"),
    vmConsensusEquivalence: z.literal("NOT_CLAIMED"),
    zkOnchainVerification: z.literal("NOT_CLAIMED"),
    vProgsRuntime: z.literal("NOT_CLAIMED"),
    vProgsStableApi: z.literal("NOT_CLAIMED"),
    mainnet: z.literal("BLOCKED_BY_POLICY")
  }),
  expectedKnownLimitations: z.array(z.string())
});

export type ProgrammabilityClaimsSchemaType = z.infer<typeof ProgrammabilityClaimsSchema>;
export type ProgrammabilityCapabilitiesSchemaType = z.infer<
  typeof ProgrammabilityCapabilitiesSchema
>;
export type ProgrammabilityInspectSchemaType = z.infer<
  typeof ProgrammabilityInspectSchema
>;
export type ProgrammabilityVerifySchemaType = z.infer<typeof ProgrammabilityVerifySchema>;
export type ProgrammabilityCorpusReportSchemaType = z.infer<
  typeof ProgrammabilityCorpusReportSchema
>;
export type ProgrammabilityAppPlanSchemaType = z.infer<
  typeof ProgrammabilityAppPlanSchema
>;
export type ToccataProgrammabilityCorpusSchemaType = z.infer<
  typeof ToccataProgrammabilityCorpusSchema
>;

export const ScenarioResultSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.ScenarioResultV1),
  scenarioName: z.string(),
  status: z.enum(["passed", "failed"]),
  artifactsGenerated: z.array(z.string()),
  error: z.object({
    code: z.string(),
    message: z.string(),
    component: z.string().optional(),
    recoverable: z.boolean().optional()
  }).optional(),
  claims: z.object({
    mainnet: z.literal(false),
    testnet: z.literal(false),
    production: z.literal(false)
  })
});

export type ScenarioResult = z.infer<typeof ScenarioResultSchema>;

export const EvidencePackageSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.EvidencePackageV1),
  name: z.string(),
  hardkasVersion: z.string(),
  mode: executionModeSchema,
  scenarioResult: z.any().optional(), // We'll keep it flexible initially to allow injecting the raw json
  artifacts: z.array(z.any()), // Raw inline artifacts
  hashes: z.record(z.string(), z.string()), // map artifactId -> blake2b or sha256 hash
  claims: z.object({
    mainnet: z.boolean(),
    testnet: z.boolean(),
    production: z.boolean(),
    bridgeReady: z.boolean().optional(),
    onchainZk: z.boolean().optional()
  }),
  artifactDiscovery: z.object({
    source: z.string()
  }).optional()
});

export type EvidencePackage = z.infer<typeof EvidencePackageSchema>;

export const ObservedTransactionSchema = z.object({
  txId: z.string(),
  amount: z.string(),
  fee: z.string().optional()
});

export const ObservedUtxoSchema = z.object({
  txId: z.string(),
  index: z.number(),
  amount: z.string()
});

export const AddressObservationSchema = BaseArtifactSchema.extend({
  schema: z.literal(HardkasSchemas.AddressObservationV1),
  type: z.literal("address_observation"),
  execution: z.object({
    mode: executionModeSchema,
    network: kaspaNetworkIdSchema
  }),
  address: z.string(),
  mempool: z.object({
    incoming: z.array(ObservedTransactionSchema),
    outgoing: z.array(ObservedTransactionSchema)
  }),
  utxos: z.array(ObservedUtxoSchema),
  totals: z.object({
    mempoolIncomingSompi: z.string(),
    acceptedUtxoSompi: z.string()
  }),
  virtual: z.object({
    daaScore: z.string().optional()
  }),
  observedAt: z.string().datetime()
});
