import { PsktRuntimeAdapter, PortableSigningPayload, PsktInspection, PsktRuntimeCapabilities, PsktAdapterTrustProfile } from "@hardkas/core";
import crypto from "node:crypto";

function hashBase64(data: string): string {
  return crypto.createHash("sha256").update(Buffer.from(data, "base64")).digest("hex");
}

function makePayload(data: string): PortableSigningPayload {
  return {
    format: "pskt-binary-base64" as const,
    encoding: "base64" as const,
    data,
    byteLength: Buffer.from(data, "base64").length,
    payloadHash: hashBase64(data)
  };
}

/**
 * Test-only fake PSKT adapter.
 *
 * NON-CANONICAL — must never ship as default runtime.
 * Used exclusively for CLI orchestration tests.
 */
export class TestFakeAdapter implements PsktRuntimeAdapter {
  id = "test-fake-adapter";
  kind: "custom" = "custom";

  trustProfile: PsktAdapterTrustProfile = {
    processBoundary: "same-process",
    privateKeysLeaveProcess: false,
    payloadLeavesProcess: false,
    verifiesUnsignedTxIdentity: true,
    transportEncrypted: true,
    adapterAuthenticated: true
  };

  async probe(): Promise<PsktRuntimeCapabilities> {
    return {
      providerId: this.id,
      providerKind: this.kind,
      providerVersion: "1.0.0-test",
      formats: ["pskt-binary-base64"],
      operations: {
        export: true,
        import: true,
        inspect: true,
        sign: true,
        combine: true,
        finalize: true,
        extract: true
      }
    };
  }

  async exportPlan(plan: any): Promise<PortableSigningPayload> {
    const data = Buffer.from(JSON.stringify({ state: "exported", plan: plan.planId })).toString("base64");
    return makePayload(data);
  }

  async importPayload(payload: PortableSigningPayload): Promise<PsktInspection> {
    return {
      unsignedTransactionId: "fake-tx-id",
    };
  }

  async sign(payload: PortableSigningPayload, request: any): Promise<PortableSigningPayload> {
    const data = Buffer.from(JSON.stringify({ state: "signed", participant: request.participantId })).toString("base64");
    return makePayload(data);
  }

  async combine(payloads: readonly PortableSigningPayload[]): Promise<PortableSigningPayload> {
    const data = Buffer.from(JSON.stringify({ state: "merged", count: payloads.length })).toString("base64");
    return makePayload(data);
  }

  async finalize(payload: PortableSigningPayload): Promise<PortableSigningPayload> {
    const data = Buffer.from(JSON.stringify({ state: "finalized" })).toString("base64");
    return makePayload(data);
  }

  async extract(payload: PortableSigningPayload): Promise<any> {
    return {
      kind: "hardkas-transaction",
      txId: "fake-tx-id",
      raw: "00112233"
    };
  }
}
