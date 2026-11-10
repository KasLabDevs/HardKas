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

// F1.1 · v1 plan fields (all optional: a v0 plan carries none of them, so its content hash does not change).
// silverscript-abi {kind, value} arguments with ints as decimal strings, or a signer slot filled only at signing time.
export const V1ArgValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("int"), value: z.string().regex(/^-?(0|[1-9]\d*)$/) }).strict(),
    z.object({ kind: z.literal("bool"), value: z.boolean() }).strict(),
    z.object({ kind: z.literal("byte"), value: z.number().int().min(0).max(255) }).strict(),
    z.object({ kind: z.literal("bytes"), value: z.array(z.number().int().min(0).max(255)) }).strict(),
    z.object({ kind: z.literal("text"), value: z.string() }).strict(),
    z.object({ kind: z.literal("array"), value: z.array(V1ArgValueSchema) }).strict(),
    z.object({ kind: z.literal("object"), value: z.record(V1ArgValueSchema) }).strict(),
    z.object({ kind: z.literal("signer"), signer: z.string().min(1) }).strict()
  ])
);
const Hex64Schema = z.string().regex(/^[0-9a-f]{64}$/);
const V1CompileRecordRefSchema = z.object({ contentHash: Hex64Schema, artifactSha256: Hex64Schema, path: z.string().optional() }).strict();
export const V1CompiledContractSchema = z
  .object({ compileRecord: V1CompileRecordRefSchema, contract: z.string().min(1), constructorArgs: z.array(V1ArgValueSchema) })
  .strict();
export const V1ContractRefSchema = z
  .object({
    compileRecord: V1CompileRecordRefSchema,
    contract: z.string().min(1),
    constructorArgs: z.array(V1ArgValueSchema),
    // F1 phase 2: the State of the spent UTXO, when it is not the compile record's own
    state: z.record(V1ArgValueSchema).optional(),
    entry: z.string().min(1),
    policy: z.string().min(1).optional(),
    args: z.array(V1ArgValueSchema)
  })
  .strict();
