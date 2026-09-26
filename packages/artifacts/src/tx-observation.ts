import { HardkasSchemas, finalityDepthFor } from "@hardkas/core";
import type { RuntimeContext } from "@hardkas/core";
import { ARTIFACT_VERSION, TxObservationSchema } from "./schemas.js";
import type { TxObservation, TxObservationFinding, TxObservationPoint } from "./schemas.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "./canonical.js";
import { domainDigest } from "./domain-digest.js";
import { HARDKAS_VERSION } from "./constants.js";

// Wave 2(a) · Q4 (ratified 2026-09-26) / IC-2′.3 — `hardkas.txObservation.v1`.
// "Persist facts; derive states." An observation records what ONE observer saw
// about a txId at ONE point; it is immutable, authenticated, and never a verdict.

/** Interim observer description until the normalised `endpoint` is ratified (D-Q1.a). */
export const RPC_OBSERVER_DESCRIPTION = "observation obtained through the configured RPC observer";
export const SYNTHETIC_OBSERVER_DESCRIPTION = "synthetic observation produced by the HardKAS simulator (no network)";

export type TxObservationCoherence = { ok: true } | { ok: false; message: string; path?: string };

const big = (s: unknown): bigint | undefined => {
  if (typeof s !== "string" || !/^\d+$/.test(s)) return undefined;
  return BigInt(s);
};

/**
 * Pure coherence rules of ONE observation against itself and the upstream
 * parameters (no store, no RPC):
 *  - `chain_accepted` / `finality_reached`: `confirmationsBlue = point.sinkBlueScore − acceptingBlueScore`;
 *  - `finality_reached`: `finalityDepth` is the network's verified depth and `confirmationsBlue ≥ finalityDepth`;
 *  - `synthetic_executed` ⇔ `observer.kind = "synthetic"`;
 *  - `mempool_entry`/chain findings need an `rpc` observer.
 */
export function checkTxObservationCoherence(observation: unknown): TxObservationCoherence {
  const parsed = TxObservationSchema.safeParse(observation);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const issuePath = first?.path.join(".");
    return {
      ok: false,
      message: `observation does not match hardkas.txObservation.v1: ${issuePath}: ${first?.message}`,
      ...(issuePath ? { path: issuePath } : {})
    };
  }
  const o = parsed.data;
  const sinkBlue = big(o.point.sinkBlueScore)!;
  const f = o.finding;
  const synthetic = o.observer.kind === "synthetic";
  if ((f.type === "synthetic_executed") !== synthetic) {
    return { ok: false, message: "a synthetic finding requires a synthetic observer and vice versa", path: "finding.type" };
  }
  if (f.type === "chain_accepted" || f.type === "finality_reached") {
    const acceptingBlue = big(f.acceptingBlueScore)!;
    const confirmations = big(f.confirmationsBlue)!;
    if (acceptingBlue > sinkBlue) {
      return { ok: false, message: "acceptingBlueScore is above the observation point's sinkBlueScore", path: "finding.acceptingBlueScore" };
    }
    if (confirmations !== sinkBlue - acceptingBlue) {
      return { ok: false, message: `confirmationsBlue must be sinkBlueScore − acceptingBlueScore (${(sinkBlue - acceptingBlue).toString()})`, path: "finding.confirmationsBlue" };
    }
    if (f.type === "chain_accepted" && f.acceptingDaaScore !== undefined && f.confirmationsDaa !== undefined) {
      const daa = big(o.point.virtualDaaScore)! - big(f.acceptingDaaScore)!;
      if (daa !== big(f.confirmationsDaa)) {
        return { ok: false, message: "confirmationsDaa must be virtualDaaScore − acceptingDaaScore", path: "finding.confirmationsDaa" };
      }
    }
    if (f.type === "finality_reached") {
      const depth = finalityDepthFor(o.observer.networkId);
      if (depth === undefined) {
        return { ok: false, message: `HardKAS has no verified finality depth for network ${o.observer.networkId}; finality cannot be observed`, path: "observer.networkId" };
      }
      if (big(f.finalityDepth) !== BigInt(depth)) {
        return { ok: false, message: `finalityDepth must be the verified upstream depth for ${o.observer.networkId} (${depth})`, path: "finding.finalityDepth" };
      }
      if (confirmations < BigInt(depth)) {
        return { ok: false, message: `finality_reached needs confirmationsBlue ≥ ${depth} (got ${confirmations.toString()})`, path: "finding.confirmationsBlue" };
      }
    }
  }
  return { ok: true };
}

export interface TxObservationInput {
  networkId: TxObservation["networkId"];
  mode: TxObservation["mode"];
  execution?: TxObservation["execution"];
  subject: TxObservation["subject"];
  observer: TxObservation["observer"];
  point: TxObservationPoint;
  finding: TxObservationFinding;
  evidence: TxObservation["evidence"];
  rpcUrl?: string;
  workflowId?: string;
  assumptionLevel?: string;
}

/** Digest of a raw RPC response kept as evidence (IC-1′.7 domain digest, never an identity). */
export function evidenceDigest(response: unknown): string {
  return domainDigest(response === undefined ? null : response);
}

export const OBSERVER_ID_PATTERN = /^obs_[0-9a-f]{64}$/;

/**
 * The opaque, stable identity of a HardKAS observer instance: a domain digest of
 * what configures it (its kind, the configured target and its raw locator). Same
 * configuration ⇒ same observer ⇒ ONE history; the locator itself is never exposed.
 */
export function deriveObserverId(input: { kind: "rpc" | "synthetic"; target: string; locator?: string }): string {
  return `obs_${domainDigest({ kind: input.kind, target: input.target, locator: input.locator ?? "" })}`;
}

/**
 * Seals ONE observation (v5, FULL). No lineage (IC-2′.5). Refuses an incoherent
 * observation instead of persisting a fact that contradicts itself.
 */
export function createTxObservationArtifact(input: TxObservationInput, ctx: RuntimeContext): TxObservation {
  const body: Record<string, unknown> = {
    schema: HardkasSchemas.TxObservationV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: new Date(ctx.clock.now()).toISOString(),
    networkId: input.networkId,
    mode: input.mode,
    ...(input.execution ? { execution: input.execution } : {}),
    subject: input.subject,
    observer: input.observer,
    point: input.point,
    finding: input.finding,
    evidence: input.evidence,
    observedAt: new Date(ctx.clock.now()).toISOString(),
    ...(input.rpcUrl ? { rpcUrl: input.rpcUrl } : {}),
    ...(input.workflowId ? { workflowId: input.workflowId } : {}),
    ...(input.assumptionLevel ? { assumptionLevel: input.assumptionLevel } : {})
  };
  const coherence = checkTxObservationCoherence(body);
  if (!coherence.ok) {
    const e = new Error(`OBSERVATION_INCOHERENT: ${coherence.message}`);
    (e as any).code = "OBSERVATION_INCOHERENT";
    throw e;
  }
  body.contentHash = calculateContentHash(body, CURRENT_HASH_VERSION);
  return Object.freeze(body) as unknown as TxObservation;
}
