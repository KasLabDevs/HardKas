import { createHash } from "node:crypto";
import { TxPlan as TxPlanType } from "@hardkas/tx-builder";
import { TxPlan, ARTIFACT_VERSION, DraftArtifact } from "./schemas.js";
import { NetworkId, ExecutionMode } from "@hardkas/core";
import { calculateContentHash, canonicalStringify, CURRENT_HASH_VERSION } from "./canonical.js";
import { HARDKAS_VERSION } from "./constants.js";
import type { RuntimeContext } from "@hardkas/core";
import { HardkasSchemas } from "@hardkas/core";

export interface CreateTxPlanArtifactOptions {
  networkId: NetworkId;
  mode: ExecutionMode;
  from: {
    input: string;
    address: string;
    accountName?: string;
  };
  to: {
    input: string;
    address: string;
  };
  amountSompi: bigint;
  plan: TxPlanType;
  rpcUrl?: string;
  ctx: RuntimeContext;
}

/**
 * Deterministic default `workflowId` for a root plan: a digest of the plan's
 * INTENT (who pays whom, how much, on which network, from which outpoints).
 * It is never derived from the artifact's own hash (IC-1′.5). Domain-digest
 * algorithm pinned to the legacy v4 canonical form until IC-1′.7 introduces the
 * dedicated digest function (Wave 1.3), so its value does not move with the
 * artifact hash version.
 */
export function deriveIntentWorkflowId(intent: {
  networkId: string;
  mode: string;
  fromAddress: string;
  toAddress: string;
  amountSompi: string;
  outpoints: Array<{ transactionId: string; index: number }>;
}): string {
  const digest = createHash("sha256").update(canonicalStringify(intent, 4)).digest("hex");
  return `wf_${digest.slice(0, 16)}`;
}

/**
 * Seals a plan's identity after every authenticated field is in place: one
 * hash, the derived label and the exact-path self reference. Callers that add
 * fields to a plan (policy references, profiles) call this again on the final
 * body; nothing may change afterwards (IC-1′.4).
 */
export function finalizeTxPlanIdentity<T extends { lineage?: { artifactId: string } | undefined }>(
  plan: T & { contentHash?: string | undefined; planId?: string | undefined; hashVersion?: number | string | undefined }
): T & { contentHash: string; planId: string } {
  plan.hashVersion = CURRENT_HASH_VERSION;
  const hash = calculateContentHash(plan, CURRENT_HASH_VERSION);
  plan.contentHash = hash;
  plan.planId = `plan-${hash.slice(0, 16)}`;
  if (plan.lineage) plan.lineage.artifactId = hash;
  return plan as T & { contentHash: string; planId: string };
}

/**
 * Creates a canonical TxPlan artifact from a TxBuilder plan.
 *
 * The plan is a lineage ROOT: its lineage carries only its own artifactId
 * (excluded from the hash by exact path) and a sequence. It stores no
 * `lineageId`/`rootArtifactId` copies of itself; children reference the root's
 * real artifactId instead (Closure Pack D-Q1.d, the two-pass hashing of H6 is gone).
 */
export function createTxPlanArtifact(options: CreateTxPlanArtifactOptions): TxPlan {
  const workflowId =
    options.ctx.workflowId ??
    deriveIntentWorkflowId({
      networkId: String(options.networkId),
      mode: String(options.mode),
      fromAddress: options.from.address,
      toAddress: options.to.address,
      amountSompi: options.amountSompi.toString(),
      outpoints: options.plan.inputs.map((i) => ({ transactionId: i.outpoint.transactionId, index: i.outpoint.index }))
    });

  const artifact: DraftArtifact<TxPlan, "planId" | "contentHash"> = {
    schema: HardkasSchemas.TxPlan,
    hardkasVersion: HARDKAS_VERSION,
    schemaVersion: HardkasSchemas.ArtifactV1,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: new Date(options.ctx.clock.now()).toISOString(),
    networkId: options.networkId,
    mode: options.mode,
    execution: {
      mode: options.mode as any,
      domain: "kaspa-l1",
      network: options.networkId
    },
    from: {
      address: options.from.address,
      accountName: options.from.accountName,
      input: options.from.input
    },
    to: {
      address: options.to.address,
      input: options.to.input
    },
    amountSompi: options.amountSompi.toString(),
    estimatedFeeSompi: options.plan.estimatedFeeSompi.toString(),
    estimatedMass: options.plan.estimatedMass.toString(),
    inputs: options.plan.inputs.map((i) => ({
      outpoint: {
        transactionId: i.outpoint.transactionId,
        index: i.outpoint.index
      },
      amountSompi: i.amountSompi.toString(),
      address: i.address,
      scriptPublicKey: i.scriptPublicKey,
      ...(i.blockDaaScore !== undefined
        ? { blockDaaScore: i.blockDaaScore.toString() }
        : {}),
      ...(i.isCoinbase !== undefined ? { isCoinbase: i.isCoinbase } : {}),
      ...(i.covenantId !== undefined ? { covenantId: i.covenantId } : {}),
      ...(i.lane !== undefined ? { lane: i.lane } : {})
    })),
    outputs: options.plan.outputs.map((o) => ({
      address: o.address,
      amountSompi: o.amountSompi.toString(),
      ...(o.covenant !== undefined ? { covenant: { covenantId: o.covenant.covenantId, authorizingInput: o.covenant.authorizingInput } } : {})
    })),
    rpcUrl: options.rpcUrl,
    lineage: {
      artifactId: "",
      sequence: 1
    },
    workflowId,
    metadata: {
      schema: HardkasSchemas.ArtifactV1,
      ...(options.ctx.utxoSelection ? { utxoSelection: options.ctx.utxoSelection } : {})
    },
    assumptionLevel:
      options.ctx.assumptionLevel ||
      (options.mode === "simulator" ? "local-simulated" : "local-dev"),
    // DEF-7: preserve the planner authority the runtime actually produced.
    // Do NOT synthesize a value: absence stays absence. The upstream planner
    // ('KASPA_WASM_GENERATOR' for real Kaspa execution paths, 'SYNTHETIC_SIMULATOR'
    // for the developer harness) already sets these in the ctx; we only project
    // what was actually established.
    ...(options.ctx.plannerAuthority
      ? { plannerAuthority: options.ctx.plannerAuthority }
      : {}),
    ...(options.ctx.plannerAuthorityDetail
      ? { plannerAuthorityDetail: options.ctx.plannerAuthorityDetail }
      : {}),
    ...(options.plan.computeBudget !== undefined ? { computeBudget: options.plan.computeBudget.toString() } : {}),
    ...(options.plan.storageMass !== undefined ? { storageMass: options.plan.storageMass.toString() } : {}),
    ...(options.plan.lane !== undefined ? { lane: options.plan.lane } : {}),
    ...(options.plan.version !== undefined ? { txVersion: options.plan.version } : {})
  };

  if (options.plan.change) {
    artifact.change = {
      address: options.plan.change.address,
      amountSompi: options.plan.change.amountSompi.toString()
    };
  }

  return finalizeTxPlanIdentity(artifact as any) as TxPlan;
}
