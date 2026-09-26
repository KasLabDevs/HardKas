import {
  TxPlan,
  TxReceipt,
  SignedTx,
  ARTIFACT_VERSION,
  DagContext,
  DraftArtifact
} from "./schemas.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "./canonical.js";
import { createLineageTransition } from "./lineage.js";
import { HARDKAS_VERSION } from "./constants.js";
import type { RuntimeContext } from "@hardkas/core";
import { HardkasError, HardkasSchemas } from "@hardkas/core";

// Wave 1.4 · Closure Pack D-Q2 (Q2-B) / IC-6′ / N4 — synthetic authorization.
//
// In the simulator nothing is signed: a "signed" artifact is an AUTHORIZATION of
// ONE plan, identified by its artifactId inside the authenticated body, by the
// account that owns the plan's `from`. It is never presented as a signature.
// There is ONE synthetic txId scheme: `synthetic-<planArtifactId>` (64 hex).

/** IC-6′.4: the format of a synthetic authorization. */
export const SYNTHETIC_AUTHORIZATION_FORMAT = "synthetic-authorization" as const;
/** D-Q2.a / N4: the single synthetic txId scheme. */
export const SYNTHETIC_TXID_PATTERN = /^synthetic-[0-9a-f]{64}$/;
const HEX64 = /^[0-9a-f]{64}$/;

export interface SyntheticAuthorization {
  readonly kind: "synthetic";
  /** The plan this authorization is bound to (IC-6′.1), by artifactId. */
  readonly planArtifactId: string;
  /** The account identities that authorized it (IC-6′.3): authenticated, never metadata. */
  readonly signers: readonly string[];
}

/** A signer given as an address or as an account-like object carrying one. */
export type SyntheticSigner =
  | string
  | { address?: string | undefined; name?: string | undefined; accountName?: string | undefined };

/** D-Q2.a: the synthetic txId of the plan identified by `planArtifactId` (64 hex). */
export function syntheticTxIdFor(planArtifactId: string): string {
  if (typeof planArtifactId !== "string" || !HEX64.test(planArtifactId)) {
    throw new HardkasError(
      "PLAN_UNIDENTIFIED",
      `A synthetic txId names a plan by its 64-hex artifactId (got ${JSON.stringify(planArtifactId)})`
    );
  }
  return `synthetic-${planArtifactId}`;
}

/**
 * IC-6′.2 / IC-4′.4: the authenticated identity of a plan that MAY be authorized —
 * sealed under the current hash version and recomputing to its declared hash. A
 * LEGACY plan is never authorized (migrate it first); an unsealed or tampered plan
 * has no identity to bind to.
 */
export function authorizablePlanIdentity(plan: unknown): string {
  const p = plan as Record<string, unknown>;
  if (typeof p?.contentHash !== "string" || !HEX64.test(p.contentHash)) {
    throw new HardkasError(
      "PLAN_UNIDENTIFIED",
      "Refusing to authorize a plan without a verifiable identity (no 64-hex contentHash): write/seal the plan first"
    );
  }
  if (p.hashVersion !== CURRENT_HASH_VERSION) {
    throw new HardkasError(
      "MIGRATION_REQUIRED",
      `Refusing to authorize a plan declaring hashVersion ${JSON.stringify(p.hashVersion)}: only hashVersion ${CURRENT_HASH_VERSION} (FULL authentication) plans are authorized; migrate it with \`hardkas artifact migrate\``
    );
  }
  const recomputed = calculateContentHash(p, CURRENT_HASH_VERSION);
  if (recomputed !== p.contentHash) {
    throw new HardkasError(
      "PLAN_UNIDENTIFIED",
      `Refusing to authorize a plan whose body hashes to ${recomputed} but declares ${p.contentHash}`
    );
  }
  return p.contentHash;
}

function signerAddressOf(signer: SyntheticSigner): string {
  const address = typeof signer === "string" ? signer : signer?.address;
  if (typeof address !== "string" || address.length === 0) {
    const label = typeof signer === "string" ? signer : signer?.name ?? signer?.accountName ?? "(unnamed)";
    throw new HardkasError("SIGNER_MISMATCH", `The signer ${JSON.stringify(label)} has no address to authorize with`);
  }
  return address;
}

