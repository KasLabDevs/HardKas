import { PsktRuntimeAdapter, PortableSigningPayload, PsktInspection, PsktRuntimeCapabilities, PsktAdapterTrustProfile, loadManagedKaspaWasmSync } from "@hardkas/core";
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
   * A1 (audit 2026-11-13): the exported payload is a PSKB bundle (the native wire format: base64 of "PSKB" + hex of the bundle
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

  /**
   * Like the native signer: the same PSKB bundle, with the key's partial signature on each input asked for.
   * `pskt.signSession` reads it back and refuses an input left unsigned or a changed transaction (kaspa-agent-notes
   * cross-check §2.3 item 4), so the double can no longer return an arbitrary "signed" blob.
   */
  async sign(payload: PortableSigningPayload, request: any): Promise<PortableSigningPayload> {
    const k: any = loadManagedKaspaWasmSync();
    const pub = String(new k.PrivateKey(Buffer.from(request.keyMaterial).toString("hex")).toPublicKey().toString());
    const bundle = JSON.parse(Buffer.from(Buffer.from(payload.data, "base64").toString("utf8").slice(4), "hex").toString("utf8"));
    for (const inner of bundle) {
      for (const i of request.inputIndexes) {
        inner.inputs[i].partialSigs = { ...(inner.inputs[i].partialSigs ?? {}), [pub]: { schnorr: "ab".repeat(64) } };
      }
    }
    return makePayload(Buffer.from("PSKB" + Buffer.from(JSON.stringify(bundle), "utf8").toString("hex"), "utf8").toString("base64"));
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