export const V1NextStateSchema = z.union([
  z
    .object({
      covenantId: Hex64Schema,
      input: z.number().int().min(0),
      outputs: z.array(z.number().int().min(0)),
      successor: z
        .object({
          artifactSha256: Hex64Schema,
          constructorArgs: z.array(V1ArgValueSchema),
          stateToConstructorArg: z.record(z.number().int().min(0)),
          state: z.record(V1ArgValueSchema)
        })
        .strict()
    })
    .strict(),
  // F1 phase 2: one State per continuation, encoded into the contract's template
  z
    .object({
      covenantId: Hex64Schema,
      input: z.number().int().min(0),
      outputs: z.array(z.number().int().min(0)),
      states: z.array(z.record(V1ArgValueSchema))
    })
    .strict()
]);

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
      lane: z.string().optional(),
      // F1.1 · v1 inputs
      kind: z.enum(["p2pk", "p2sh", "covenant"]).optional(),
      computeBudget: z.number().int().min(0).max(0xffff).optional(),
      contract: V1ContractRefSchema.optional(),
      signer: z.string().min(1).optional(),
      // V1-ENGINE-2 · a relative time lock's input sequence (u64, decimal); absent = 0
      sequence: z.string().regex(/^\d{1,20}$/).optional()
    })
  ),
  outputs: z.array(
    z.object({
      address: z.string(),
      amountSompi: z.string(),
      // a continuation binding (v1); legacy payment plans wrote a genesis marker without covenantId
      covenant: z.object({ authorizingInput: z.number().int().min(0), covenantId: z.string().optional() }).optional(),
      role: z.enum(["change", "payment"]).optional()
    })
  ),
  change: z
    .object({
      address: z.string(),
      amountSompi: z.string()
    })
    .optional(),
  // F1.1 · v1 plan fields
  genesisCovenantGroups: z
    .array(
      z.object({
        authorizingInput: z.number().int().min(0),
        outputs: z.array(z.number().int().min(0)),
        contract: V1CompiledContractSchema.optional(),
        covenantId: Hex64Schema.optional(),
        // F1 phase 2: the State each output starts with (encoded into the contract's template), in output order
        states: z.array(z.record(V1ArgValueSchema)).optional()
      })
    )
    .optional(),
  payload: z.string().regex(/^(?:[0-9a-f]{2})*$/).optional(),
  covenantOutpoints: z.array(z.string().regex(/^[0-9a-f]{64}:\d+$/)).optional(),
  nextState: z.array(V1NextStateSchema).optional(),
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
  // HARDKAS_V1_PLANNER: v1 plans (F1.1): kaspa-wasm 2.1.0's Generator builds only v0, so HardKAS plans v1 itself
  plannerAuthority: z.enum(["KASPA_WASM_GENERATOR", "SYNTHETIC_SIMULATOR", "HARDKAS_V1_PLANNER"]).optional(),
  plannerAuthorityDetail: z.string().optional(),
  // TX-FEE-GUARD-1: the total fee limit (sompi) the plan was made under; enforced again at sign and send
  maxFeeSompi: z.string().regex(/^\d+$/).optional()
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
   * TX-SEND-SUBMITPOINT-1: why there is no `submitPoint` — the chain position could not be read before the submit. Never
   * written together with `submitPoint`; never a substitute point.
   */
  submitPointUnavailable: z.object({ reason: z.string().min(1) }).optional(),
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
    .optional(),
  /**
   * F1.6 · the covenant outpoints a v1 send spends, each with the covenant id its verified plan gives it and the address
   * the node lists it at: how a pending transition of a covenant is found. Written by v1 sends only.
   */
  covenantSpends: z
    .array(
      z
        .object({
          outpoint: z.string().regex(/^[0-9a-f]{64}:\d+$/),
          covenantId: z.string().regex(/^[0-9a-f]{64}$/),
          address: z.string().min(1)
        })
        .strict()
    )
    .optional(),
  /**
   * F1.6 · the read-only check a v1 send made just before the broadcast (PAYMENT-PREFLIGHT-1: or a payment sent with its
   * opt-in preflight, which also verifies each input's signature): the node's virtual DAA score at the check, how many
   * inputs it read, and its guarantee, which says what was checked (this node only; absence from its mempool proves no
   * absence on the network).
   */
  preflight: z
    .object({
      observedAtDaaScore: z.string().regex(/^\d+$/).optional(),
      inputs: z.number().int().positive(),
      scope: z.literal("observer-local"),
      guarantee: z.string().min(1)
    })
    .strict()
    .optional(),
  /** F1.6 · the pending transitions of the same covenant this send replaced, by explicit request (their artifactIds). */
  replaces: z.array(z.string().regex(/^[0-9a-f]{64}$/)).optional()
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
  z.object({
    type: z.literal("mempool_entry"),
    isOrphan: z.boolean(),
    feeSompi: decimalString.optional(),
    /**
     * MEMPOOL-CHAIN-PRECEDENCE-FIX-1: the chain window the same look read (absent in historical observations and when
     * the node served no batch). `scannedTo` is the last chain block read — the next cursor; `scanComplete` is false when
     * the scan stopped before the node's selected-chain tip.
     */
    scannedFrom: z.string().optional(),
    scannedTo: z.string().optional(),
    scannedChainBlocks: z.number().int().nonnegative().optional(),
    scanComplete: z.boolean().optional()
  }),
  z.object({ type: z.literal("mempool_absent") }),
  z.object({
    type: z.literal("chain_accepted"),
    acceptingBlockHash: z.string(),
    acceptingBlueScore: decimalString,
    acceptingDaaScore: decimalString.optional(),
    confirmationsBlue: decimalString,
    confirmationsDaa: decimalString.optional(),
    /**
     * The block this observer previously saw accepting the transaction, which the SAME node answer
     * reported off the selected chain: the acceptance moved to `acceptingBlockHash`, it was not lost.
     */
    removedAcceptingBlockHash: z.string().optional()
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
  // EVIDENCE-DIFF-REDACTION-1: present on reports whose receipt was compared raw; absent on legacy (masked) ones
  receiptComparison: z.literal("raw").optional(),
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

// Legacy SilverScript artifacts, from SilverCompile to SilverTest below: read
// compatibility only. Nothing produces them any more (the legacy Silver commands
// and the Silver simulator are gone); they stay so historical artifacts still
// verify. Removing them needs an explicit migration decision.
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
const SilverNodeRefSchema = z
  .object({
    // HK-01: a Silver record names the node that accepted it; only a verified rusty-kaspad can. Records written before
    // the field existed have no `kind` and stay readable; a simulator or unverified kind is refused.
    kind: z.literal("rusty-kaspad").optional(),
    verified: z.literal(true),
    container: z.string().optional(),
    // CA-TX-04: the OBSERVED image digest; `expectedImageDigest` is the pin it was checked against. Required for a node
    // proven by its container (the default, and every record written before `verification` existed).
    imageDigest: z.string().optional(),
    expectedImageDigest: z.string().optional(),
    serverVersion: z.string().optional(),
    // L1-CORE-1 B3: how the node was proven. `endpoint`: a node HardKAS does not manage, proven by what it reported
    // (network, version, synced, not the simulator); no container was inspected, so it has no container or digest.
    verification: z.enum(["container", "endpoint"]).optional(),
    network: z.string().optional(),
    // INT9-A: the sync state the node reported when the command proved it (a record is written only after the node said
    // it was synced, so a stored record says "synced"; records written before the field existed have none: unknown, never
    // assumed), and the endpoint asked (credentials redacted)
    sync: z.literal("synced").optional(),
    endpoint: z.string().optional()
  })
  .superRefine((node, ctx) => {
    if (node.verification === "endpoint") {
      for (const field of ["container", "imageDigest", "expectedImageDigest"] as const) {
        if (node[field] !== undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "a node proven by its endpoint was not inspected as a container" });
        }
      }
    } else if (node.imageDigest === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["imageDigest"], message: "Required" });
    }
  });