/**
 * Creates the canonical synthetic authorization of `plan` by `signer` (the
 * simulator's "signed" artifact). The signer MUST be the plan's `from` (IC-6′.2,
 * `SIGNER_MISMATCH`); the plan MUST have a FULL identity (`PLAN_UNIDENTIFIED`,
 * `MIGRATION_REQUIRED`). The binding lives in the authenticated body:
 * `authorization.planArtifactId`, `lineage.parentArtifactId` and `txId`.
 */
export function createSimulatedSignedTxArtifact(
  plan: TxPlan,
  signer: SyntheticSigner,
  ctx: RuntimeContext
): SignedTx {
  const planArtifactId = authorizablePlanIdentity(plan);
  const signerAddress = signerAddressOf(signer);
  if (signerAddress !== plan.from.address) {
    throw new HardkasError(
      "SIGNER_MISMATCH",
      `The signer ${signerAddress} is not the plan's from ${plan.from.address}: only the account that owns the plan's from can authorize it`
    );
  }
  const authorization: SyntheticAuthorization = {
    kind: "synthetic",
    planArtifactId,
    signers: [signerAddress]
  };
  const artifact: DraftArtifact<SignedTx, "signedId" | "contentHash"> = {
    schema: HardkasSchemas.SignedTx,
    schemaVersion: HardkasSchemas.ArtifactV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: new Date(ctx.clock.now()).toISOString(),
    status: "signed",
    sourcePlanId: plan.planId,
    networkId: plan.networkId,
    mode: plan.mode,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    txId: syntheticTxIdFor(planArtifactId),
    authorization: authorization as SignedTx["authorization"],
    signedTransaction: {
      format: SYNTHETIC_AUTHORIZATION_FORMAT,
      payload: planArtifactId
    },
    lineage: createLineageTransition(plan, HardkasSchemas.SignedTx),
    execution: plan.execution || { mode: plan.mode as any, domain: "kaspa-l1", network: plan.networkId },
    ...(plan.workflowId ? { workflowId: plan.workflowId } : {}),
    ...(plan.assumptionLevel ? { assumptionLevel: plan.assumptionLevel } : {})
  };

  const hash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
  artifact.signedId = `signed-${hash.slice(0, 16)}`;
  artifact.contentHash = hash;
  if (artifact.lineage) {
    artifact.lineage.artifactId = hash;
  }

  return artifact as SignedTx;
}

export type SyntheticAuthorizationCheckCode =
  | "LEGACY_UNBOUND_SIGNED"
  | "AUTHORIZATION_INVALID"
  | "AUTHORIZATION_PLAN_MISMATCH"
  | "SIGNER_MISMATCH"
  | "PLAN_NOT_FULL";

export type SyntheticAuthorizationCheck =
  | { ok: true; planArtifactId: string; txId: string; signers: string[] }
  | { ok: false; code: SyntheticAuthorizationCheckCode; message: string };

const sortedUnique = (xs: string[]): string[] => Array.from(new Set(xs)).sort();

/**
 * IC-6′.2: is `signed` a coherent synthetic authorization, and — when `plan` is
 * given — an authorization OF that plan BY its `from`? Pure; no store access.
 *
 * Without `plan` only the artifact's own coherence is checked (the verifier
 * uses this); with `plan` the binding is decided (the executor uses this).
 * A legacy simulated-format artifact (no `authorization`) is reported as
 * `LEGACY_UNBOUND_SIGNED`: intact, but never executable (IC-6′.5).
 */
