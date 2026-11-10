import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { escrowRoutes, escrowNode, memoryStore, type EscrowRecord } from "../src/routes/escrow.js";
import { serverAllowsDevAutoSign } from "../src/routes/dev-autosign.js";
import { serverAllowsDevAutoSign as reExported } from "../src/routes/dapp-tx.js";
import { H, factoryOf, fakeEscrowNode, type FakeEscrowNode, type FakeUtxo } from "./helpers/fake-escrow-node.js";

// N-11 · the escrow journal fixes its path when ../src/routes/escrow.js is imported: point it at a temporary file before
// that import (vi.hoisted runs first), so this test never writes <repo>/.hardkas/escrow-store.json.
await vi.hoisted(async () => {
  const osMod = await import("node:os");
  const pathMod = await import("node:path");
  const fsMod = await import("node:fs");
  process.env.HARDKAS_ESCROW_STORE_PATH = pathMod.join(fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), "hk-erf-store-")), "escrow-store.json");
});

// -----------------------------------------------------------------------------
// Pre-release round · evasion route (f) of step 4: `POST /api/escrows/:id/fund` (the buyer's dev account signs the
// funding) and `POST /api/escrows/:id/sign` (a role's dev account signs the spend) signed with the dev server's own
// accounts for any HTTP client, without `HARDKAS_DEV_SERVER_AUTOSIGN`, while `POST /api/tx/send|sign` already needed
// it (TX-06 / P38). Now they take the same server decision, the one function `serverAllowsDevAutoSign`
// (routes/dev-autosign.ts, not a copy): off by default, opened only by the value 1 in the server's environment, and
// then only on a local simnet (the routes always reach the canonical localnet as simnet). The refusal,
// DEV_AUTOSIGN_NOT_ALLOWED (HTTP 403), comes before the escrow record, any account or key is read and before the node
// is contacted. Before: the hermetic escrow tests funded and signed with no variable set. A stand-in of the official
// client (no network); the buyer is a dev account of a temporary workspace.
// -----------------------------------------------------------------------------

const LOCK = "aa20" + H("erf p2sh") + "87";
const json = { "Content-Type": "application/json" };

let dir: string;
let cwd: ReturnType<typeof vi.spyOn>;
let buyer: { address: string; xOnly: string; spk: string };
let node: FakeEscrowNode;

function seed(overrides: Partial<EscrowRecord> = {}): EscrowRecord {
  const id = crypto.randomUUID();
  const record = {
    id,
    config: {
      buyer: { publicKeyHex: buyer.xOnly },
      seller: { publicKeyHex: "22".repeat(32) },
      arbiter: { publicKeyHex: "33".repeat(32) },
      buyerDestinationSpk: "20" + "44".repeat(32) + "ac",
      sellerDestinationSpk: "20" + "55".repeat(32) + "ac",
      refundAmount: "100000000",
      releaseAmount: "100000000"
    },
    state: "CREATED",
    artifact: { schema_version: 1, contracts: {} },
    p2shState: { lockingScriptHex: LOCK, redeemScriptHex: "aabbccdd75", address: "" },
    provenance: {},
    funding: { status: "none" },
    signatures: {},
    ...overrides
  } as unknown as EscrowRecord;
  memoryStore.set(id, record);
  return record;
}

/** A record whose mutual release is prepared (a draft that does not rebuild to its id: never broadcast here). */
function prepared(): EscrowRecord {
  const draft = {
    schema: "hardkas.silver.spendDraft.v1",
    networkId: "simnet",
    contractName: "Escrow",
    entry: "mutualRelease",
    signers: ["buyer", "seller"],
    input: {
      outpoint: { transactionId: "77".repeat(32), index: 0 },
      amountSompi: "200000000",
      scriptPublicKey: { version: 0, script: LOCK },
      blockDaaScore: "1",
      isCoinbase: false,
      sequence: "0",
      sigOpCount: 2
    },
    outputs: [{ valueSompi: "100000000", scriptPublicKey: { version: 0, script: "20" + "44".repeat(32) + "ac" } }],
    feeSompi: "100000000",
    mass: "0",
    storageMass: "0",
    unlockHexLength: 0,
    unsignedTxId: "88".repeat(32)
  };
  return seed({
    state: "PARTIALLY_SIGNED",
    funding: {
      status: "confirmed",
      transactionId: "77".repeat(32),
      outputIndex: 0,
      amountSompi: "200000000",
      utxoEntry: { amount: "200000000", scriptPublicKey: { version: 0, scriptPublicKey: LOCK }, blockDaaScore: "1", isCoinbase: false }
    },
    preparedRelease: {
      branch: "mutualRelease",
      draft,
      args: [{ kind: "signer", signer: "buyer" }, { kind: "signer", signer: "seller" }],
      expectedOutputsHash: "00".repeat(32),
      policyHash: "00".repeat(32)
    },
    signatures: {}
  });
}

