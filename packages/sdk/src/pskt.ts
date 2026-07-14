import { createHash } from "node:crypto";
import {
  PortableSigningSession,
  PortableSigningPayload,
  PsktRuntimeCapabilities,
  SessionAttestation,
} from "@hardkas/core";
import * as kaspaWasm from "kaspa-wasm";

export class PsktError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PsktError";
  }
}

export class PsktRuntimeUnavailableError extends PsktError {
  constructor() {
    super("PSKT_RUNTIME_UNAVAILABLE");
    this.name = "PsktRuntimeUnavailableError";
  }
}

export class PsktExportUnsupportedError extends PsktError {
  constructor() {
    super("PSKT_EXPORT_UNSUPPORTED");
    this.name = "PsktExportUnsupportedError";
  }
}

export class PsktMergeUnsupportedError extends PsktError {
  constructor() {
    super("PSKT_MERGE_UNSUPPORTED");
    this.name = "PsktMergeUnsupportedError";
  }
}

export class PsktFinalizeUnsupportedError extends PsktError {
  constructor() {
    super("PSKT_FINALIZE_UNSUPPORTED");
    this.name = "PsktFinalizeUnsupportedError";
  }
}

export function capabilities(): PsktRuntimeCapabilities {
  const psktClass = "PSKT" in kaspaWasm;
  return {
    provider: "kaspa-wasm",
    version: "resolved-at-runtime",
    available: psktClass,
    serialize: psktClass,
    deserialize: psktClass,
    combine: psktClass,
    finalize: psktClass,
    extract: psktClass,
  };
}

function hasSensitiveKeys(obj: any): boolean {
  if (typeof obj !== "object" || obj === null) return false;
  if (Array.isArray(obj)) return obj.some(hasSensitiveKeys);
  
  const prohibitedKeys = [
    "privatekey", "private_key", "secretkey", 
    "seed", "seedphrase", "mnemonic", "xprv"
  ];
  
  for (const [key, value] of Object.entries(obj)) {
    if (prohibitedKeys.includes(key.toLowerCase())) {
      return true;
    }
    if (hasSensitiveKeys(value)) {
      return true;
    }
  }
  return false;
}

function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function canonicalStringify(obj: any): string {
  if (typeof obj !== 'object' || obj === null) return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `"${k}":${canonicalStringify(obj[k])}`).join(',')}}`;
}

export function computeSessionId(session: Partial<PortableSigningSession>): string {
  return sha256(canonicalStringify({
    networkId: session.networkId,
    planId: session.planId,
    schemaVersion: session.schemaVersion,
    unsignedTransactionId: session.unsignedTransactionId
  }));
}

export function computePayloadHash(payload: PortableSigningPayload): string {
  if (payload.format === "pskt-binary-base64") {
    return sha256(Buffer.from(payload.data, "base64"));
  } else {
    return sha256(canonicalStringify(payload.data));
  }
}

export function computeIntegrityHash(session: Omit<PortableSigningSession, "integrityHash" | "metadata" | "runtime" | "createdAt" | "updatedAt">): string {
  const canonicalFields = {
    attestations: session.attestations,
    kind: session.kind,
    networkId: session.networkId,
    parentRevisionHash: session.parentRevisionHash,
    participants: session.participants,
    payload: session.payload,
    planId: session.planId,
    requirements: session.requirements,
    revision: session.revision,
    schemaVersion: session.schemaVersion,
    sessionId: session.sessionId,
    state: session.state,
    unsignedTransactionId: session.unsignedTransactionId
  };
  return sha256(canonicalStringify(canonicalFields));
}

export function serializeSession(session: PortableSigningSession): string {
  return JSON.stringify(session, null, 2);
}

export function deserializeSession(json: string): PortableSigningSession {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new PsktError("Invalid JSON");
  }
  
  if (parsed.schemaVersion !== 1) throw new PsktError("Unsupported schema version");
  if (!parsed.payload || !["pskt-binary-base64", "pskb-bundle-json"].includes(parsed.payload.format)) {
    throw new PsktError("Unknown payload format");
  }
  if (!parsed.networkId) throw new PsktError("Empty networkId");
  if (parsed.revision < 0) throw new PsktError("Negative revision");
  
  const participants = parsed.participants || [];
  const pIds = new Set(participants.map((p: any) => p.id));
  if (pIds.size !== participants.length) throw new PsktError("Duplicate participants");

  const reqs = parsed.requirements || [];
  const reqIdx = new Set(reqs.map((r: any) => r.inputIndex));
  if (reqIdx.size !== reqs.length) throw new PsktError("Duplicate input indices in requirements");

  if (hasSensitiveKeys(parsed.metadata)) {
    throw new PsktError("Sensitive material rejected in metadata");
  }

  const result = verifySessionIntegrity(parsed as PortableSigningSession);
  if (!result.valid) {
    throw new PsktError(`Integrity check failed: ${result.reason}`);
  }

  return parsed as PortableSigningSession;
}

export function verifySessionIntegrity(session: PortableSigningSession): { valid: boolean, reason?: string } {
  const expectedSessionId = computeSessionId(session);
  if (session.sessionId !== expectedSessionId) {
    return { valid: false, reason: "sessionId mismatch or immutable fields violated" };
  }
  
  const expectedIntegrity = computeIntegrityHash(session);
  if (session.integrityHash !== expectedIntegrity) {
    return { valid: false, reason: "integrityHash mismatch" };
  }

  if (session.revision > 0 && !session.parentRevisionHash) {
    return { valid: false, reason: "Missing parentRevisionHash for revision > 0" };
  }

  const expectedPayloadHash = computePayloadHash(session.payload);
  if (session.payload.payloadHash !== expectedPayloadHash) {
    return { valid: false, reason: "payloadHash mismatch" };
  }

  if (session.payload.format === "pskt-binary-base64") {
    const regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    if (!regex.test(session.payload.data)) {
        return { valid: false, reason: "Invalid base64 payload" };
    }
  }

  return { valid: true };
}

export function createSessionRevision(
  previousSession: PortableSigningSession, 
  newPayload: PortableSigningPayload,
  attestation: SessionAttestation
): PortableSigningSession {
  
  const nextRevision = previousSession.revision + 1;
  
  const updatedSession = {
    ...previousSession,
    revision: nextRevision,
    parentRevisionHash: previousSession.integrityHash,
    payload: newPayload,
    attestations: [...previousSession.attestations, attestation],
    updatedAt: new Date().toISOString()
  };

  const integrityHash = computeIntegrityHash(updatedSession as Omit<PortableSigningSession, "integrityHash" | "metadata" | "runtime" | "createdAt" | "updatedAt">);

  return {
    ...updatedSession,
    integrityHash
  } as PortableSigningSession;
}

export function exportSession(plan: any): PortableSigningSession {
  const caps = capabilities();
  if (!caps.available) throw new PsktExportUnsupportedError();
  throw new Error("Not implemented");
}

export function mergeSessions(sessions: PortableSigningSession[]): PortableSigningSession {
  const caps = capabilities();
  if (!caps.available) throw new PsktMergeUnsupportedError();
  throw new Error("Not implemented");
}

export function finalizeSession(session: PortableSigningSession): PortableSigningSession {
  const caps = capabilities();
  if (!caps.available) throw new PsktFinalizeUnsupportedError();
  throw new Error("Not implemented");
}