/**
 * INT9-A (I-1): the networks a Silver record can name. Deploy, spend and covenant records name the network they ran
 * on: simnet, devnet (an own `rusty-kaspad --devnet`, proven by its endpoint), or testnet-<n> behind the payments'
 * opt-in (it was simnet and testnet-<n> only: a devnet run was sent and its record then failed `artifact verify`).
 * `mainnet` is accepted ONLY so a record can be read and its integrity verified offline: no HardKAS command writes one
 * (Silver is refused on mainnet) and `artifact verify` never contacts a mainnet node. `simulated` is never a Silver
 * network: HardKAS has no Silver simulator, and a Silver record must name a verified rusty-kaspad.
 */
export const SilverRecordNetworkIdSchema = z.union([z.literal("simnet"), z.literal("devnet"), z.string().regex(/^testnet-\d+$/), z.literal("mainnet")]);

const SilverRecordBaseSchema = BaseArtifactSchema.extend({
  networkId: SilverRecordNetworkIdSchema,
  // v4 records carry `artifactId`; v5 records must not (IC-7.3, FORBIDDEN_IDENTITY_FIELD),
  // so requiring it rejected every record `hardkas silver` produces (first contact · E07).
  artifactId: z.string().optional(),
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
  // HARDKAS-NETWORK-PORTABILITY-1 (C7): a compile record names the network its P2SH addresses are for (compilation does
  // not depend on it). INT9-A: the same networks as the on-chain records, so the compile record a mainnet record names
  // can be verified offline too; `silver compile` still refuses mainnet.
  networkId: SilverRecordNetworkIdSchema,
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

// `hardkas silver test`: the SilverScript runner's verdicts on synthetic
// scenario transactions. Contract execution only, never transaction validity or
// node evidence: its mode is "vm", never "localnet", and it claims no capability.
// The runner's output can print argument values, so results carry its digest.
// F3 (H-B4): "official-vm-scenario" only from a VERIFIED runner; a run of an
// UNVERIFIED local build (today every runner) is "unverified-vm-scenario", with
// runner.trust "UNVERIFIED". Records written before runner.trust existed carry no
// trust and were all UNVERIFIED runs.
export const SilverVmTestV1Schema = BaseArtifactSchema.omit({ mode: true }).extend({
  schema: z.literal(HardkasSchemas.SilverVmTestV1),
  mode: z.literal("vm"),
  networkId: z.literal("simnet"),
  evidence: z.enum(["official-vm-scenario", "unverified-vm-scenario"]),
  scope: z.string(),
  compileRecord: SilverRecordRefSchema,
  contract: z.string(),
  runner: z.object({
    binarySha256: Hex64,
    size: z.number().int().positive(),
    provenance: z.literal("unmanaged-local-build"),
    trust: z.enum(["VERIFIED", "UNVERIFIED"]).optional(),
    // R-08: where the runner was found and, for an UNVERIFIED one, which opt-in let it run (records since R-08)
    source: z.enum(["explicit-path", "env", "home-toolchains"]).optional(),
    trustOptIn: z.enum(["flag", "environment"]).optional(),
    expectedSource: z.object({ repository: z.string(), releaseTag: z.string(), commit: z.string(), package: z.literal("cli-debugger") })
  }),
  testFile: z.object({ path: z.string(), sha256: Hex64 }),
  runnerInputSha256: Hex64,
  results: z
    .array(
      z.object({
        name: z.string(),
        function: z.string(),
        expect: z.enum(["pass", "fail"]),
        outcome: z.enum(["PASS", "FAIL"]),
        runnerStatus: z.string().nullable(),
        exitCode: z.number().int(),
        signedArgs: z.number().int().nonnegative(),
        outputSha256: Hex64
      })
    )
    .min(1),
  summary: z.object({ total: z.number().int().positive(), passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative() }),
  status: z.enum(["PASS", "FAIL"])
});

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
  // ESCALÓN 2 · P10: a per-artifact result carries what it says of that artifact, never the product's claims
  artifactEvidence: z.object({
    realNodeEvidence: z.literal("NOT_ESTABLISHED"),
    reason: z.string(),
    productClaims: z.literal("hardkas programmability capabilities")
  }),
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
  // ESCALÓN 2 · P10: a per-artifact result carries what it says of that artifact, never the product's claims
  artifactEvidence: z.object({
    realNodeEvidence: z.literal("NOT_ESTABLISHED"),
    reason: z.string(),
    productClaims: z.literal("hardkas programmability capabilities")
  }),
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
  // TASK-EVIDENCE-UNBOUND-1: what a package of this run may be presented as (absent on scenario results sealed before it)
  evidenceClaim: z
    .union([
      z.object({ kind: z.literal("none") }),
      z.object({ kind: z.literal("artifacts") }),
      z.object({
        kind: z.literal("payment"),
        payments: z.array(z.object({ txId: z.string(), submissionArtifactId: z.string() })).min(1)
      })
    ])
    .optional(),
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


// --- Zero-Knowledge (ZK) Artifact & Fixture Schemas ---

/** A canonical non-negative decimal (no sign, no leading zeros, no hex): the only accepted field-element encoding. */
export const ZkCanonicalDecimalSchema = z.string().regex(/^(0|[1-9][0-9]*)$/, "canonical decimal expected");
/** Projective G1 point exactly as snarkjs serialises it: [x, y, z]. */
export const ZkG1PointSchema = z.tuple([ZkCanonicalDecimalSchema, ZkCanonicalDecimalSchema, ZkCanonicalDecimalSchema]);
/** Projective G2 point: three rows of two Fp elements. */
export const ZkG2PointSchema = z.tuple([
  z.tuple([ZkCanonicalDecimalSchema, ZkCanonicalDecimalSchema]),
  z.tuple([ZkCanonicalDecimalSchema, ZkCanonicalDecimalSchema]),
  z.tuple([ZkCanonicalDecimalSchema, ZkCanonicalDecimalSchema])
]);
export const ZkSha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

// Strict objects: unknown keys are rejected, so the digest of a proof/key/inputs object covers exactly
// the fields the verifier reads (Phase 3 remediation, L-01). It does NOT identify a proof uniquely: a
// Groth16 proof can be re-randomised into infinitely many valid proofs of the same statement, and the
// projective schema below admits several encodings of one point (the verifier rejects every encoding but
// the canonical one, ZK-12 / CA-ZK-02). Identify a verification key by its fingerprint over its points.
export const ZkGroth16ProofSchema = z
  .object({
    schema: z.literal(HardkasSchemas.ZkGroth16ProofV1),
    protocol: z.literal("groth16"),
    curve: z.string().min(1),
    proofId: z.string().min(1),
    publicInputsHash: ZkSha256HexSchema.optional(),
    verificationKeyHash: ZkSha256HexSchema.optional(),
    pi_a: ZkG1PointSchema,
    pi_b: ZkG2PointSchema,
    pi_c: ZkG1PointSchema,
    note: z.string().optional()
  })
  .strict();

export const ZkGroth16VerificationKeySchema = z
  .object({
    schema: z.literal(HardkasSchemas.ZkGroth16VerificationKeyV1),
    protocol: z.literal("groth16"),
    curve: z.string().min(1),
    verificationKeyId: z.string().min(1),
    statementHash: ZkSha256HexSchema.optional(),
    nPublic: z.number().int().nonnegative().optional(),
    vk_alpha_1: ZkG1PointSchema.optional(),
    vk_beta_2: ZkG2PointSchema.optional(),
    vk_gamma_2: ZkG2PointSchema.optional(),
    vk_delta_2: ZkG2PointSchema.optional(),
    vk_alphabeta_12: z.array(z.any()).optional(),
    IC: z.array(ZkG1PointSchema).optional(),
    note: z.string().optional()
  })
  .strict();

export const ZkGroth16PublicInputsSchema = z
  .object({
    schema: z.literal(HardkasSchemas.ZkGroth16PublicInputsV1),
    statement: z.string().optional(),
    publicSignals: z.array(ZkCanonicalDecimalSchema),
    statementHash: ZkSha256HexSchema.optional()
  })
  .strict();

export const ZkGroth16FixtureSchema = z.object({
  schema: z.literal(HardkasSchemas.ZkGroth16FixtureV1),
  proofSystem: z.literal("groth16"),
  curve: z.string(),
  verifierAdapter: z.string(),
  proof: z.string(),
  publicInputs: z.string(),
  verificationKey: z.string(),
  verifierMetadata: z.string().optional(),
  verifyReport: z.string().optional(),
  contentHashes: z.record(z.string()),
  expectedStatus: z.string(),
  claims: z.record(z.string())
});

export const ZkRisc0ReceiptSchema = z.object({
  schema: z.literal(HardkasSchemas.ZkRisc0ReceiptV1),
  encoding: z.string(),
  receiptId: z.string().min(1),
  journalHash: z.string().optional(),
  imageIdHash: z.string().optional(),
  note: z.string().optional()
});

export const ZkRisc0FixtureSchema = z.object({
  schema: z.literal(HardkasSchemas.ZkRisc0FixtureV1),
  proofSystem: z.literal("risc0"),
  verifierAdapter: z.string(),
  receipt: z.string(),
  journal: z.string(),
  imageId: z.string(),
  verifyReport: z.string().optional(),
  contentHashes: z.record(z.string()),
  expectedStatus: z.string(),
  claims: z.record(z.string())
});

export const ZkCorpusFixtureEntrySchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  expectedStatus: z.string().min(1),
  /** Required when the fixture claims a cryptographicVerification: the status `verify-math` must produce. */
  expectedMathStatus: z.string().min(1).optional(),
  /** Only for TOY fixtures whose verification key has a known trapdoor; honoured only for a key pinned in code as such. */
  allowWeakVerificationKey: z.boolean().optional(),
  /** Id of the in-code pinned verification key (PINNED_GROTH16_VERIFICATION_KEYS) the fixture must use. */
  pinnedVerificationKeyId: z.string().min(1).optional()
});