export function checkSyntheticAuthorization(signed: unknown, plan?: unknown): SyntheticAuthorizationCheck {
  const s = signed as Record<string, any>;
  const fail = (code: SyntheticAuthorizationCheckCode, message: string): SyntheticAuthorizationCheck => ({
    ok: false,
    code,
    message
  });
  const auth = s?.authorization;
  const format = s?.signedTransaction?.format;
  if (auth === undefined || auth === null) {
    if (format === SYNTHETIC_AUTHORIZATION_FORMAT) {
      return fail("AUTHORIZATION_INVALID", "signedTransaction.format is synthetic-authorization but the artifact carries no authenticated `authorization`");
    }
    return fail(
      "LEGACY_UNBOUND_SIGNED",
      `The signed artifact carries no authenticated authorization (format ${JSON.stringify(format)}): it is legacy and not bound to any plan. Re-authorize the plan with \`hardkas tx sign\``
    );
  }
  if (
    typeof auth !== "object" ||
    auth.kind !== "synthetic" ||
    typeof auth.planArtifactId !== "string" ||
    !HEX64.test(auth.planArtifactId) ||
    !Array.isArray(auth.signers) ||
    auth.signers.length === 0 ||
    !auth.signers.every((x: unknown) => typeof x === "string" && x.length > 0)
  ) {
    return fail("AUTHORIZATION_INVALID", "authorization must be { kind: \"synthetic\", planArtifactId: <64 hex>, signers: [address, ...] }");
  }
  const planArtifactId: string = auth.planArtifactId;
  const signers: string[] = auth.signers;
  if (signers.join("\u0000") !== sortedUnique(signers).join("\u0000")) {
    return fail("AUTHORIZATION_INVALID", "authorization.signers must be sorted and unique");
  }
  const expectedTxId = syntheticTxIdFor(planArtifactId);

  if (s.status === "signed") {
    if (format !== SYNTHETIC_AUTHORIZATION_FORMAT) {
      return fail(
        "AUTHORIZATION_INVALID",
        `a completed synthetic authorization carries signedTransaction.format "${SYNTHETIC_AUTHORIZATION_FORMAT}" (got ${JSON.stringify(format)})`
      );
    }
    if (s.signedTransaction?.payload !== planArtifactId) {
      return fail(
        "AUTHORIZATION_PLAN_MISMATCH",
        `signedTransaction.payload ${JSON.stringify(s.signedTransaction?.payload)} does not name the authorized plan ${planArtifactId}`
      );
    }
    if (s.txId !== expectedTxId) {
      return fail(
        "AUTHORIZATION_PLAN_MISMATCH",
        `txId ${JSON.stringify(s.txId)} does not name the authorized plan (expected ${expectedTxId})`
      );
    }
  } else if (s.status === "partially_signed") {
    if (s.signedTransaction !== undefined || s.txId !== undefined) {
      return fail("AUTHORIZATION_INVALID", "a partially signed authorization carries neither signedTransaction nor txId");
    }
  } else {
    return fail("AUTHORIZATION_INVALID", `unknown signed status ${JSON.stringify(s.status)}`);
  }

  const multisig = s.multisig;
  if (multisig === undefined) {
    // Single authorization: its lineage parent IS the plan.
    if (s.lineage?.parentArtifactId !== planArtifactId) {
      return fail(
        "AUTHORIZATION_PLAN_MISMATCH",
        `lineage.parentArtifactId ${JSON.stringify(s.lineage?.parentArtifactId)} is not the authorized plan ${planArtifactId}`
      );
    }
    if (signers.length !== 1 || signers[0] !== s.from?.address) {
      return fail("SIGNER_MISMATCH", `a single authorization is given by the plan's from ${JSON.stringify(s.from?.address)} alone (got ${JSON.stringify(signers)})`);
    }
  } else {
    const entries: any[] = Array.isArray(multisig?.signatures) ? multisig.signatures : [];
    if (entries.some((e) => e?.kind !== "synthetic" || e?.signature !== undefined)) {
      return fail("AUTHORIZATION_INVALID", "synthetic multisig entries are { signer, kind: \"synthetic\" }: nothing is presented as a signature");
    }
    const entrySigners = sortedUnique(entries.map((e) => String(e?.signer)));
    if (entrySigners.join("\u0000") !== signers.join("\u0000")) {
      return fail("SIGNER_MISMATCH", "authorization.signers must be exactly the multisig entries' signers");
    }
    const required: string[] = Array.isArray(multisig?.requiredSigners) ? multisig.requiredSigners : [];
    if (!signers.every((x) => required.includes(x))) {
      return fail("SIGNER_MISMATCH", "every authorizing signer must be one of multisig.requiredSigners");
    }
    if (s.status === "signed" && signers.length < Number(multisig?.threshold)) {
      return fail("AUTHORIZATION_INVALID", `a completed multisig authorization needs ${multisig?.threshold} signers (got ${signers.length})`);
    }
    if (s.status === "signed" && !signers.includes(s.from?.address)) {
      return fail("SIGNER_MISMATCH", `the plan's from ${JSON.stringify(s.from?.address)} is not among the authorizing signers ${JSON.stringify(signers)}`);
    }
  }

  if (plan !== undefined) {
    const p = plan as Record<string, any>;
    if (p?.contentHash !== planArtifactId) {
      return fail(
        "AUTHORIZATION_PLAN_MISMATCH",
        `the authorization names plan ${planArtifactId} but the plan supplied is ${JSON.stringify(p?.contentHash)}`
      );
    }
    try {
      authorizablePlanIdentity(p);
    } catch (e: any) {
      return fail("PLAN_NOT_FULL", `the authorized plan is not executable: ${e?.message ?? String(e)}`);
    }
    if (!signers.includes(p.from?.address)) {
      return fail("SIGNER_MISMATCH", `the plan's from ${JSON.stringify(p.from?.address)} did not authorize it (signers ${JSON.stringify(signers)})`);
    }
    if (
      s.from?.address !== p.from?.address ||
      s.to?.address !== p.to?.address ||
      String(s.amountSompi) !== String(p.amountSompi) ||
      s.networkId !== p.networkId
    ) {
      return fail("AUTHORIZATION_PLAN_MISMATCH", "the authorization describes a different transfer (from/to/amount/network) than the plan it names");
    }
    if (multisig !== undefined && s.lineage?.rootArtifactId !== (p.lineage?.rootArtifactId ?? p.contentHash)) {
      return fail("AUTHORIZATION_PLAN_MISMATCH", "the multisig authorization does not descend from the plan it names");
    }
  }

  return { ok: true, planArtifactId, txId: expectedTxId, signers };
}

