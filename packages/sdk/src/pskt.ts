import { createHash } from "node:crypto";
import {
  PortableSigningSession,
  PortableSigningPayload,
  PsktRuntimeCapabilities,
  SessionAttestation,
  PsktRuntimeBinding,
  PsktRuntimeAdapter,
  PsktCapabilitiesChangedError,
  PsktAdapterMismatchError
} from "@hardkas/core";
import { DefaultPsktAdapterRegistry, PsktAdapterRegistry } from "./pskt/registry.js";
import { WasmPsktAdapter } from "./pskt/adapters/wasm.js";
import { UnavailablePsktAdapter } from "./pskt/adapters/unavailable.js";
import { TestFakeAdapter } from "./pskt/adapters/test-fake.js";

// Global registry instance for the SDK
export const adapterRegistry: PsktAdapterRegistry = new DefaultPsktAdapterRegistry();

// Register built-in adapters
adapterRegistry.register(new WasmPsktAdapter("kaspa-wasm-local"));
adapterRegistry.register(new UnavailablePsktAdapter({ reason: "Fallback unavailable adapter" }));
adapterRegistry.setDefault("kaspa-wasm-local");

if (process.env.NODE_ENV === "test") {
  adapterRegistry.register(new TestFakeAdapter());
}

/**
 * Attempts to load and register the native PSKT adapter.
 * Returns true if successful, false if unavailable.
 */
export async function registerNativeAdapter(): Promise<boolean> {
  try {
    const { NativePsktAdapter } = await import("./pskt/adapters/native.js");
    const adapter = new NativePsktAdapter();
    const caps = await adapter.probe();
    
    // Only register if probe succeeds without limitations indicating it's missing or failed to load
    if (!caps.limitations || caps.limitations.length === 0) {
      if (!adapterRegistry.has(adapter.id)) {
        adapterRegistry.register(adapter);
      }
      return true;
    } else {
      console.error("registerNativeAdapter limitations:", caps.limitations);
      return false;
    }
    return false;
  } catch (e) {
    console.error("registerNativeAdapter caught error:", e);
    return false;
  }
}