export const ZkCorpusSchema = z.object({
  schema: z.literal(HardkasSchemas.ZkCorpusV1),
  version: z.string(),
  network: z.string(),
  profile: z.string(),
  experimental: z.literal(true),
  proofSystems: z.array(z.string()),
  expectedKnownLimitations: z.array(z.string()),
  claims: z.record(z.string()),
  fixtures: z.array(ZkCorpusFixtureEntrySchema)
});

export const ZkProofMathVerificationSchema = z.object({
  schema: z.literal(HardkasSchemas.ZkProofMathVerificationV1),
  path: z.string(),
  proofSystem: z.literal("groth16"),
  engine: z.literal("snarkjs-bn254"),
  curve: z.string(),
  status: z.enum([
    "ZK_GROTH16_MATH_VERIFIED",
    "ZK_GROTH16_MATH_VALID_UNANCHORED_VK",
    "ZK_GROTH16_MATH_REJECTED",
    "ZK_GROTH16_VERIFIER_ERROR"
  ]),
  verified: z.boolean(),
  durationMs: z.number().nonnegative(),
  experimental: z.literal(true),
  summary: z.object({
    proofSystem: z.string(),
    curve: z.string(),
    publicSignals: z.array(z.string()),
    mathCheck: z.enum(["PASS", "FAIL", "ERROR"]),
    verificationKeyHash: z.string(),
    verificationKeyFingerprint: z.string(),
    verificationKeyAnchor: z.enum(["CALLER_PIN", "PINNED_REGISTRY", "UNANCHORED"]),
    pinnedVerificationKeyId: z.string().optional(),
    publicInputsHash: z.string(),
    proofHash: z.string(),
    verificationKeyStrength: z.enum(["NO_KNOWN_WEAKNESS", "WEAK_TRAPDOOR_SUSPECTED"]),
    /** Fixture coherence is SELF-ATTESTED (unkeyed digests in the same directory): never an anchor. */
    binding: z.enum(["FIXTURE_COHERENCE_SELF_ATTESTED", "MATH_ONLY"])
  }),
  claims: z.record(z.string()),
  issues: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      file: z.string().optional()
    })
  )
});

