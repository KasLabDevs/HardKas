import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { escrowRoutes, memoryStore, type EscrowRecord } from "../src/routes/escrow.js";

// Route-level checks that a failed authority (compiler, signer, unlock tool, node)
// never turns into success, a fabricated value, or a persisted success state.

const json = { "Content-Type": "application/json" };

// x-only public keys that match no local dev account.
const config = {
  buyer: { publicKeyHex: "11".repeat(32) },
  seller: { publicKeyHex: "22".repeat(32) },
  arbiter: { publicKeyHex: "33".repeat(32) },
  buyerDestinationSpk: "20" + "44".repeat(32) + "ac",
  sellerDestinationSpk: "20" + "55".repeat(32) + "ac",
  refundAmount: "100000000",
  releaseAmount: "100000000"
};

const policies: Record<string, { requiredSigners: string[]; recipient: string; amountKey: string }> = {
  mutualRelease: { requiredSigners: ["buyer", "seller"], recipient: "buyer", amountKey: "refundAmount" }
};

function seed(overrides: Partial<EscrowRecord> = {}): EscrowRecord {
  const id = crypto.randomUUID();
  const record = {
    id,
    config: config as any,
    state: "CREATED",
    artifact: { schema_version: 1, contracts: {} },
    p2shState: { lockingScriptHex: "aa20" + "66".repeat(32) + "87", redeemScriptHex: "aabbccdd75", address: "" },
    provenance: {} as any,
    funding: { status: "none" },
    signatures: {},
    ...overrides
  } as EscrowRecord;
  memoryStore.set(id, record);
  return record;
}

function readyToRelease(): EscrowRecord {
  // A spend draft over the recorded funding output (never broadcast by these tests).
  const draft = {
    schema: "hardkas.silver.spendDraft.v1",
    networkId: "simnet",
    contractName: "Escrow",
    entry: "mutualRelease",
    signers: ["buyer", "seller"],
    input: {
      outpoint: { transactionId: "77".repeat(32), index: 0 },
      amountSompi: "200000000",
      scriptPublicKey: { version: 0, script: "aa20" + "66".repeat(32) + "87" },
      blockDaaScore: "1",
      isCoinbase: false,
      sequence: "0",
      sigOpCount: 2
    },
    outputs: [{ valueSompi: "100000000", scriptPublicKey: { version: 0, script: config.buyerDestinationSpk } }],
    feeSompi: "100000000",
    mass: "0",
    storageMass: "0",
    unlockHexLength: 0,
    unsignedTxId: "88".repeat(32)
  };
  const policy = policies.mutualRelease;
  return seed({
    state: "READY_TO_RELEASE",
    funding: {
      status: "confirmed",
      transactionId: "77".repeat(32),
      outputIndex: 0,
      amountSompi: "200000000",
      utxoEntry: { amount: "200000000", scriptPublicKey: { version: 0, scriptPublicKey: "aa20" + "66".repeat(32) + "87" }, blockDaaScore: "1", isCoinbase: false }
    },
    preparedRelease: {
      branch: "mutualRelease",
      draft,
      args: [{ kind: "signer", signer: "buyer" }, { kind: "signer", signer: "seller" }],
      expectedOutputsHash: crypto.createHash("sha256").update(JSON.stringify(draft.outputs)).digest("hex"),
      policyHash: crypto.createHash("sha256").update(JSON.stringify(policy)).digest("hex")
    },
    signatures: { buyer: "aa".repeat(64), seller: "bb".repeat(64) }
  });
}

beforeEach(() => memoryStore.clear());

