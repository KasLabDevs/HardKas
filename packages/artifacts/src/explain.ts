import { formatSompi, ExecutionMode } from "@hardkas/core";
import { verifyArtifactIntegrity, verifyArtifactSemantics, ArtifactVerificationResult } from "./verify.js";
import { verifyFeeSemantics, FeeAuditResult } from "./feeVerify.js";
import { verifyLineage, LineageValidationResult } from "./lineage.js";

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
  };
  economics?: {
    ok: boolean;
    mass: { reported: bigint; recomputed: bigint; delta: bigint };
    fee: { reported: bigint; recomputed: bigint; delta: bigint; rate: bigint };
    balance: { inputs: bigint; outputs: bigint; change: bigint; impliedFee: bigint };
  };
  security: {
    strictOk: boolean;
    issues: Array<{ code: string; severity: "warning" | "error" | "critical"; message: string }>;
  };
  metadata: Record<string, any>;
}

/**
 * Generates a deep operational explanation of a HardKAS artifact.
 */
export async function explainArtifact(artifact: any): Promise<ArtifactExplanation> {
  const schema = artifact.schema || "unknown";
  const type = schema.split(".")[1] || "unknown";
  
  // 1. Integrity & Semantic Audit
  const integrity = await verifyArtifactIntegrity(artifact);
  const semantic = verifyArtifactSemantics(artifact, { strict: true });
  const lineage = verifyLineage(artifact);
  
  const status = integrity.ok && semantic.ok && lineage.ok ? "valid" : "corrupted";

  const explanation: ArtifactExplanation = {
    summary: {
      type: type.toUpperCase(),
      version: artifact.version || "0.0.0",
      network: artifact.networkId || "unknown",
      mode: (artifact.mode as any) || "simulated",
      createdAt: artifact.createdAt || "unknown",
      status: status as any
    },
    identity: {
      artifactId: artifact.lineage?.artifactId || "orphan",
      contentHash: artifact.contentHash || "missing",
      lineageId: artifact.lineage?.lineageId,
      rootArtifactId: artifact.lineage?.rootArtifactId,
      parentArtifactId: artifact.lineage?.parentArtifactId
    },
    security: {
      strictOk: status === "valid",
      issues: [
        ...integrity.issues.map(i => ({ ...i, severity: i.severity as any })),
        ...semantic.issues.map(i => ({ ...i, severity: i.severity as any })),
        ...lineage.issues.map(i => ({ ...i, severity: i.severity as any }))
      ]
    },
    metadata: artifact.metadata || {}
  };

  // 2. Economic Audit (for transactions)
  if (type === "txPlan" || type === "signedTx" || type === "txReceipt") {
    const feeAudit = verifyFeeSemantics(artifact);
    
    let inputTotal = 0n;
    let outputTotal = 0n;
    let changeAmount = 0n;

    if (type === "txPlan") {
      const plan = artifact;
      inputTotal = (plan.inputs || []).reduce((sum: bigint, i: any) => sum + BigInt(i.amountSompi || 0), 0n);
      outputTotal = (plan.outputs || []).reduce((sum: bigint, o: any) => sum + BigInt(o.amountSompi || 0), 0n);
      changeAmount = plan.change ? BigInt(plan.change.amountSompi || 0) : 0n;
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