export const ZkToccataScriptsSchema = z.object({
  schema: z.literal(HardkasSchemas.ZkToccataScriptsV1),
  imageId: z.string().regex(/^[0-9a-fA-F]{64}$/),
  journalHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
  redeemScript: z.string().min(1),
  sigScript: z.string().min(1),
  fullSignatureScript: z.string().min(1),
  preparedProof: z.string().regex(/^[0-9a-fA-F]{256}$/),
  redeemScriptHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
  p2shScriptPublicKey: z.object({
    version: z.number().int(),
    script: z.string()
  }),
  /** testnet10 / mainnet only on explicit, acknowledged request, never for a public test vector (HK-16). */
  p2shAddresses: z.object({
    simnet: z.string(),
    testnet10: z.string().optional(),
    mainnet: z.string().optional()
  }),
  authorizationModel: z.literal("IMAGE_ID_ONLY").optional(),
  receiptClaimCrossCheck: z.enum(["MATCH", "NOT_CHECKED"]).optional(),
  receiptClaimDigest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  precompileOpcode: z.literal("0xa6"),
  provingSystemTag: z.literal("0x20"),
  bindingMode: z.enum(["proof-only", "proof-and-output-bound"]).optional(),
  consensusEnforced: z.boolean().optional(),
  boundPayoutAddress: z.string().optional(),
  boundPayoutAmount: z.string().optional(),
  bindingPolicy: z
    .object({
      mode: z.enum(["proof-only", "proof-and-output-bound"]),
      payout: z.object({
        address: z.string(),
        amountSompi: z.string()
      }),
      change: z
        .object({
          address: z.string(),
          amountSompi: z.string()
        })
        .optional(),
      utxoBinding: z
        .object({
          transactionId: z.string(),
          index: z.number().int()
        })
        .optional()
    })
    .optional(),
  experimental: z.literal(true),
  warnings: z
    .array(z.object({ code: z.string(), message: z.string(), file: z.string().optional() }))
    .optional()
});

