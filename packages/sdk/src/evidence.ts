import { HardkasSchemas, HardkasError } from "@hardkas/core";
import type { ScenarioResult, EvidencePackage } from "@hardkas/artifacts";
import { recomputeDeclaredContentHash, verifyArtifactIntegrity, HARDKAS_VERSION } from "@hardkas/artifacts";
import path from "node:path";
import fs from "node:fs";

// SURFACE-TRUTH-1A (ST-I2): a package's verdict is bound by the identity that already covers it. The scenario result is
// a sealed v5 artifact (its one producer, `createScenarioResultArtifact`), so its contentHash commits to the verdict
// (`status`, `error`), the run (`scenarioName`, `networkId`, `mode`) and the membership (`artifactsGenerated`, the
// contentHashes of what the run wrote). `pack` carries exactly those artifacts; `verify` checks that identity, that the
// package repeats it, and that the artifacts carried are exactly the ones it names, each intact. The package format is
// unchanged. Like all HardKAS evidence it is unsigned: a forger who re-seals every piece produces a consistent package.
//
// TASK-EVIDENCE-UNBOUND-1 (D-TEU-1..3): the scenario result also seals what its package may be presented as
// (`evidenceClaim`: none | artifacts | payment). `verify` follows the authenticated lineage references of what it carries
// and reports them; a PAYMENT claim is verified only when each payment's lineage (plan ← signed ← submission) closes inside
// the package, consistently; a package that names nothing is verified only when it declares itself empty. Every verdict
// carries its scope: EVIDENCE_VERIFIED is integrity and internal consistency, never chain inclusion or authorship.

export interface EvidencePackOptions {
  scenarioResultPath: string;
  workspaceRoot: string;
  outPath?: string;
}

/** A payment the package claims, as its artifacts establish it. */
export interface EvidencePaymentScope {
  txId: string;
  /** The package establishes this payment’s lineage (plan ← signed ← submission) inside itself, consistently. */
  lineageClosed: boolean;
  plan: string | null;
  signed: string | null;
  submission: string;
  /** What the node answered to the submission, as recorded (an accepted request is not an accepted transaction). */
  submitAccepted: boolean | null;
  /**
   * RPC observations of this submission the package carries, REPORTED as recorded: what one observer said. They are not
   * part of the verdict and are not checked against the network here; never an inclusion proof.
   */
  rpcObservationsReported: Array<{ artifactId: string; finding: string | null; confirmationsBlue: string | null; observer: string | null }>;
  problems: string[];
}

export interface EvidenceScope {
  /** Number of artifacts carried. */
  artifacts: number;
  /** What the sealed scenario result says its package may be presented as; `unspecified` for one sealed before claims. */
  claim: "none" | "artifacts" | "payment" | "unspecified";
  /** The recorded verdict of the run (a failed run's evidence verifies as a record of that failure). */
  verdict: "passed" | "failed" | "unknown";
  /** `closed` when every authenticated lineage reference of a carried artifact resolves inside the package. */
  lineage: "closed" | "open";
  unresolved: Array<{ from: string; field: string; missing: string }>;
  payments: EvidencePaymentScope[];
  statement: string;
}

export interface EvidenceVerifyResult {
  ok: boolean;
  status:
    | "EVIDENCE_VERIFIED"
    | "EVIDENCE_ARTIFACT_HASH_MISMATCH"
    | "EVIDENCE_POLICY_VIOLATION"
    | "EVIDENCE_INVALID_SCHEMA"
    | "EVIDENCE_SCENARIO_RESULT_INVALID"
    | "EVIDENCE_PACKAGE_INCONSISTENT"
    | "EVIDENCE_MEMBERSHIP_MISMATCH"
    | "EVIDENCE_EMPTY_UNDECLARED"
    | "EVIDENCE_CLAIM_INCONSISTENT"
    | "EVIDENCE_PAYMENT_INCOMPLETE";
  details?: string;
  /** Present once the package's artifacts are known to be intact and exactly the named ones. */
  scope?: EvidenceScope;
}

const listIds = (ids: readonly string[], max = 5) => `${ids.slice(0, max).join(", ")}${ids.length > max ? ` (+${ids.length - max})` : ""}`;

/** What EVIDENCE_VERIFIED establishes, in words every output repeats (D-TEU-3). */
export function evidenceScopeStatement(claim: EvidenceScope["claim"]): string {
  return (
    "Integrity and internal consistency of an unsigned package: each artifact hashes to its identity and they are exactly " +
    "the ones its sealed scenario result names" +
    (claim === "payment" ? ", and each claimed payment's lineage (plan, signed, submission) closes inside it" : "") +
    ". Not a proof of inclusion on chain, nor of who produced the package; an observation records what one RPC observer reported."
  );
}