/**
 * Creates a canonical simulated receipt.
 *
 * DEF-1c (Wave 1 continuation): the receipt's `lineage.parentArtifactId` MUST
 * be an artifact hash (per the lineage contract). Previously, this function
 * overrode `parentArtifactId` with `preStateHash` — a state-machine hash from a
 * DIFFERENT hash space — which caused every persisted simulator receipt to
 * declare an unresolvable HardKAS parent. `preStateHash` and `postStateHash`
 * remain first-class execution/state evidence fields on the receipt; they are
 * never interpreted as artifact IDs.
 *
 * The `extra` bag also now accepts schema-owned lifecycle fields (already
 * declared on `TxReceiptSchema` — `submittedAt`, `confirmedAt`, `rpcUrl`,
 * `tracePath`, `sourceSignedId`) so callers can populate the single canonical
 * receipt identity in one construction, rather than building a second wrapper
 * receipt with its own contentHash. Optional `parentArtifact` overrides the
 * lineage predecessor when the caller executed/submitted a signed artifact
 * rather than a plan (the plan remains referenced via `sourceSignedId` →
 * signed.sourcePlanId indirection preserved by the signed artifact).
 */
/**
 * Wave 2(d) · AUD-18: the fee a simulated execution charges is what the plan
 * consumes minus what it produces (payment outputs plus change). A plan whose
 * declared `estimatedFeeSompi` is not that difference cannot produce a receipt:
 * the receipt would record a fee the execution did not charge.
 */
export function deriveSimulatedFee(plan: TxPlan): { ok: true; feeSompi: bigint } | { ok: false; reason: string } {
  const inputs = Array.isArray(plan.inputs) ? plan.inputs : [];
  if (inputs.length === 0) return { ok: false, reason: "the plan records no inputs" };
  let consumed = 0n;
  for (const i of inputs) consumed += BigInt(i.amountSompi);
  let produced = 0n;
  for (const o of plan.outputs ?? []) produced += BigInt(o.amountSompi);
  if (plan.change) produced += BigInt(plan.change.amountSompi);
  if (produced > consumed) return { ok: false, reason: `outputs (${produced}) exceed inputs (${consumed})` };
  return { ok: true, feeSompi: consumed - produced };
}