export const ZkToccataTxSchema = z.object({
  schema: z.literal(HardkasSchemas.ZkToccataTxV1),
  txVersion: z.literal(1),
  computeBudget: z.number().int().positive(),
  storageMass: z.string(),
  transactionId: z.string().regex(/^[0-9a-fA-F]{64}$/),
  mass: z.string(),
  standardMaxMass: z.string(),
  withinStandardMaxMass: z.boolean(),
  destinationAddress: z.string(),
  feeSompi: z.string(),
  bindingMode: z.enum(["proof-only", "proof-and-output-bound"]).optional(),
  consensusEnforced: z.boolean().optional(),
  experimental: z.literal(true)
});

/**
 * Evidence of ONE run against ONE real node raised by the simnet harness. It records what the node
 * answered, including failures: nothing in this schema can only express success, and it carries no
 * score or maturity claim (Phase 3 remediation, L-07).
 */
export const ZkExecutionEvidenceSchema = z.object({
  schema: z.literal(HardkasSchemas.ZkExecutionEvidenceV1),
  networkId: z.enum(["simnet", "testnet-10"]),
  node: z.object({
    rpcUrl: z.string(),
    serverVersion: z.string(),
    /** How the node was obtained: only harness-managed nodes are acceptable evidence sources. */
    source: z.enum(["simnet-harness", "external"]),
    harnessRunId: z.string().optional()
  }),
  precompile: z.object({
    opcode: z.literal("0xa6"),
    opcodeName: z.literal("OpZkPrecompile"),
    tag: z.literal("0x20"),
    curve: z.literal("BN254"),
    provingSystem: z.literal("Groth16")
  }),
  guestSystem: z.literal("RISC Zero"),
  imageId: z.string().regex(/^[0-9a-f]{64}$/),
  journalHash: z.string().regex(/^[0-9a-f]{64}$/),
  p2shAddress: z.string(),
  redeemScriptHash: z.string(),
  funding: z.object({
    txId: z.string(),
    outputIndex: z.number().int().nonnegative(),
    amountSompi: z.string(),
    accepted: z.boolean(),
    utxoObserved: z.boolean()
  }),
  spend: z.object({
    txId: z.string().optional(),
    computeBudget: z.number().int().nonnegative(),
    feeSompi: z.string(),
    payoutAddress: z.string(),
    payoutSompi: z.string(),
    accepted: z.boolean(),
    payoutUtxoObserved: z.boolean(),
    blockDaaScore: z.string().optional(),
    rawError: z.string().optional()
  }),
  negativeCases: z.array(
    z.object({
      testCase: z.string(),
      rejected: z.boolean(),
      rawError: z.string().optional(),
      expectedPattern: z.string(),
      matchedExpectedPattern: z.boolean()
    })
  ),
  outcome: z.enum(["ALL_AS_EXPECTED", "DEVIATIONS"]),
  timestamp: z.string(),
  notes: z.array(z.string()).optional()
});

