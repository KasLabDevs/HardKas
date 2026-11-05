import {
  HardkasSchemas,
  checkCovenantTransitionFactIdentity,
  checkZkVerificationFactIdentity,
  deriveTxStatus,
  deriveCovenantStatus,
  deriveZkOperationStatus,
  enumerateWorkspaceArtifactsSync,
  type CovenantTransitionFact,
  type ZkVerificationFact,
  type DerivedTxStatus,
  type CovenantStatusResult,
  type ZkOperationStatusResult
} from "@hardkas/artifacts";
import { describeWhyNode } from "./why-narrative.js";

export type FactRelation = "exact" | "compatible" | "contradictory" | "invalid" | "ambiguous_conflict";

export interface AssociatedFactRecord {
  schema: string;
  id: string;
  path: string;
  relation: FactRelation;
  reason?: string | undefined;
  details?: string | undefined;
  artifact: any;
}

export interface OfflineDerivedStatusSummary {
  tx?: DerivedTxStatus | undefined;
  covenant?: CovenantStatusResult | undefined;
  zk?: ZkOperationStatusResult | undefined;
  observationsCount: number;
  latestDaaScore?: string | undefined;
  offlineNotice: string;
}

export interface AssociatedFactsResolution {
  covenantFacts: AssociatedFactRecord[];
  zkFacts: AssociatedFactRecord[];
  contradictoryFacts: AssociatedFactRecord[];
  offlineStatus?: OfflineDerivedStatusSummary | undefined;
}