const SCHEMA = {
  plan: /^hardkas\.txPlan(\.v1)?$|^hardkas\.txPlanV1$/,
  signed: /^hardkas\.signedTx(\.v1)?$|^hardkas\.signedTxV1$/,
  submission: /^hardkas\.txSubmission\.v1$/,
  observation: /^hardkas\.txObservation\.v1$/
};
const isHash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

/** The authenticated references a carried artifact makes to other artifacts (v5 hashes them all). */
function referencesOf(a: any): Array<{ field: string; id: string }> {
  const refs: Array<{ field: string; id: string }> = [];
  if (isHash(a?.lineage?.parentArtifactId)) refs.push({ field: "lineage.parentArtifactId", id: a.lineage.parentArtifactId });
  if (SCHEMA.submission.test(String(a?.schema)) && isHash(a?.signedArtifactId)) refs.push({ field: "signedArtifactId", id: a.signedArtifactId });
  if (SCHEMA.observation.test(String(a?.schema)) && isHash(a?.subject?.submissionArtifactId)) {
    refs.push({ field: "subject.submissionArtifactId", id: a.subject.submissionArtifactId });
  }
  return refs;
}

/** One claimed payment against the artifacts carried (by identity). */
function paymentScope(claimed: { txId: string; submissionArtifactId: string }, byId: Map<string, any>, networkId: unknown): EvidencePaymentScope {
  const problems: string[] = [];
  const sub = byId.get(claimed.submissionArtifactId);
  const out: EvidencePaymentScope = {
    txId: claimed.txId,
    lineageClosed: false,
    plan: null,
    signed: null,
    submission: claimed.submissionArtifactId,
    submitAccepted: null,
    rpcObservationsReported: [],
    problems
  };
  if (!sub) {
    problems.push(`the submission ${claimed.submissionArtifactId} is not carried`);
    return out;
  }
  if (!SCHEMA.submission.test(String(sub.schema))) problems.push(`${claimed.submissionArtifactId} is a ${String(sub.schema)}, not a submission`);
  if (sub.txId !== claimed.txId) problems.push(`the submission is for txId ${String(sub.txId)}, the claim names ${claimed.txId}`);
  out.submitAccepted = typeof sub.submitResult?.accepted === "boolean" ? sub.submitResult.accepted : null;
  const signedId = sub.signedArtifactId;
  if (!isHash(signedId) || sub.lineage?.parentArtifactId !== signedId) {
    problems.push("the submission does not name its signed transaction consistently (signedArtifactId and lineage.parentArtifactId)");
  }
  const signed = isHash(signedId) ? byId.get(signedId) : undefined;
  if (!signed) problems.push(`the signed transaction ${String(signedId)} is not carried`);
  else {
    out.signed = signedId;
    if (!SCHEMA.signed.test(String(signed.schema))) problems.push(`${signedId} is a ${String(signed.schema)}, not a signed transaction`);
    if (signed.txId !== claimed.txId) problems.push(`the signed transaction is for txId ${String(signed.txId)}, the claim names ${claimed.txId}`);
    const planId = signed.lineage?.parentArtifactId;
    const plan = isHash(planId) ? byId.get(planId) : undefined;
    if (!plan) problems.push(`the plan ${String(planId)} the signed transaction derives from is not carried`);
    else {
      out.plan = planId;
      if (!SCHEMA.plan.test(String(plan.schema))) problems.push(`${planId} is a ${String(plan.schema)}, not a transaction plan`);
      if (isHash(sub.lineage?.rootArtifactId) && sub.lineage.rootArtifactId !== planId) {
        problems.push("the submission's lineage root is not the plan its signed transaction derives from");
      }
      for (const [label, a] of [["plan", plan], ["signed", signed], ["submission", sub]] as const) {
        if (a.networkId !== networkId) problems.push(`the ${label} is on ${String(a.networkId)}, the run on ${String(networkId)}`);
      }
    }
  }
  for (const a of byId.values()) {
    if (!SCHEMA.observation.test(String(a.schema)) || a.subject?.submissionArtifactId !== claimed.submissionArtifactId) continue;
    if (a.subject?.txId !== claimed.txId) problems.push(`the observation ${String(a.contentHash)} observes txId ${String(a.subject?.txId)}`);
    out.rpcObservationsReported.push({
      artifactId: String(a.contentHash),
      finding: typeof a.finding?.type === "string" ? a.finding.type : null,
      confirmationsBlue: a.finding?.confirmationsBlue !== undefined ? String(a.finding.confirmationsBlue) : null,
      observer: typeof a.observer?.kind === "string" ? a.observer.kind : null
    });
  }
  out.lineageClosed = problems.length === 0;
  return out;
}