export type ZkGroth16ProofType = z.infer<typeof ZkGroth16ProofSchema>;
export type ZkGroth16VerificationKeyType = z.infer<typeof ZkGroth16VerificationKeySchema>;
export type ZkGroth16PublicInputsType = z.infer<typeof ZkGroth16PublicInputsSchema>;
export type ZkGroth16FixtureType = z.infer<typeof ZkGroth16FixtureSchema>;
export type ZkRisc0ReceiptType = z.infer<typeof ZkRisc0ReceiptSchema>;
export type ZkRisc0FixtureType = z.infer<typeof ZkRisc0FixtureSchema>;
export type ZkCorpusType = z.infer<typeof ZkCorpusSchema>;
export type ZkProofMathVerificationType = z.infer<typeof ZkProofMathVerificationSchema>;
export type ZkToccataScriptsType = z.infer<typeof ZkToccataScriptsSchema>;
export type ZkToccataTxType = z.infer<typeof ZkToccataTxSchema>;
export type ZkExecutionEvidenceType = z.infer<typeof ZkExecutionEvidenceSchema>;

/**
 * hardkas.covenantTransitionFact.v1
 * Immutable fact capturing the full context of a covenant transition:
 * identity, contract ABI, entrypoint, state before/after, consumed/successor outpoints,
 * plan, and validation results.
 */