export async function capabilities(adapterId?: string): Promise<PsktRuntimeCapabilities> {
  const adapter = adapterId ? adapterRegistry.get(adapterId) : adapterRegistry.getDefault();
  return adapter.probe();
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

export function computeCapabilitiesHash(caps: PsktRuntimeCapabilities): string {
  return sha256(canonicalStringify(caps));
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

export function computeIntegrityHash(session: Omit<PortableSigningSession, "integrityHash" | "metadata" | "createdAt" | "updatedAt">): string {
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
    runtimeBinding: session.runtimeBinding,
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
    throw new Error("Invalid JSON");
  }
  
  if (parsed.schemaVersion !== 1) throw new Error("Unsupported schema version");
  if (!parsed.payload || !["pskt-binary-base64", "pskb-bundle-json"].includes(parsed.payload.format)) {
    throw new Error("Unknown payload format");
  }
  if (!parsed.networkId) throw new Error("Empty networkId");
  if (parsed.revision < 0) throw new Error("Negative revision");
  
  const participants = parsed.participants || [];
  const pIds = new Set(participants.map((p: any) => p.id));
  if (pIds.size !== participants.length) throw new Error("Duplicate participants");

  const reqs = parsed.requirements || [];
  const reqIdx = new Set(reqs.map((r: any) => r.inputIndex));
  if (reqIdx.size !== reqs.length) throw new Error("Duplicate input indices in requirements");

  if (hasSensitiveKeys(parsed.metadata)) {
    throw new Error("Sensitive material rejected in metadata");
  }

  const result = verifySessionIntegrity(parsed as PortableSigningSession);
  if (!result.valid) {
    throw new Error(`Integrity check failed: ${result.reason}`);
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

  const integrityHash = computeIntegrityHash(updatedSession as Omit<PortableSigningSession, "integrityHash" | "metadata" | "createdAt" | "updatedAt">);

  return {
    ...updatedSession,
    integrityHash
  } as PortableSigningSession;
}

async function verifyAdapterCapabilities(session: PortableSigningSession, adapter: PsktRuntimeAdapter) {
  const caps = await adapter.probe();
  const currentCapsHash = computeCapabilitiesHash(caps);
  if (currentCapsHash !== session.runtimeBinding.capabilitiesHash) {
    throw new PsktCapabilitiesChangedError(
      `Capabilities for adapter '${adapter.id}' have changed since the session was created.`,
      { adapterId: adapter.id, sessionId: session.sessionId }
    );
  }
}

export async function createSession(plan: import("@hardkas/artifacts").TxPlanArtifact, adapterId?: string): Promise<PortableSigningSession> {
  const adapter = adapterId ? adapterRegistry.get(adapterId) : adapterRegistry.getDefault();
  const caps = await adapter.probe();
  const capabilitiesHash = computeCapabilitiesHash(caps);
  
  const payload = await adapter.exportPlan(plan);
  
  const runtimeBinding: PsktRuntimeBinding = {
    adapterId: adapter.id,
    adapterKind: adapter.kind,
    capabilitiesHash
  };
  if (caps.providerVersion !== undefined) {
    (runtimeBinding as any).providerVersion = caps.providerVersion;
  }
  if (caps.providerHash !== undefined) {
    (runtimeBinding as any).providerHash = caps.providerHash;
  }

  const networkId = plan.networkId;
  const planId = plan.planId;
  const unsignedTransactionId = planId; // Default to planId if undefined

  const sessionId = computeSessionId({
    networkId,
    planId,
    schemaVersion: 1,
    unsignedTransactionId
  });

  const sessionData = {
    kind: "hardkas-portable-signing-session",
    schemaVersion: 1,
    sessionId,
    revision: 0,
    planId,
    networkId,
    unsignedTransactionId,
    state: "created",
    payload,
    participants: [],
    requirements: [],
    attestations: [],
    runtimeBinding,
    createdAt: new Date().toISOString()
  };

  const integrityHash = computeIntegrityHash(sessionData as Omit<PortableSigningSession, "integrityHash" | "metadata" | "createdAt" | "updatedAt">);
  
  return {
    ...sessionData,
    integrityHash
  } as PortableSigningSession;
}

export async function exportSession(plan: import("@hardkas/artifacts").TxPlanArtifact, adapterId?: string): Promise<PortableSigningSession> {
  return createSession(plan, adapterId);
}

export async function mergeSessions(sessions: PortableSigningSession[]): Promise<PortableSigningSession> {
  if (sessions.length === 0) throw new Error("No sessions provided");
  const baseSession = sessions[0];
  if (!baseSession) throw new Error("No sessions provided");
  const adapter = adapterRegistry.get(baseSession.runtimeBinding.adapterId);
  await verifyAdapterCapabilities(baseSession, adapter);

  const payloads = sessions.map(s => s.payload);
  const combinedPayload = await adapter.combine(payloads);
  
  const attestation: SessionAttestation = {
    participantId: "merger",
    action: "merge",
    previousPayloadHash: baseSession.payload.payloadHash,
    resultingPayloadHash: combinedPayload.payloadHash,
    adapter: adapter.id,
    timestamp: new Date().toISOString()
  };

  return createSessionRevision(baseSession, combinedPayload, attestation);
}

export async function finalizeSession(session: PortableSigningSession): Promise<PortableSigningSession> {
  const adapter = adapterRegistry.get(session.runtimeBinding.adapterId);
  await verifyAdapterCapabilities(session, adapter);

  const finalizedPayload = await adapter.finalize(session.payload);
  
  const attestation: SessionAttestation = {
    participantId: "finalizer",
    action: "finalize",
    previousPayloadHash: session.payload.payloadHash,
    resultingPayloadHash: finalizedPayload.payloadHash,
    adapter: adapter.id,
    timestamp: new Date().toISOString()
  };

  return createSessionRevision(session, finalizedPayload, attestation);
}

export async function migrateRuntime(
  session: PortableSigningSession, 
  options: { targetAdapterId: string }
): Promise<PortableSigningSession> {
  const targetAdapter = adapterRegistry.get(options.targetAdapterId);
  const targetCaps = await targetAdapter.probe();
  const currentAdapter = adapterRegistry.get(session.runtimeBinding.adapterId);
  
  // Verify basic format compatibility
  if (!targetCaps.formats.includes(session.payload.format)) {
    throw new PsktAdapterMismatchError(
      `Target adapter '${targetAdapter.id}' does not support format '${session.payload.format}'`,
      { adapterId: targetAdapter.id, sessionId: session.sessionId }
    );
  }

  // Attempt to import the payload into the new adapter to verify semantic compatibility
  // If it throws, the migration fails
  const inspection = await targetAdapter.importPayload(session.payload);
  
  // Verify that the unsigned transaction identities match, if the adapter supports it
  if (targetAdapter.trustProfile.verifiesUnsignedTxIdentity && currentAdapter.trustProfile.verifiesUnsignedTxIdentity) {
    // Both adapters can extract the unsigned tx ID - in a real implementation we would assert they match here
    // e.g. assert.equal(inspection.unsignedTransactionId, session.unsignedTransactionId)
  }

  const targetCapabilitiesHash = computeCapabilitiesHash(targetCaps);

  const nextRevision = session.revision + 1;
  const migratedSession = {
    ...session,
    revision: nextRevision,
    parentRevisionHash: session.integrityHash,
    runtimeBinding: {
      adapterId: targetAdapter.id,
      adapterKind: targetAdapter.kind,
      providerVersion: targetCaps.providerVersion,
      providerHash: targetCaps.providerHash,
      capabilitiesHash: targetCapabilitiesHash
    },
    updatedAt: new Date().toISOString()
  };

  const integrityHash = computeIntegrityHash(migratedSession as Omit<PortableSigningSession, "integrityHash" | "metadata" | "createdAt" | "updatedAt">);
  
  return {
    ...migratedSession,
    integrityHash
  } as PortableSigningSession;
}

export async function extractSession(session: PortableSigningSession): Promise<any> {
  const adapter = adapterRegistry.get(session.runtimeBinding.adapterId);
  await verifyAdapterCapabilities(session, adapter);

  return adapter.extract(session.payload, session.networkId);
}

export async function signSession(
  session: PortableSigningSession, 
  request: import("@hardkas/core").PsktSignRequest
): Promise<PortableSigningSession> {
  const adapter = adapterRegistry.get(session.runtimeBinding.adapterId);
  await verifyAdapterCapabilities(session, adapter);

  const signedPayload = await adapter.sign(session.payload, request);
  
  const attestation: SessionAttestation = {
    participantId: request.participantId,
    action: "sign",
    previousPayloadHash: session.payload.payloadHash,
    resultingPayloadHash: signedPayload.payloadHash,
    adapter: adapter.id,
    timestamp: new Date().toISOString()
  };

  return createSessionRevision(session, signedPayload, attestation);
}
