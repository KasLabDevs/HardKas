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
 * Test-only fake PSKT adapter, for the CLI orchestration test (`pskt-cli.test.ts`).
 *
 * SURFACE-TRUTH-1B (ST-C): it lives with the tests and only `pskt-cli-with-test-double.ts` registers it. It used to
 * ship in `@hardkas/sdk` `src`, registered whenever NODE_ENV was "test".
 */
export class TestFakeAdapter implements PsktRuntimeAdapter {
  id = "test-fake-adapter";
  kind = "custom" as const;

  trustProfile: PsktAdapterTrustProfile = {
    processBoundary: "same-process",
    privateKeysLeaveProcess: false,
    payloadLeavesProcess: false,
    verifiesUnsignedTxIdentity: false,
    transportEncrypted: false,
    adapterAuthenticated: false
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

  /**
   * A1 (rc2 audit): the exported payload is a PSKB bundle (the native wire format: base64 of "PSKB" + hex of the bundle
   * JSON) whose inputs are the plan's, so `pskt sign` can read each input's outpoint and UTXO script and ask the
   * signer's node about it, as it does for a real PSKT.
   */
  async exportPlan(plan: any): Promise<PortableSigningPayload> {
    const inputs = (Array.isArray(plan?.inputs) ? plan.inputs : []).map((u: any) => ({
      utxoEntry: { amount: Number(u.amountSompi ?? 0), scriptPublicKey: u.scriptPublicKey, blockDaaScore: 0, isCoinbase: false, covenantId: null },
      previousOutpoint: { transactionId: u.outpoint?.transactionId, index: u.outpoint?.index },
      sighashType: 1
    }));
    const bundle = [{ global: { version: 1, plan: plan.planId }, inputs, outputs: [] }];
    const data = Buffer.from("PSKB" + Buffer.from(JSON.stringify(bundle), "utf8").toString("hex"), "utf8").toString("base64");
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
