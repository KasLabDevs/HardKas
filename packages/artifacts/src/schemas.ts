import { z } from "zod";
import { kaspaNetworkIdSchema, executionModeSchema, artifactTypeSchema } from "@hardkas/core";

export const ARTIFACT_VERSION = "1.0.0-alpha";

export const ArtifactLineageSchema = z.object({
  artifactId: z.string(),
  lineageId: z.string(),
  parentArtifactId: z.string().optional(),
  rootArtifactId: z.string(),
  sequence: z.number().optional()
});

export const BaseArtifactSchema = z.object({
  schema: z.string(),
  hardkasVersion: z.string(),
  version: z.literal(ARTIFACT_VERSION),
  networkId: kaspaNetworkIdSchema,
  mode: executionModeSchema,
  contentHash: z.string().optional(),
  createdAt: z.string().datetime(),
  lineage: ArtifactLineageSchema.optional()
});

export const AccountRefSchema = z.object({
  address: z.string(),
  accountName: z.string().optional(),
  input: z.string().optional()
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
  inputs: z.array(z.object({
    outpoint: z.object({
      transactionId: z.string(),
      index: z.number()
    }),
    amountSompi: z.string()
  })),
  outputs: z.array(z.object({
    address: z.string(),
    amountSompi: z.string()
  })),
  change: z.object({
    address: z.string(),
    amountSompi: z.string()
  }).optional(),
  rpcUrl: z.string().optional()
});

export const DagContextSchema = z.object({
  mode: z.enum(["linear", "dag-light"]),
  sink: z.string(),
  selectedParent: z.string().optional(),
  branchId: z.string().optional(),
  acceptedTxIds: z.array(z.string()).optional(),
  displacedTxIds: z.array(z.string()).optional(),
  conflictSet: z.array(z.object({
    outpoint: z.string(),
    winnerTxId: z.string(),
    loserTxIds: z.array(z.string())
  })).optional(),
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
  accounts: z.array(z.object({
    name: z.string(),
    address: z.string()
  })),
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
  metadata: z.any().optional()
});

export const SignedTxSchema = BaseArtifactSchema.extend({
  schema: z.literal("hardkas.signedTx"),
  status: z.literal("signed"),
  signedId: z.string(),
  sourcePlanId: z.string(),
  networkId: kaspaNetworkIdSchema,
  mode: executionModeSchema,
  from: AccountRefSchema,
  to: AccountRefSchema,
  amountSompi: z.string(),
  signedTransaction: z.object({
    format: z.string(),
    payload: z.string()
  }),
  txId: z.string().optional(),
  metadata: z.any().optional()
});

export const TxTraceSchema = BaseArtifactSchema.extend({
  schema: z.literal("hardkas.txTrace"),
  txId: z.string(),
  networkId: kaspaNetworkIdSchema,
  mode: executionModeSchema,
  steps: z.array(z.object({
    phase: z.string(),
    status: z.string(),
    timestamp: z.string().datetime(),
    details: z.any().optional()
  })),
  dagContext: DagContextSchema.optional()
});

export type TxPlan = z.infer<typeof TxPlanSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type TxReceipt = z.infer<typeof TxReceiptSchema>;
export type SignedTx = z.infer<typeof SignedTxSchema>;
export type TxTrace = z.infer<typeof TxTraceSchema>;
export type DagContext = z.infer<typeof DagContextSchema>;
