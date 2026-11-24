import { describe, it, expect, vi } from "vitest";
import { loadManagedKaspaWasmSync, systemRuntimeContext, type PsktRuntimeAdapter, type PortableSigningSession } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION, HARDKAS_VERSION, createV1TxPlanArtifact } from "@hardkas/artifacts";
import { buildV1WasmTransaction, V1_TX_DRAFT_SCHEMA, type V1TxDraft } from "@hardkas/accounts";
import { HardkasCovenants } from "../src/covenants.js";
import * as pskt from "../src/pskt.js";

const KEY = "11".repeat(32);
const ctx = {
  ...systemRuntimeContext,
  clock: { ...systemRuntimeContext.clock, now: () => Date.parse("2026-11-24T00:00:00.000Z") }
} as any;

async function codeOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
  } catch (e: any) {
    return e?.code ?? String(e?.message ?? e).split(":")[0];
  }
  return undefined;
}

describe("Priority 1 · Mainnet lockdown in covenants.signDraft and pskt operations", () => {
  it("covenants.signDraft refuses mainnet before calling keys.privateKeyOf()", async () => {
    const k = loadManagedKaspaWasmSync();
    const pk = new k.PrivateKey(KEY);
    const addr = String(pk.toPublicKey().toAddress("mainnet").toString());
    const xonly = String(pk.toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();
    const spk = `000020${xonly}ac`;
    const plan = createV1TxPlanArtifact({
      networkId: "mainnet" as any,
      mode: "rpc" as any,
      from: { input: "alice", address: addr },
      to: { input: "alice", address: addr },
      amountSompi: 100_000_000n,
      body: {
        txVersion: 1,
        inputs: [
          {
            outpoint: { transactionId: "aa".repeat(32), index: 0 },
            amountSompi: "200000000",
            address: addr,
            scriptPublicKey: spk,
            kind: "p2pk",
            computeBudget: 10,
            signer: "alice"
          }
        ],
        outputs: [{ address: addr, amountSompi: "199000000", role: "payment" }],
        estimatedFeeSompi: "1000000",
        estimatedMass: "0",
        storageMass: "1",
        maxFeeSompi: "2000000"
      },
      ctx
    });
    const txId = String(buildV1WasmTransaction(k, plan).id);
    const unsignedDraft: Omit<V1TxDraft, "contentHash"> = {
      schema: V1_TX_DRAFT_SCHEMA,
      hardkasVersion: HARDKAS_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      networkId: "mainnet",
      planArtifactId: plan.contentHash,
      txId,
      slots: [{ input: 0, kind: "p2pk", signer: "alice", publicKey: xonly }]
    };
    const draft: V1TxDraft = {
      ...unsignedDraft,
      contentHash: calculateContentHash(unsignedDraft as any, CURRENT_HASH_VERSION)
    };

    const privateKeyOf = vi.fn(async () => KEY);
    const covenants = new HardkasCovenants({
      network: "simnet",
      config: { config: {} }
    } as any);

    const code = await codeOf(() =>
      covenants.signDraft(draft, plan, "alice", {
        keys: { publicKeyOf: () => xonly, privateKeyOf }
      })
    );
    expect(code).toBe("MAINNET_SIGNING_DISABLED");
    expect(privateKeyOf).not.toHaveBeenCalled();
  });

  it("pskt createSession, mergeSessions, finalizeSession, migrateRuntime, and extractSession refuse mainnet before invoking adapter", async () => {
    const spyId = "audit-spy-pskt-adapter";
    const exportPlan = vi.fn(async () => {
      throw new Error("should not call exportPlan");
    });
    const combine = vi.fn(async () => {
      throw new Error("should not call combine");
    });
    const finalize = vi.fn(async () => {
      throw new Error("should not call finalize");
    });
    const importPayload = vi.fn(async () => {
      throw new Error("should not call importPayload");
    });
    const extract = vi.fn(async () => {
      throw new Error("should not call extract");
    });

    const spyCaps = {
      adapterId: spyId,
      adapterKind: "native" as const,
      providerVersion: "test-1.0",
      providerHash: "00".repeat(32),
      formats: ["pskt-binary-base64" as const],
      operations: { export: true, import: true, sign: true, combine: true, finalize: true, extract: true },
      limitations: []
    };
    const spyAdapter: PsktRuntimeAdapter = {
      id: spyId,
      kind: "native",
      trustProfile: { verifiesUnsignedTxIdentity: false } as any,
      probe: async () => spyCaps,
      exportPlan,
      importPayload,
      sign: async () => {
        throw new Error("should not call sign");
      },
      combine,
      finalize,
      extract
    };
    pskt.adapterRegistry.register(spyAdapter);
    try {
      const capsHash = pskt.computeCapabilitiesHash(spyCaps);
      const payloadHash = pskt.computePayloadHash({
        format: "pskt-binary-base64",
        encoding: "base64",
        data: "AAAA",
        byteLength: 3,
        payloadHash: ""
      });
      const base: any = {
        kind: "hardkas-portable-signing-session",
        schemaVersion: 1,
        revision: 0,
        planId: "plan-m",
        networkId: "kaspa-mainnet",
        unsignedTransactionId: "plan-m",
        state: "created",
        payload: { format: "pskt-binary-base64", encoding: "base64", data: "AAAA", byteLength: 3, payloadHash },
        participants: [],
        requirements: [],
        attestations: [],
        runtimeBinding: {
          adapterId: spyId,
          adapterKind: "native",
          providerVersion: spyCaps.providerVersion,
          providerHash: spyCaps.providerHash,
          capabilitiesHash: capsHash
        },
        createdAt: "2026-11-24T00:00:00.000Z"
      };
      base.sessionId = pskt.computeSessionId(base);
      base.integrityHash = pskt.computeIntegrityHash(base);
      const mainnetSession = base as PortableSigningSession;

      expect(await codeOf(() => pskt.createSession({ networkId: "mainnet", planId: "p" } as any, spyId))).toBe("MAINNET_SIGNING_DISABLED");
      expect(await codeOf(() => pskt.mergeSessions([mainnetSession]))).toBe("MAINNET_SIGNING_DISABLED");
      expect(await codeOf(() => pskt.finalizeSession(mainnetSession))).toBe("MAINNET_SIGNING_DISABLED");
      expect(await codeOf(() => pskt.migrateRuntime(mainnetSession, { targetAdapterId: spyId }))).toBe("MAINNET_SIGNING_DISABLED");
      expect(await codeOf(() => pskt.extractSession(mainnetSession))).toBe("MAINNET_SIGNING_DISABLED");

      expect(exportPlan).not.toHaveBeenCalled();
      expect(combine).not.toHaveBeenCalled();
      expect(finalize).not.toHaveBeenCalled();
      expect(importPayload).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
    } finally {
      pskt.adapterRegistry.unregister(spyId);
    }
  });
});
