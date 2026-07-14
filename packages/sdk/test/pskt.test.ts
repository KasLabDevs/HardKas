import { describe, it, expect } from "vitest";
import { PortableSigningSession } from "@hardkas/core";
import {
  capabilities,
  computeSessionId,
  computePayloadHash,
  computeIntegrityHash,
  verifySessionIntegrity,
  deserializeSession,
  createSessionRevision,
  exportSession,
  mergeSessions,
  finalizeSession,
  PsktRuntimeUnavailableError,
  PsktExportUnsupportedError,
  PsktMergeUnsupportedError,
  PsktFinalizeUnsupportedError
} from "../src/pskt.js";

describe("Portable Signing Sessions (PSKT)", () => {
  const createValidBaseSession = (): PortableSigningSession => {
    const payloadHash = computePayloadHash({
      format: "pskt-binary-base64",
      encoding: "base64",
      data: "AAAA", // Dummy valid-ish base64
      byteLength: 3,
      payloadHash: "" // we will set it below
    });

    const session: any = {
      kind: "hardkas-portable-signing-session",
      schemaVersion: 1,
      revision: 0,
      planId: "plan-123",
      networkId: "simnet",
      unsignedTransactionId: "tx-456",
      state: "blocked-by-runtime",
      payload: {
        format: "pskt-binary-base64",
        encoding: "base64",
        data: "AAAA",
        byteLength: 3,
        payloadHash
      },
      participants: [],
      requirements: [],
      attestations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    session.sessionId = computeSessionId(session);
    session.integrityHash = computeIntegrityHash(session);
    return session as PortableSigningSession;
  };

  it("should generate same sessionId and payloadHash regardless of timestamps", () => {
    const session1 = createValidBaseSession();
    const session2 = createValidBaseSession();
    
    session2.createdAt = new Date(Date.now() + 10000).toISOString();
    session2.updatedAt = new Date(Date.now() + 20000).toISOString();

    expect(computeSessionId(session1)).toBe(computeSessionId(session2));
    expect(computePayloadHash(session1.payload)).toBe(computePayloadHash(session2.payload));
    expect(computeIntegrityHash(session1)).toBe(computeIntegrityHash(session2));
  });

  it("should fail integrity verification if payload base64 is altered", () => {
    const session = createValidBaseSession();
    (session.payload as any).data = "BBBB";
    // Recalculate integrityHash so it passes that check and reaches the payload check
    (session as any).integrityHash = computeIntegrityHash(session);
    
    const result = verifySessionIntegrity(session);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("payloadHash mismatch");
  });

  it("should be schema invalid if revision 1 has no parentRevisionHash", () => {
    const session = createValidBaseSession();
    session.revision = 1;
    session.integrityHash = computeIntegrityHash(session);

    const result = verifySessionIntegrity(session);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing parentRevisionHash for revision > 0");
  });

  it("should violate immutable fields if networkId is modified between revisions", () => {
    const session = createValidBaseSession();
    
    const nextSession = createSessionRevision(
      session, 
      session.payload, 
      {
        participantId: "user-1",
        action: "sign",
        previousPayloadHash: session.payload.payloadHash,
        resultingPayloadHash: session.payload.payloadHash,
        adapter: "test"
      }
    );

    (nextSession as any).networkId = "mainnet";
    (nextSession as any).integrityHash = computeIntegrityHash(nextSession);

    const result = verifySessionIntegrity(nextSession);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("sessionId mismatch");
  });

  it("should reject sensitive material in metadata", () => {
    const session = createValidBaseSession();
    (session as any).metadata = {
      wallet: {
        mnemonic: "test",
        credentials: {
          seedPhrase: "test"
        }
      }
    };
    (session as any).integrityHash = computeIntegrityHash(session);

    expect(() => deserializeSession(JSON.stringify(session))).toThrowError(/Sensitive material/);

    const session2 = createValidBaseSession();
    (session2 as any).metadata = {
      nested: {
        private_Key: "test"
      }
    };
    expect(() => deserializeSession(JSON.stringify(session2))).toThrowError(/Sensitive material/);
  });

  it("should block operations on runtime 0.13.0", () => {
    const caps = capabilities();
    expect(caps.version).toBe("0.13.0");
    expect(caps.available).toBe(false);

    expect(() => exportSession({} as any)).toThrowError(PsktExportUnsupportedError);
    expect(() => mergeSessions([])).toThrowError(PsktMergeUnsupportedError);
    expect(() => finalizeSession({} as any)).toThrowError(PsktFinalizeUnsupportedError);
  });
});