const utxo = (n: number, sompi: bigint): FakeUtxo => ({ outpoint: { transactionId: H(`erf buyer utxo ${n}`), index: 0 }, address: buyer.address, amount: sompi, spk: buyer.spk, daa: 1000n + BigInt(n) });
const post = async (p: string, body: unknown = {}) => {
  const res = await escrowRoutes.request(p, { method: "POST", headers: json, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};
const untouched = (before: EscrowRecord, id: string) => expect(JSON.stringify(memoryStore.get(id))).toBe(JSON.stringify(before));

beforeAll(async () => {
  const { getOrCreateDevAccount, loadKaspaWasm } = await import("@hardkas/accounts");
  const k: any = await loadKaspaWasm();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-erf-"));
  const acc = await getOrCreateDevAccount(dir, 0, "buyer");
  const xOnly = String(new k.PrivateKey(acc.privateKey).toPublicKey().toXOnlyPublicKey().toString());
  buyer = { address: String(acc.address), xOnly, spk: `000020${xOnly}ac` };
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  delete process.env.HARDKAS_DEV_SERVER_AUTOSIGN;
  memoryStore.clear();
  cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  node = fakeEscrowNode();
  node.utxos = [utxo(1, 50n * 100_000_000n)];
  escrowNode.rpcFactory = factoryOf(node);
});
afterEach(() => {
  delete process.env.HARDKAS_DEV_SERVER_AUTOSIGN;
  cwd.mockRestore();
  escrowNode.rpcFactory = undefined;
});

describe("route (f) · the escrow routes take the server's decision on signing for a client", () => {
  it("they ask the one shared function (dapp-tx re-exports it; no copy)", () => {
    expect(reExported).toBe(serverAllowsDevAutoSign);
  });

  it("fund without HARDKAS_DEV_SERVER_AUTOSIGN: 403 DEV_AUTOSIGN_NOT_ALLOWED; the node is never contacted, nothing signed, sent or recorded", async () => {
    const r = seed();
    const before = JSON.parse(JSON.stringify(memoryStore.get(r.id)));
    const fund = await post(`/${r.id}/fund`);
    expect(fund.status, JSON.stringify(fund.body)).toBe(403);
    expect(fund.body).toMatchObject({ ok: false, code: "DEV_AUTOSIGN_NOT_ALLOWED" });
    expect(fund.body.error).toMatch(/^DEV_AUTOSIGN_NOT_ALLOWED: .*off by default.*HARDKAS_DEV_SERVER_AUTOSIGN=1.*Nothing was planned, signed or sent/);
    expect(node.calls, "no RPC call at all").toEqual([]);
    expect(node.submitted).toEqual([]);
    untouched(before, r.id);
  });

  it("sign without it: 403 DEV_AUTOSIGN_NOT_ALLOWED; no signature stored, the state unchanged", async () => {
    const r = prepared();
    const before = JSON.parse(JSON.stringify(memoryStore.get(r.id)));
    const signed = await post(`/${r.id}/sign`, { role: "buyer" });
    expect(signed.status, JSON.stringify(signed.body)).toBe(403);
    expect(signed.body).toMatchObject({ ok: false, code: "DEV_AUTOSIGN_NOT_ALLOWED" });
    expect(memoryStore.get(r.id)!.signatures).toEqual({});
    untouched(before, r.id);
  });

  it("the refusal comes before the record is read: an unknown escrow id is refused too (403, not 404)", async () => {
    for (const route of ["fund", "sign"]) {
      const res = await post(`/${crypto.randomUUID()}/${route}`, { role: "buyer" });
      expect(res.status, route).toBe(403);
      expect(res.body.code, route).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
    }
  });

  it("only the value 1 opens it: true, yes, 0, empty and ' 1' are refused", async () => {
    for (const value of ["true", "yes", "0", "", " 1"]) {
      process.env.HARDKAS_DEV_SERVER_AUTOSIGN = value;
      const r = seed();
      const fund = await post(`/${r.id}/fund`);
      expect(fund.body.code, JSON.stringify(value)).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
      const s = prepared();
      expect((await post(`/${s.id}/sign`, { role: "buyer" })).body.code, JSON.stringify(value)).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
    }
    expect(node.submitted).toEqual([]);
  });

  it("control: with HARDKAS_DEV_SERVER_AUTOSIGN=1 (local simnet), fund signs and sends once, and sign reaches the signer", async () => {
    process.env.HARDKAS_DEV_SERVER_AUTOSIGN = "1";
    const r = seed();
    const fund = await post(`/${r.id}/fund`);
    expect(fund.status, JSON.stringify(fund.body)).toBe(200);
    expect(fund.body.data.status).toBe("broadcast");
    expect(node.submitted).toHaveLength(1);
    expect(fund.body.data.txId).toBe(node.submitted[0]!.id);
    // the buyer's dev account is found by its x-only key and asked to sign; this draft does not rebuild to its id, so
    // the signer refuses it (a real signature with the opt-in: escrow-safety-2.silverc.test.ts)
    const s = prepared();
    const signed = await post(`/${s.id}/sign`, { role: "buyer" });
    expect(signed.body.ok).toBe(false);
    expect(signed.body.error).toMatch(/^ESCROW_SIGNER_FAILED/);
    expect(signed.body.code).toBeUndefined();
  });
});