export function resolveAssociatedFacts(options: {
  txId: string;
  workspaceRoot: string;
  planArtifactId?: string | undefined;
  draftArtifactId?: string | undefined;
  planOutputs?: Array<{ address?: string | undefined; amountSompi?: string | undefined }> | undefined;
}): AssociatedFactsResolution {
  const { txId, workspaceRoot, planArtifactId, draftArtifactId, planOutputs } = options;

  const rawEntries = enumerateWorkspaceArtifactsSync(workspaceRoot);

  const candidateCovenants: Array<{ entry: any; fact: CovenantTransitionFact }> = [];
  const candidateZks: Array<{ entry: any; fact: ZkVerificationFact }> = [];
  const observations: any[] = [];

  for (const entry of rawEntries) {
    const a: any = entry.artifact;
    if (!a || typeof a !== "object") continue;

    // 1. Observations
    if (a.schema === HardkasSchemas.TxObservationV1 && a.subject?.txId === txId) {
      observations.push(a);
      continue;
    }

    // 2. Covenant Transition Facts
    if (a.schema === HardkasSchemas.CovenantTransitionFactV1 && a.txId === txId) {
      candidateCovenants.push({ entry, fact: a });
      continue;
    }

    // 3. ZK Verification Facts
    if (a.schema === HardkasSchemas.ZkVerificationFactV1 && a.txId === txId) {
      candidateZks.push({ entry, fact: a });
      continue;
    }
  }

  const covenantFacts: AssociatedFactRecord[] = [];
  const zkFacts: AssociatedFactRecord[] = [];
  const contradictoryFacts: AssociatedFactRecord[] = [];

  // Evaluate Covenant Facts
  // First collapse exact duplicate copies (same contentHash)
  const uniqueCovByHash = new Map<string, { entry: any; fact: CovenantTransitionFact }>();
  for (const c of candidateCovenants) {
    const h = c.fact.contentHash || c.entry.path;
    if (!uniqueCovByHash.has(h)) uniqueCovByHash.set(h, c);
  }
  const uniqueCovs = [...uniqueCovByHash.values()];

  if (uniqueCovs.length > 1) {
    // Ambiguity: distinct covenant facts claiming the same txId
    for (const c of uniqueCovs) {
      const rec: AssociatedFactRecord = {
        schema: HardkasSchemas.CovenantTransitionFactV1,
        id: c.fact.contentHash || "unknown",
        path: c.entry.path,
        relation: "ambiguous_conflict",
        reason: `Multiple distinct covenant facts (${uniqueCovs.length}) found for txId ${txId}`,
        details: describeWhyNode(c.fact),
        artifact: c.fact
      };
      covenantFacts.push(rec);
      contradictoryFacts.push(rec);
    }
  } else if (uniqueCovs.length === 1) {
    const c = uniqueCovs[0]!;
    const identityCheck = checkCovenantTransitionFactIdentity(c.fact);
    if (!identityCheck.ok) {
      const rec: AssociatedFactRecord = {
        schema: HardkasSchemas.CovenantTransitionFactV1,
        id: c.fact.contentHash || "unknown",
        path: c.entry.path,
        relation: "invalid",
        reason: `Identity check failed: ${identityCheck.issues.map((i) => i.message).join("; ")}`,
        details: describeWhyNode(c.fact),
        artifact: c.fact
      };
      covenantFacts.push(rec);
      contradictoryFacts.push(rec);
    } else {
      let relation: FactRelation = "compatible";
      let reason: string | undefined;

      if (c.fact.successorOutpoint && c.fact.successorOutpoint.transactionId.toLowerCase() !== txId.toLowerCase()) {
        relation = "contradictory";
        reason = `SUCCESSOR_MISMATCH: Fact successor txId ${c.fact.successorOutpoint.transactionId} does not match transaction ${txId}`;
      } else if (planArtifactId) {
        if (c.fact.planArtifactId !== planArtifactId) {
          relation = "contradictory";
          reason = `PLAN_MISMATCH: Fact declares plan ${c.fact.planArtifactId} but causal lineage has ${planArtifactId}`;
        } else if (draftArtifactId) {
          if (c.fact.draftArtifactId && c.fact.draftArtifactId !== draftArtifactId) {
            relation = "contradictory";
            reason = `DRAFT_MISMATCH: Fact declares draft ${c.fact.draftArtifactId} but causal lineage has ${draftArtifactId}`;
          } else if (!c.fact.draftArtifactId) {
            relation = "compatible";
            reason = "UNBOUND_DRAFT: Fact does not record draftArtifactId";
          } else {
            relation = "exact";
          }
        } else {
          relation = "exact";
        }
      }

      const rec: AssociatedFactRecord = {
        schema: HardkasSchemas.CovenantTransitionFactV1,
        id: c.fact.contentHash || identityCheck.artifactId,
        path: c.entry.path,
        relation,
        reason,
        details: describeWhyNode(c.fact),
        artifact: c.fact
      };
      covenantFacts.push(rec);
      if (relation === "contradictory") contradictoryFacts.push(rec);
    }
  }

  // Evaluate ZK Facts
  const uniqueZkByHash = new Map<string, { entry: any; fact: ZkVerificationFact }>();
  for (const z of candidateZks) {
    const h = z.fact.contentHash || z.entry.path;
    if (!uniqueZkByHash.has(h)) uniqueZkByHash.set(h, z);
  }
  const uniqueZks = [...uniqueZkByHash.values()];

  if (uniqueZks.length > 1) {
    for (const z of uniqueZks) {
      const rec: AssociatedFactRecord = {
        schema: HardkasSchemas.ZkVerificationFactV1,
        id: z.fact.contentHash || "unknown",
        path: z.entry.path,
        relation: "ambiguous_conflict",
        reason: `Multiple distinct ZK facts (${uniqueZks.length}) found for txId ${txId}`,
        details: describeWhyNode(z.fact),
        artifact: z.fact
      };
      zkFacts.push(rec);
      contradictoryFacts.push(rec);
    }
  } else if (uniqueZks.length === 1) {
    const z = uniqueZks[0]!;
    const identityCheck = checkZkVerificationFactIdentity(z.fact);
    if (!identityCheck.ok) {
      const rec: AssociatedFactRecord = {
        schema: HardkasSchemas.ZkVerificationFactV1,
        id: z.fact.contentHash || "unknown",
        path: z.entry.path,
        relation: "invalid",
        reason: `Identity check failed: ${identityCheck.issues.map((i) => i.message).join("; ")}`,
        details: describeWhyNode(z.fact),
        artifact: z.fact
      };
      zkFacts.push(rec);
      contradictoryFacts.push(rec);
    } else {
      let relation: FactRelation = "compatible";
      let reason: string | undefined;

      // Check payout binding against plan outputs if plan is known
      const payoutMatched = !planOutputs || planOutputs.length === 0 || planOutputs.some((o) => {
        if (!o.address || !o.amountSompi) return false;
        return o.address === z.fact.payoutAddress && BigInt(o.amountSompi) >= BigInt(z.fact.payoutSompi);
      });

      if (!payoutMatched) {
        relation = "contradictory";
        reason = `PAYOUT_MISMATCH: Plan outputs do not pay requested ${z.fact.payoutSompi} sompi to ${z.fact.payoutAddress}`;
      } else if (planArtifactId) {
        if (z.fact.planArtifactId && z.fact.planArtifactId !== planArtifactId) {
          relation = "contradictory";
          reason = `PLAN_MISMATCH: Fact declares plan ${z.fact.planArtifactId} but causal lineage has ${planArtifactId}`;
        } else if (!z.fact.planArtifactId) {
          relation = "compatible";
          reason = "UNBOUND_PLAN: Fact does not record planArtifactId";
        } else if (draftArtifactId) {
          if (z.fact.draftArtifactId && z.fact.draftArtifactId !== draftArtifactId) {
            relation = "contradictory";
            reason = `DRAFT_MISMATCH: Fact declares draft ${z.fact.draftArtifactId} but causal lineage has ${draftArtifactId}`;
          } else if (!z.fact.draftArtifactId) {
            relation = "compatible";
            reason = "UNBOUND_DRAFT: Fact does not record draftArtifactId";
          } else {
            relation = "exact";
          }
        } else {
          relation = "exact";
        }
      }

      const rec: AssociatedFactRecord = {
        schema: HardkasSchemas.ZkVerificationFactV1,
        id: z.fact.contentHash || identityCheck.artifactId,
        path: z.entry.path,
        relation,
        reason,
        details: describeWhyNode(z.fact),
        artifact: z.fact
      };
      zkFacts.push(rec);
      if (relation === "contradictory") contradictoryFacts.push(rec);
    }
  }

  // Derive Offline Status if observations exist
  let offlineStatus: OfflineDerivedStatusSummary | undefined;
  if (observations.length > 0) {
    const tx = deriveTxStatus({ txId, observations });
    const latestObs = observations[observations.length - 1];
    const latestDaaScore = latestObs?.point?.virtualDaaScore ?? latestObs?.observedDaaScore;

    let covenant: CovenantStatusResult | undefined;
    const validCov = covenantFacts.find((f) => f.relation === "exact" || f.relation === "compatible");
    if (validCov) {
      covenant = deriveCovenantStatus({ transitionFact: validCov.artifact, txStatus: tx });
    }

    let zk: ZkOperationStatusResult | undefined;
    const validZk = zkFacts.find((f) => f.relation === "exact" || f.relation === "compatible");
    if (validZk) {
      zk = deriveZkOperationStatus({ zkFact: validZk.artifact, txStatus: tx });
    }

    offlineStatus = {
      tx,
      covenant,
      zk,
      observationsCount: observations.length,
      latestDaaScore: latestDaaScore ? String(latestDaaScore) : undefined,
      offlineNotice: `Derived offline from ${observations.length} stored observation(s); no live node was contacted.`
    };
  }

  return {
    covenantFacts,
    zkFacts,
    contradictoryFacts,
    offlineStatus
  };
}