describe("escrow routes fail closed", () => {
  it("create never returns a fabricated redeem script", async () => {
    const res = await escrowRoutes.request("/", { method: "POST", headers: json, body: JSON.stringify(config) });
    const body = await res.json();
    if (body.ok) {
      // Only with a real, compatible compiler: the escrow carries compile evidence.
      expect(body.data.provenance?.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(memoryStore.get(body.data.id)?.p2shState.redeemScriptHex === "51010203").toBe(false);
    } else {
      expect(body.error).toMatch(/^ESCROW_(SILVERC_UNAVAILABLE|SILVERC_FAILED|ARTIFACT_INVALID|CONFIG_INVALID)/);
      expect(memoryStore.size).toBe(0);
    }
  });

  it("create refuses keys the v1 contract cannot take and persists nothing", async () => {
    const compressed = { ...config, buyer: { publicKeyHex: "02" + "11".repeat(32) } };
    const res = await escrowRoutes.request("/", { method: "POST", headers: json, body: JSON.stringify(compressed) });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/^ESCROW_CONFIG_INVALID/);
    expect(memoryStore.size).toBe(0);
  });

  it("fund refuses to spend from an account other than the buyer and persists nothing", async () => {
    const record = seed();
    const res = await escrowRoutes.request(`/${record.id}/fund`, { method: "POST" });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/^ESCROW_BUYER_ACCOUNT_NOT_FOUND/);
    expect(memoryStore.get(record.id)?.state).toBe("CREATED");
    expect(memoryStore.get(record.id)?.funding.status).toBe("none");
    expect(memoryStore.get(record.id)?.funding.transactionId).toBeUndefined();
  });

  it("sign refuses to sign without the signer's key and stores no signature", async () => {
    const record = readyToRelease();
    record.state = "PARTIALLY_SIGNED";
    record.signatures = {};
    const res = await escrowRoutes.request(`/${record.id}/sign`, { method: "POST", headers: json, body: JSON.stringify({ role: "buyer" }) });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/^ESCROW_SIGNER_NOT_FOUND/);
    expect(memoryStore.get(record.id)?.signatures).toEqual({});
    expect(memoryStore.get(record.id)?.state).toBe("PARTIALLY_SIGNED");
  });

  it("release never reports success when unlock or submission fails", async () => {
    const record = readyToRelease();
    const res = await escrowRoutes.request(`/${record.id}/release`, { method: "POST" });
    const body = await res.json();
    // Invalid artifact and fake signatures: finalization or the node must reject.
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/ESCROW_(UNLOCK_FAILED|RELEASE_FAILED)/);
    const after = memoryStore.get(record.id)!;
    expect(after.state).toBe("READY_TO_RELEASE");
    expect(after.release).toBeUndefined();
    expect(after.preparedRelease?.draft.unsignedTxId).toBe("88".repeat(32));
  }, 30000);

  it("sign finds the signer by its x-only key, and still refuses a draft that does not rebuild to its id", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-escrow-signer-"));
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    try {
      const { getOrCreateDevAccount, loadKaspaWasm } = await import("@hardkas/accounts");
      const buyer = await getOrCreateDevAccount(dir, 0, "buyer");
      const k = await loadKaspaWasm();
      const xOnly = String(new k.PrivateKey(buyer.privateKey).toPublicKey().toXOnlyPublicKey().toString());
      const record = readyToRelease();
      record.state = "PARTIALLY_SIGNED";
      record.signatures = {};
      record.config = { ...config, buyer: { publicKeyHex: xOnly } } as any;
      const res = await escrowRoutes.request(`/${record.id}/sign`, { method: "POST", headers: json, body: JSON.stringify({ role: "buyer" }) });
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/^ESCROW_SIGNER_FAILED/);
      expect(memoryStore.get(record.id)?.signatures).toEqual({});
    } finally {
      cwd.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);

  it("sign refuses to sign over a funding UTXO that was never recorded", async () => {
    const record = readyToRelease();
    record.state = "PARTIALLY_SIGNED";
    record.signatures = {};
    delete (record.funding as any).utxoEntry;
    const res = await escrowRoutes.request(`/${record.id}/sign`, { method: "POST", headers: json, body: JSON.stringify({ role: "buyer" }) });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/^ESCROW_FUNDING_UTXO_UNKNOWN/);
    expect(memoryStore.get(record.id)?.signatures).toEqual({});
  });

  it("rejects a signer that the branch policy does not require", async () => {
    const record = readyToRelease();
    record.state = "PARTIALLY_SIGNED";
    const res = await escrowRoutes.request(`/${record.id}/sign`, { method: "POST", headers: json, body: JSON.stringify({ role: "arbiter" }) });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Role arbiter is not required");
  });

  it("rejects prepare with an unknown branch", async () => {
    const record = seed({ state: "FUNDED" });
    const res = await escrowRoutes.request(`/${record.id}/release/prepare`, { method: "POST", headers: json, body: JSON.stringify({ branch: "fakeBranch" }) });
    expect((await res.json()).ok).toBe(false);
  });

  it("rejects release before all signatures are present", async () => {
    const record = readyToRelease();
    record.state = "PARTIALLY_SIGNED";
    const res = await escrowRoutes.request(`/${record.id}/release`, { method: "POST" });
    expect((await res.json()).ok).toBe(false);
  });
});