export class EvidenceManager {
  /**
   * Packs a Scenario Result into a verifiable Evidence Package V1. The package is verified before it is written: a
   * package that would not verify (e.g. a payment claim whose lineage does not close) is refused, never written.
   */
  static async pack(options: EvidencePackOptions): Promise<string> {
    if (!fs.existsSync(options.scenarioResultPath)) {
      throw new Error(`Scenario result not found: ${options.scenarioResultPath}`);
    }

    const rawResult = fs.readFileSync(options.scenarioResultPath, "utf-8");
    const scenarioResult = JSON.parse(rawResult) as ScenarioResult;

    // The verdict's own identity first: an unsealed or edited scenario result binds nothing.
    const sealed = await verifyArtifactIntegrity(scenarioResult);
    if (!sealed.ok) {
      throw new HardkasError(
        "EVIDENCE_SCENARIO_RESULT_INVALID",
        `Refusing to pack ${options.scenarioResultPath}: it is not a sealed, intact hardkas.scenarioResult.v1 (${sealed.errors.join("; ")}).`
      );
    }

    const { ProjectArtifactStore } = await import("@hardkas/artifacts");
    const store = new ProjectArtifactStore(options.workspaceRoot);
    const canonicalEntries = await store.enumerateCanonicalArtifacts();

    // Exactly the artifacts the scenario names, by identity (contentHash), each once. A scenario that names none gets
    // a package with none: the former fallback (every artifact in the store) and substring matching are gone.
    const byIdentity = new Map<string, any>();
    for (const entry of canonicalEntries) {
      if (typeof entry.contentHash === "string" && !byIdentity.has(entry.contentHash)) byIdentity.set(entry.contentHash, entry.artifact);
    }
    const named = [...new Set(scenarioResult.artifactsGenerated ?? [])];
    const unresolved = named.filter((id) => !byIdentity.has(id));
    if (unresolved.length > 0) {
      throw new HardkasError(
        "EVIDENCE_PACK_ARTIFACT_UNRESOLVED",
        `Refusing to pack: the scenario names ${unresolved.length} artifact(s) the workspace store does not hold (${listIds(unresolved)}); a package never leaves out what its scenario names.`,
        { metadata: { unresolved } }
      );
    }
    const altered = named.filter((id) => recomputeDeclaredContentHash(byIdentity.get(id)) !== id);
    if (altered.length > 0) {
      throw new HardkasError(
        "EVIDENCE_PACK_ARTIFACT_INVALID",
        `Refusing to pack: ${altered.length} named artifact(s) no longer hash to their identity in the store (${listIds(altered)}); run \`hardkas verify\`.`,
        { metadata: { altered } }
      );
    }

    const artifacts: any[] = named.map((id) => byIdentity.get(id));
    const hashes: Record<string, string> = Object.fromEntries(named.map((id) => [id, id]));

    const pkg: EvidencePackage = {
      version: "1.0.0-alpha",
      schema: HardkasSchemas.EvidencePackageV1 as any,
      name: scenarioResult.scenarioName,
      // TASK-EVIDENCE-UNBOUND-1: the product version from its one source (it is not part of any identity)
      hardkasVersion: HARDKAS_VERSION,
      networkId: scenarioResult.networkId,
      mode: scenarioResult.mode,
      createdAt: new Date().toISOString(),
      scenarioResult,
      artifacts,
      hashes,
      claims: {
        mainnet: false,
        testnet: false,
        production: false,
        bridgeReady: false,
        onchainZk: false
      },
      artifactDiscovery: {
        source: "scenarioResult"
      }
    };

    // A package that would not verify is never written (its claim is what the reader will rely on).
    const verdict = await EvidenceManager.verifyPackage(pkg);
    if (!verdict.ok) {
      throw new HardkasError(verdict.status, `Refusing to pack ${options.scenarioResultPath}: ${verdict.details ?? verdict.status}`, {
        metadata: { status: verdict.status }
      });
    }

    const targetName = options.outPath || path.join(options.workspaceRoot, `${scenarioResult.scenarioName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.hke.json`);
    const data = JSON.stringify(pkg, null, 2);
    // an --out inside the artifact store goes through the store's gate (ARTIFACT-MUTATION-1)
    const { writeFileRespectingStore } = await import("@hardkas/artifacts");
    await writeFileRespectingStore(targetName, data, () => fs.writeFileSync(targetName, data, "utf-8"));

    return targetName;
  }

