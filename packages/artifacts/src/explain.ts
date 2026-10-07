import { ExecutionMode } from "@hardkas/core";
import {
  verifyArtifactIntegrity,
  verifyArtifactSemantics
} from "./verify.js";
import { verifyFeeSemantics } from "./feeVerify.js";
import { verifyLineage } from "./lineage.js";
import { resolveParentReference, type ParentResolution } from "./lineage-chain.js";

/**
 * Where `explainArtifact` may look for what the artifact references (EVIDENCE-TRUST-1): the workspace whose store is
 * searched, and/or a resolver. Without either, a parent is reported "unresolved", never "missing".
 */
export interface ExplainContext {
  workspaceRoot?: string;
  resolveArtifact?: (artifactId: string) => any;
}

export interface ArtifactExplanation {
  summary: {
    type: string;
    version: string;
    network: string;
    mode: ExecutionMode;
    createdAt: string;
    status: "valid" | "invalid" | "legacy" | "corrupted";
  };
  identity: {
    artifactId: string;
    contentHash: string;
    lineageId?: string;
    rootArtifactId?: string;
    parentArtifactId?: string;
    /**
     * EVIDENCE-TRUST-1: what looking the parent up found — resolved (a verified copy), missing (searched, not there),
     * invalid (a copy there does not verify as that identity), unresolved (nowhere was searched), or root (no parent).
     */
    parent: ParentResolution;
  };
  economics?: {
    ok: boolean;
    mass: { reported: bigint; recomputed: bigint; delta: bigint };
    fee: { reported: bigint; recomputed: bigint; delta: bigint; rate: bigint };
    balance: { inputs: bigint; outputs: bigint; change: bigint; impliedFee: bigint };
  };
  security: {
    strictOk: boolean;
    issues: Array<{
      code: string;
      severity: "warning" | "error" | "critical";
      message: string;
    }>;
  };
  metadata: Record<string, any>;
}

/**
 * Generates a deep operational explanation of a HardKAS artifact. With `context` the references are looked up there
 * (the workspace store, as `hardkas verify` does); without it nothing is searched and a parent is "unresolved".
 */
export async function explainArtifact(
  artifactUnknown: unknown,
  context: ExplainContext = {}
): Promise<ArtifactExplanation> {
  const artifact = artifactUnknown as Record<string, unknown>;
  const schema = (artifact.schema as string) || "unknown";
  const type = schema.split(".")[1] || "unknown";
  const lookup = {
    ...(context.workspaceRoot ? { workspaceRoot: context.workspaceRoot } : {}),
    ...(context.resolveArtifact ? { resolveArtifact: context.resolveArtifact } : {})
  };

  // 1. Integrity & Semantic Audit
  const integrity = await verifyArtifactIntegrity(artifact, lookup);
  const semantic = verifyArtifactSemantics(artifact, { strict: true, ...lookup });
  const parent = resolveParentReference(artifact, lookup);
  // structure only: the chain checks against the resolved parent are part of the semantic audit above
  const lineage = verifyLineage(artifact);

  const status = integrity.ok && semantic.ok && lineage.ok ? "valid" : "corrupted";

  const explanation: ArtifactExplanation = {
    summary: {
      type: type.toUpperCase(),
      version: (artifact.version as string) || "0.0.0",
      network: (artifact.networkId as string) || "unknown",
      mode: (artifact.mode as ExecutionMode) || "simulated",
      createdAt: (artifact.createdAt as string) || "unknown",
      status: status as "valid" | "invalid" | "legacy" | "corrupted"
    },
    identity: {
      artifactId:
        ((artifact.lineage as Record<string, unknown>)?.artifactId as string) || "orphan",
      contentHash: (artifact.contentHash as string) || "missing",
      lineageId: (artifact.lineage as Record<string, unknown>)?.lineageId as string,
      rootArtifactId: (artifact.lineage as Record<string, unknown>)
        ?.rootArtifactId as string,
      parentArtifactId: (artifact.lineage as Record<string, unknown>)
        ?.parentArtifactId as string,
      parent: { status: parent.status, ...(parent.artifactId ? { artifactId: parent.artifactId } : {}), ...(parent.detail ? { detail: parent.detail } : {}) }
    },
    security: {
      strictOk: status === "valid",
      issues: [
        ...integrity.issues.map((i) => ({
          ...i,
          severity: i.severity as "warning" | "error" | "critical"
        })),
        ...semantic.issues.map((i) => ({
          ...i,
          severity: i.severity as "warning" | "error" | "critical"
        })),
        ...lineage.issues.map((i) => ({
          ...i,
          severity: i.severity as "warning" | "error" | "critical"
        }))
      ]
    },
    metadata: (artifact.metadata as Record<string, unknown>) || {}
  };

  // 2. Economic Audit (for transactions)
  if (type === "txPlan" || type === "signedTx" || type === "txReceipt") {
    const feeAudit = verifyFeeSemantics(artifact);

    let inputTotal = 0n;
    let outputTotal = 0n;
    let changeAmount = 0n;

    if (type === "txPlan") {
      const plan = artifact;
      inputTotal = ((plan.inputs as Array<{ amountSompi?: string }>) || []).reduce(
        (sum: bigint, i) => sum + BigInt(i.amountSompi || 0),
        0n
      );
      outputTotal = ((plan.outputs as Array<{ amountSompi?: string }>) || []).reduce(
        (sum: bigint, o) => sum + BigInt(o.amountSompi || 0),
        0n
      );
      changeAmount = (plan.change as Record<string, unknown>)
        ? BigInt(
            ((plan.change as Record<string, unknown>).amountSompi as string | number) || 0
          )
        : 0n;
    }

    explanation.economics = {
      ok: feeAudit.ok,
      mass: {
        reported: feeAudit.actualMass,
        recomputed: feeAudit.expectedMass,
        delta: feeAudit.expectedMass - feeAudit.actualMass
      },
      fee: {
        reported: feeAudit.actualFeeSompi,
        recomputed: feeAudit.expectedFeeSompi,
        delta: feeAudit.deltaSompi,
        rate: feeAudit.feeRateSompiPerMass
      },
      balance: {
        inputs: inputTotal,
        outputs: outputTotal,
        change: changeAmount,
        impliedFee: inputTotal - outputTotal - changeAmount
      }
    };
  }

  return explanation;
}