export const CovenantTransitionFactSchema = z.object({
  schema: z.literal(HardkasSchemas.CovenantTransitionFactV1),
  hardkasVersion: z.string(),
  hashVersion: z.union([z.number(), z.string()]),
  networkId: kaspaNetworkIdSchema,
  covenantId: z.string().regex(/^[0-9a-f]{64}$/i),
  contractName: z.string(),
  artifactSha256: z.string(),
  entrypoint: z.string(),
  policy: z.string().optional(),
  previousState: z.record(z.unknown()).optional(),
  nextState: z.record(z.unknown()).optional(),
  spentOutpoint: z.object({
    transactionId: z.string(),
    index: z.number().int().nonnegative()
  }),
  successorOutpoint: z.object({
    transactionId: z.string(),
    index: z.number().int().nonnegative()
  }).optional(),
  successorAmountSompi: z.string().optional(),
  planArtifactId: z.string(),
  draftArtifactId: z.string().optional(),
  txId: z.string().regex(/^[0-9a-f]{64}$/i),
  validation: z.object({
    structuralPassed: z.boolean(),
    scriptVmPassed: z.boolean().optional(),
    vmStatus: z.string().optional(),
    diagnostic: z.string().optional()
  }),
  timestamp: z.string(),
  contentHash: z.string().optional()
});
export type CovenantTransitionFact = z.infer<typeof CovenantTransitionFactSchema>;

/**
 * hardkas.zkVerificationFact.v1
 * Immutable fact capturing the cryptographic verification and transaction lineage
 * of a Zero-Knowledge proof execution on Kaspa Toccata.
 */
export const ZkVerificationFactSchema = z.object({
  schema: z.literal(HardkasSchemas.ZkVerificationFactV1),
  hardkasVersion: z.string(),
  hashVersion: z.union([z.number(), z.string()]),
  networkId: kaspaNetworkIdSchema,
  provingSystem: z.literal("Groth16"),
  curve: z.literal("BN254"),
  guestSystem: z.enum(["RISC Zero", "custom"]),
  imageId: z.string().regex(/^[0-9a-f]{64}$/i),
  journalHash: z.string().regex(/^[0-9a-f]{64}$/i),
  /** SHA-256 of the proof BYTES (the 128-byte compressed proof the signature script pushes). */
  proofSha256: z.string().regex(/^[0-9a-f]{64}$/i),
  verifiedOffChain: z.boolean(),
  /** Who verified, if anyone: NOT_PERFORMED is not a failure; the node's precompile is the verifier of record. */
  offChainVerification: z.enum(["VERIFIED", "NOT_PERFORMED", "FAILED"]).optional(),
  offChainVerifier: z.string().optional(),
  spendUtxo: z.object({
    transactionId: z.string(),
    index: z.number().int().nonnegative(),
    amountSompi: z.string()
  }),
  p2shAddress: z.string(),
  redeemScriptHash: z.string(),
  planArtifactId: z.string().optional(),
  draftArtifactId: z.string().optional(),
  txId: z.string().regex(/^[0-9a-f]{64}$/i),
  payoutAddress: z.string(),
  payoutSompi: z.string(),
  computeBudget: z.number().int().nonnegative(),
  feeSompi: z.string(),
  /** Optional: omitted by default so the fact's identity does not depend on the clock (ZK-09). */
  timestamp: z.string().optional(),
  contentHash: z.string().optional()
});
export type ZkVerificationFact = z.infer<typeof ZkVerificationFactSchema>;