  /**
   * Verifies an Evidence Package V1
   */
  static async verify(packagePath: string): Promise<EvidenceVerifyResult> {
    if (!fs.existsSync(packagePath)) {
      throw new Error(`Evidence package not found: ${packagePath}`);
    }

    const raw = fs.readFileSync(packagePath, "utf-8");
    return EvidenceManager.verifyPackage(JSON.parse(raw) as EvidencePackage);
  }

  /** Verifies a package already in memory (what `verify` reads, what `pack` is about to write). */
  static async verifyPackage(pkg: EvidencePackage): Promise<EvidenceVerifyResult> {
    if (pkg?.schema !== "hardkas.evidencePackage.v1") {
      return { ok: false, status: "EVIDENCE_INVALID_SCHEMA", details: "Invalid schema" };
    }

    // Verify Claims
    if (pkg.claims.mainnet || pkg.claims.testnet || pkg.claims.production || pkg.claims.bridgeReady || pkg.claims.onchainZk) {
      return {
        ok: false,
        status: "EVIDENCE_POLICY_VIOLATION",
        details: "Package asserts forbidden claims (mainnet/testnet/production/etc) under current policy."
      };
    }

    // The verdict: the scenario result is a sealed, intact artifact (an edited status no longer hashes to its identity).
    const scenarioResult = pkg.scenarioResult as ScenarioResult | undefined;
    const sealed = scenarioResult ? await verifyArtifactIntegrity(scenarioResult) : undefined;
    if (!scenarioResult || !sealed?.ok) {
      return {
        ok: false,
        status: "EVIDENCE_SCENARIO_RESULT_INVALID",
        details: `The scenario result is not a sealed, intact hardkas.scenarioResult.v1${sealed ? ` (${sealed.errors.join("; ")})` : " (missing)"}.`
      };
    }
    const scenarioClaims = (scenarioResult as unknown as { claims?: Record<string, unknown> }).claims ?? {};
    if (Object.values(scenarioClaims).some(Boolean)) {
      return { ok: false, status: "EVIDENCE_POLICY_VIOLATION", details: "The scenario result asserts forbidden claims under current policy." };
    }
    // The package repeats the run the scenario result names.
    const repeated: Array<[string, unknown, unknown]> = [
      ["name", pkg.name, scenarioResult.scenarioName],
      ["networkId", pkg.networkId, scenarioResult.networkId],
      ["mode", pkg.mode, scenarioResult.mode]
    ];
    const inconsistent = repeated.filter(([, packaged, sealedValue]) => packaged !== sealedValue).map(([field]) => field);
    if (inconsistent.length > 0) {
      return { ok: false, status: "EVIDENCE_PACKAGE_INCONSISTENT", details: `The package disagrees with its scenario result on: ${inconsistent.join(", ")}.` };
    }

    // Each artifact carried is intact: its body hashes to the identity it declares.
    const carried: string[] = [];
    for (const artifactObj of pkg.artifacts) {
      let computedHash: string;
      try {
        computedHash = recomputeDeclaredContentHash(artifactObj);
      } catch (error) {
        return {
          ok: false,
          status: "EVIDENCE_ARTIFACT_HASH_MISMATCH",
          details: error instanceof Error ? error.message : String(error)
        };
      }
      const declared = (artifactObj as { contentHash?: unknown } | null)?.contentHash;
      if (declared !== computedHash) {
        return {
          ok: false,
          status: "EVIDENCE_ARTIFACT_HASH_MISMATCH",
          details: `An artifact declares ${String(declared)} but hashes to ${computedHash}.`
        };
      }
      carried.push(computedHash);
    }

    // Membership: exactly the artifacts the sealed scenario result names, each once, and the hash list says the same.
    const named = new Set(scenarioResult.artifactsGenerated ?? []);
    const carriedSet = new Set(carried);
    const missing = [...named].filter((id) => !carriedSet.has(id));
    const unnamed = [...carriedSet].filter((id) => !named.has(id));
    const hashValues = Object.values(pkg.hashes ?? {});
    const hashesAgree =
      hashValues.length === carried.length && new Set(hashValues).size === hashValues.length && hashValues.every((h) => carriedSet.has(h));
    if (missing.length > 0 || unnamed.length > 0 || carriedSet.size !== carried.length || !hashesAgree) {
      const why = [
        missing.length ? `named but not carried: ${listIds(missing)}` : "",
        unnamed.length ? `carried but not named: ${listIds(unnamed)}` : "",
        carriedSet.size !== carried.length ? "an artifact is carried twice" : "",
        !hashesAgree ? "the hash list does not match the artifacts carried" : ""
      ].filter(Boolean);
      return { ok: false, status: "EVIDENCE_MEMBERSHIP_MISMATCH", details: `The package does not carry exactly what its scenario result names (${why.join("; ")}).` };
    }

    // TASK-EVIDENCE-UNBOUND-1: lineage and claim. The references are inside each artifact's hash (v5): they are followed
    // here, never trusted from the package's own lists.
    const byId = new Map<string, any>(pkg.artifacts.map((a: any) => [a.contentHash as string, a]));
    const unresolvedRefs: EvidenceScope["unresolved"] = [];
    for (const a of pkg.artifacts as any[]) {
      for (const ref of referencesOf(a)) {
        if (!byId.has(ref.id)) unresolvedRefs.push({ from: String(a.contentHash), field: ref.field, missing: ref.id });
      }
    }
    const declaredClaim = (scenarioResult as unknown as { evidenceClaim?: any }).evidenceClaim;
    const claim: EvidenceScope["claim"] =
      declaredClaim?.kind === "none" || declaredClaim?.kind === "artifacts" || declaredClaim?.kind === "payment" ? declaredClaim.kind : "unspecified";
    const payments: EvidencePaymentScope[] =
      claim === "payment" && Array.isArray(declaredClaim.payments)
        ? declaredClaim.payments.map((p: any) => paymentScope({ txId: String(p?.txId), submissionArtifactId: String(p?.submissionArtifactId) }, byId, scenarioResult.networkId))
        : [];
    const scope: EvidenceScope = {
      artifacts: carried.length,
      claim,
      verdict: scenarioResult.status === "passed" || scenarioResult.status === "failed" ? scenarioResult.status : "unknown",
      lineage: unresolvedRefs.length === 0 ? "closed" : "open",
      unresolved: unresolvedRefs,
      payments,
      statement: evidenceScopeStatement(claim)
    };

    if (claim === "unspecified" && carried.length === 0) {
      return {
        ok: false,
        status: "EVIDENCE_EMPTY_UNDECLARED",
        details: "The package carries no artifact and its scenario result does not declare itself empty: it is evidence of nothing it could be presented as.",
        scope
      };
    }
    if (claim === "none" && carried.length > 0) {
      return { ok: false, status: "EVIDENCE_CLAIM_INCONSISTENT", details: `The scenario result declares an empty package but ${carried.length} artifact(s) are carried.`, scope };
    }
    if ((claim === "artifacts" || claim === "payment") && carried.length === 0) {
      return { ok: false, status: "EVIDENCE_CLAIM_INCONSISTENT", details: `The scenario result claims ${claim} but the package carries none.`, scope };
    }
    if (claim === "payment") {
      const problems = [
        ...(payments.length === 0 ? ["the payment claim names no payment"] : []),
        ...payments.flatMap((p) => p.problems.map((why) => `${p.txId}: ${why}`)),
        // a payment package's own lineage must close: no carried artifact may point outside it
        ...unresolvedRefs.map((u) => `${u.from} ${u.field} → ${u.missing} is not carried`)
      ];
      if (problems.length > 0) {
        return {
          ok: false,
          status: "EVIDENCE_PAYMENT_INCOMPLETE",
          details: `The package claims ${payments.length} payment(s) it does not establish: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? ` (+${problems.length - 5})` : ""}.`,
          scope
        };
      }
    }

    return { ok: true, status: "EVIDENCE_VERIFIED", scope };
  }

  /**
   * Explains an Evidence Package V1
   */
  static async explain(packagePath: string): Promise<string> {
    if (!fs.existsSync(packagePath)) {
      throw new Error(`Evidence package not found: ${packagePath}`);
    }

    const raw = fs.readFileSync(packagePath, "utf-8");
    const pkg = JSON.parse(raw) as EvidencePackage;

    let explanation = `Evidence Package V1: ${pkg.name}\n`;
    explanation += `Mode: ${pkg.mode}\n`;
    explanation += `Status: ${pkg.scenarioResult?.status}\n`;
    explanation += `Total Artifacts Bundled: ${pkg.artifacts.length}\n`;
    explanation += `Discovery Method: ${pkg.artifactDiscovery?.source}\n`;
    explanation += `\nClaims:\n`;
    for (const [k, v] of Object.entries(pkg.claims)) {
      explanation += `  - ${k}: ${v}\n`;
    }

    return explanation;
  }
}
