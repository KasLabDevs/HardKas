import { z } from "zod";
import {
  kaspaNetworkIdSchema,
  executionModeSchema,
  artifactTypeSchema
} from "@hardkas/core";

export const ARTIFACT_VERSION = "1.0.0-alpha";

export type DraftArtifact<TFinal, THashFields extends keyof TFinal> = Omit<
  TFinal,
  THashFields
> &
  Partial<Pick<TFinal, THashFields>>;

export const ArtifactLineageSchema = z.object({
  artifactId: z.string(),
  lineageId: z.string(),
  parentArtifactId: z.string().optional(),
  rootArtifactId: z.string(),
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
  scriptMetadata: ScriptMetadataSchema.optional()
});

export const AccountRefSchema = z.object({
  address: z.string(),
  accountName: z.string().optional(),
  input: z.string().optional()
});

export const PolicySchema = BaseArtifactSchema.extend({
  schema: z.literal("hardkas.policy.v1"),
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
  schema: z.literal("hardkas.networkProfile.v1"),
  networkProfileId: z.string(),
  layer: z.string(),
  capabilities: z.record(z.any())
});

export const AssumptionSchema = BaseArtifactSchema.extend({
  schema: z.literal("hardkas.assumption.v1"),
  settlement: z.string().optional(),
  securityModel: z.string().optional(),
  bridgePhase: z.string().optional(),
  exitModel: z.string().optional(),
  customAssumptions: z.record(z.any()).optional()
});

export const MigrationReceiptSchema = BaseArtifactSchema.extend({
  schema: z.literal("hardkas.migrationReceipt.v1"),
  oldHash: z.string(),
  newHash: z.string(),
  fromSchema: z.string(),
  toSchema: z.string(),
  migrationId: z.string(),
  migrationVersion: z.string().optional(),
  decision: z.literal("MIGRATED_WITH_PROOF")
});

export const TxPlanSchema = BaseArtifactSchema.extend({
  schema: z.literal("hardkas.txPlan"),
  networkId: kaspaNetworkIdSchema,
  mode: executionModeSchema,
  planId: z.string(),
  from: AccountRefSchema,
  to: AccountRefSchema,
  amountSompi: z.string(),
  estimatedFeeSompi: z.string(),
  estimatedMass: z.string(),
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
      isCoinbase: z.boolean().optional()
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
  schema: z.literal("hardkas.snapshot"),
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

export const TxReceiptSchema = BaseArtifactSchema.extend({
  schema: z.literal("hardkas.txReceipt"),
  txId: z.string(),
  status: z.enum(["pending", "submitted", "accepted", "confirmed", "failed"]),
  mode: executionModeSchema,
  networkId: kaspaNetworkIdSchema,
  from: AccountRefSchema,
  to: AccountRefSchema,
  amountSompi: z.string(),
  feeSompi: z.string(),
  mass: z.string().optional(),
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

export const SignatureEntrySchema = z.object({
  signer: z.string(),
  signature: z.string()
});

export const SignatureMetadataEntrySchema = z.object({
  signer: z.string(),
  signedAt: z.string().datetime()
});

export const SignedTxSchema = BaseArtifactSchema.extend({
  schema: z.literal("hardkas.signedTx"),
  status: z.enum(["partially_signed", "signed"]),
  signedId: z.string(),
  sourcePlanId: z.string(),
  networkId: kaspaNetworkIdSchema,
  mode: executionModeSchema,
  from: AccountRefSchema,
  to: AccountRefSchema,
  amountSompi: z.string(),
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

export const TxTraceSchema = BaseArtifactSchema.extend({
  schema: z.literal("hardkas.txTrace"),
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
  schema: z.literal("hardkas.workflow.v1"),
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
  schema: z.literal("hardkas.silver.compile"),
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
  schema: z.literal("hardkas.silver.deployPlan"),
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
  schema: z.literal("hardkas.silver.deploy"),
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
  schema: z.literal("hardkas.silver.spendPlan"),
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
  expectedOutputs: z.array(z.object({
    address: z.string(),
    amountSompi: z.string(),
    scriptHash: z.string().optional()
  })),
  networkId: kaspaNetworkIdSchema,
  assumptionLevel: z.string().optional()
});

export type SilverSpendPlanArtifact = z.infer<typeof SilverSpendPlanArtifactSchema>;

export const SilverSpendReceiptArtifactSchema = BaseArtifactSchema.extend({
  schema: z.literal("hardkas.silver.spendReceipt"),
  spendPlanHash: z.string(),
  deployArtifactHash: z.string().optional(),
  redeemScriptHash: z.string().optional(),
  lockingScriptHex: z.string().optional(),
  signatureScriptHex: z.string().optional(),
  spentOutpoint: z.object({
    transactionId: z.string(),
    index: z.number()
  }).optional(),
  expectedOutputs: z.array(z.object({
    address: z.string(),
    amountSompi: z.string(),
    scriptHash: z.string().optional()
  })).optional(),
  txId: z.string(),
  status: z.enum(["simulated", "submitted", "accepted", "rejected"])
});

export type SilverSpendReceiptArtifact = z.infer<typeof SilverSpendReceiptArtifactSchema>;

export const SilverDeploySimulationArtifactSchema = BaseArtifactSchema.extend({
  schema: z.literal("hardkas.silver.deploySimulation"),
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

export type SilverDeploySimulationArtifact = z.infer<typeof SilverDeploySimulationArtifactSchema>;

export const SilverSpendSimulationArtifactSchema = BaseArtifactSchema.extend({
  schema: z.literal("hardkas.silver.spendSimulation"),
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
  expectedOutputs: z.array(z.object({
    address: z.string(),
    amountSompi: z.string(),
    scriptHash: z.string().optional()
  })),
  feeSompi: z.string(),
  status: z.literal("SIMULATED_ACCEPTED")
});

export type SilverSpendSimulationArtifact = z.infer<typeof SilverSpendSimulationArtifactSchema>;

export const SilverTestArtifactSchema = BaseArtifactSchema.extend({
  schema: z.literal("hardkas.silver.test"),
  compileArtifactHash: z.string(),
  sourceHash: z.string(),
  compiledScriptHash: z.string(),
  testVectorsHash: z.string().optional().nullable(),
  compilerName: z.string(),
  compilerVersion: z.string(),
  results: z.array(z.object({
    name: z.string(),
    status: z.enum(["PASS", "FAIL", "SKIPPED", "EXPECTED_COMPILER_FAILURE", "PARTIAL_TEST_VECTOR_SUPPORT"]),
    reason: z.string().optional()
  })),
  status: z.enum([
    "PASS", 
    "FAIL", 
    "PARTIAL_TEST_VECTOR_SUPPORT", 
    "EXPECTED_COMPILER_FAILURE"
  ])
});

export type SilverTestArtifact = z.infer<typeof SilverTestArtifactSchema>;