export function createSimulatedTxReceipt(
  plan: TxPlan,
  txId: string,
  ctx: RuntimeContext,
  extra?: {
    spentUtxoIds?: string[];
    createdUtxoIds?: string[];
    daaScore?: string;
    preStateHash?: string;
    postStateHash?: string;
    dagContext?: DagContext;
    // Schema-owned lifecycle metadata (see TxReceiptSchema):
    submittedAt?: string;
    confirmedAt?: string;
    rpcUrl?: string;
    tracePath?: string;
    sourceSignedId?: string;
    // Lineage predecessor override (used when the caller executed a signed
    // artifact and the correct DAG parent is the signed, not the plan). The
    // object must carry contentHash + optional lineage for root propagation.
    parentArtifact?: { contentHash: string; lineage?: any };
  }
): TxReceipt {
  const lineagePredecessor = extra?.parentArtifact ?? (plan as any);
  // AUD-18: the recorded fee is the derived one; a plan that declares another fee is refused.
  const derivedFee = deriveSimulatedFee(plan);
  if (!derivedFee.ok) {
    throw new HardkasError("RECEIPT_FEE_UNDERIVABLE", `Refusing to write a simulated receipt: the fee cannot be derived from the plan (${derivedFee.reason})`);
  }
  if (BigInt(plan.estimatedFeeSompi) !== derivedFee.feeSompi) {
    throw new HardkasError(
      "RECEIPT_FEE_UNBALANCED",
      `Refusing to write a simulated receipt: the plan declares estimatedFeeSompi ${plan.estimatedFeeSompi} but consumes − produces = ${derivedFee.feeSompi}`
    );
  }
  const artifact: DraftArtifact<TxReceipt, "contentHash"> = {
    schema: HardkasSchemas.TxReceipt,
    schemaVersion: HardkasSchemas.TxReceiptV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: new Date(ctx.clock.now()).toISOString(),
    txId,
    status: "accepted",
    mode: "simulator",
    networkId: plan.networkId,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    feeSompi: derivedFee.feeSompi.toString(),
    mass: plan.estimatedMass,
    changeSompi: plan.change?.amountSompi,
    spentUtxoIds: extra?.spentUtxoIds,
    createdUtxoIds: extra?.createdUtxoIds,
    daaScore: extra?.daaScore,
    preStateHash: extra?.preStateHash,
    postStateHash: extra?.postStateHash,
    dagContext: extra?.dagContext,
    lineage: createLineageTransition(lineagePredecessor, HardkasSchemas.TxReceipt),
    execution: plan.execution || { mode: plan.mode as any, domain: "kaspa-l1", network: plan.networkId },
    ...(plan.workflowId ? { workflowId: plan.workflowId } : {}),
    ...(plan.assumptionLevel ? { assumptionLevel: plan.assumptionLevel } : {}),
    ...(extra?.submittedAt ? { submittedAt: extra.submittedAt } : {}),
    ...(extra?.confirmedAt ? { confirmedAt: extra.confirmedAt } : {}),
    ...(extra?.rpcUrl ? { rpcUrl: extra.rpcUrl } : {}),
    ...(extra?.tracePath ? { tracePath: extra.tracePath } : {}),
    ...(extra?.sourceSignedId ? { sourceSignedId: extra.sourceSignedId } : {})
  };

  const hash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
  artifact.contentHash = hash;
  if (artifact.lineage) {
    artifact.lineage.artifactId = hash; // receipt uses contentHash as artifactId
  }

  // Preserve VULN-03 immutability contract: the canonical receipt is frozen
  // at construction so no downstream consumer can silently mutate its
  // identity after hashing. Freezing here (rather than in the SDK wrapper)
  // is what keeps DEF-1c's single-identity invariant intact — a mutable
  // wrapper elsewhere could otherwise re-fork the receipt.
  return Object.freeze(artifact) as TxReceipt;
}

/**
 * Validates and extracts the raw transaction from a signed artifact.
 *
 * IC-6′.4: a synthetic authorization is never a signature, so it is never
 * broadcastable: it can only be executed by the simulator.
 */
export function getBroadcastableSignedTransaction(artifact: any): {
  mode: string;
  rawTransaction: string;
} {
  if (
    artifact?.signedTransaction?.format === SYNTHETIC_AUTHORIZATION_FORMAT ||
    artifact?.authorization?.kind === "synthetic"
  ) {
    throw new HardkasError(
      "SYNTHETIC_NOT_BROADCASTABLE",
      "A synthetic authorization is not a signed transaction: it is executable only in the simulator and is never broadcast"
    );
  }
  if (!artifact.signedTransaction?.payload) {
    throw new Error("Signed artifact is missing the raw transaction payload.");
  }

  return {
    mode: artifact.mode || "rpc",
    rawTransaction: artifact.signedTransaction.payload
  };
}
