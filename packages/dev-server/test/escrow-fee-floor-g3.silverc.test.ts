import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { escrowRoutes, escrowNode, memoryStore } from "../src/routes/escrow.js";
import { H, factoryOf, fakeEscrowNode, type FakeEscrowNode } from "./helpers/fake-escrow-node.js";

// N-11 · the escrow journal fixes its path when ../src/routes/escrow.js is imported: point it at a temporary file before
// that import (vi.hoisted runs first), so this test never writes <repo>/.hardkas/escrow-store.json.
await vi.hoisted(async () => {
  const osMod = await import("node:os");
  const pathMod = await import("node:path");
  const fsMod = await import("node:fs");
  process.env.HARDKAS_ESCROW_STORE_PATH = pathMod.join(fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), "hk-g3-store-")), "escrow-store.json");
});

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// G3 (NOTES-CROSSCHECK) · the dev-server escrow's fee against the node's minimum relay fee (100 sompi/g of the release's
// compute mass; storage mass has no fee floor, its limit is 500,000 g). Before: a funded EscrowFull below ≈ 1.5 KAS could
// not be released through its default 50/50 mutualRelease (ESCROW_PREPARE_FAILED: FEE_BELOW_NETWORK_MINIMUM, the SDK's
// storage-inclusive minimum above the 2,000,000-sompi budget), and a fee budget under the node's minimum was funded and
// then stuck. A real escrow (the pinned silverc compiles it); buyer, seller and arbiter are dev accounts of a temporary
// workspace; the node is the official-client stand-in (no network).
// -----------------------------------------------------------------------------

const json = { "Content-Type": "application/json" };
let dir: string;
let cwd: ReturnType<typeof vi.spyOn>;
let base: any;
let buyer: { address: string; spk: string };
let node: FakeEscrowNode;

const post = async (p: string, body: unknown = {}) => {
  const res = await escrowRoutes.request(p, { method: "POST", headers: json, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};

async function create(overrides: Record<string, unknown>): Promise<string> {
  const created = await post("/", { ...base, ...overrides });
  expect(created.body.ok, JSON.stringify(created.body)).toBe(true);
  return created.body.data.id as string;
}

/** The funding output recorded as the route records it after a broadcast (not sent). */
function recordFunding(id: string, amountSompi: bigint) {
  const rec = memoryStore.get(id)!;
  rec.funding = {
    status: "confirmed",
    transactionId: H(`g3 funding ${id}`),
    outputIndex: 0,
    amountSompi: amountSompi.toString(),
    utxoEntry: { amount: amountSompi.toString(), scriptPublicKey: { version: 0, scriptPublicKey: rec.p2shState.lockingScriptHex }, blockDaaScore: "0", isCoinbase: false }
  };
  rec.state = "FUNDED";
}

beforeAll(async () => {
  process.env.HARDKAS_DEV_SERVER_AUTOSIGN = "1";
  const { getOrCreateDevAccount, loadKaspaWasm } = await import("@hardkas/accounts");
  const k: any = await loadKaspaWasm();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-g3-"));
  const [b, s, a] = await Promise.all([getOrCreateDevAccount(dir, 0, "buyer"), getOrCreateDevAccount(dir, 1, "seller"), getOrCreateDevAccount(dir, 2, "arbiter")]);
  const xOnly = (acc: { privateKey: string }) => String(new k.PrivateKey(acc.privateKey).toPublicKey().toXOnlyPublicKey().toString());
  buyer = { address: String(b.address), spk: `000020${xOnly(b)}ac` };
  base = {
    buyer: { publicKeyHex: xOnly(b) },
    seller: { publicKeyHex: xOnly(s) },
    arbiter: { publicKeyHex: xOnly(a) },
    buyerDestinationSpk: `20${xOnly(b)}ac`,
    sellerDestinationSpk: `20${xOnly(s)}ac`
  };
});
afterAll(() => {
  delete process.env.HARDKAS_DEV_SERVER_AUTOSIGN;
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  memoryStore.clear();
  cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  node = fakeEscrowNode();
  node.utxos = [{ outpoint: { transactionId: H("g3 buyer utxo"), index: 0 }, address: buyer.address, amount: 50n * 100_000_000n, spk: buyer.spk, daa: 1000n }];
  escrowNode.rpcFactory = factoryOf(node);
});
afterEach(() => {
  cwd.mockRestore();
  escrowNode.rpcFactory = undefined;
});

describe("G3 · the escrow's fee is checked against the node's minimum relay fee", () => {
  it("G3-1 a 0.1 KAS EscrowFull with the default budget: the 50/50 mutualRelease (storage mass ≈ 316,000 g) is prepared, signed and sent at the 2,000,000-sompi budget", async () => {
    const id = await create({ principal: "10000000" });
    recordFunding(id, 12_000_000n);
    const prepared = await post(`/${id}/release/prepare`, { branch: "mutualRelease" });
    expect(prepared.status, JSON.stringify(prepared.body)).toBe(200);
    expect(prepared.body.data.draft.feeSompi).toBe("2000000");
    expect(BigInt(prepared.body.data.draft.storageMass)).toBeGreaterThan(100_000n);
    for (const role of ["buyer", "seller"]) expect((await post(`/${id}/sign`, { role })).body.ok).toBe(true);
    node.acceptOnSubmit = true;
    const sent = await post(`/${id}/release`);
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(node.submitted.map((s) => s.id)).toEqual([sent.body.data.spendTxId]);
  });

  it("G3-2 a fee budget under the node's minimum: the escrow is not funded (ESCROW_FEE_BUDGET_BELOW_MINIMUM with the node's figure), nothing asked of the node", async () => {
    const id = await create({ principal: "100000000", feeBudgetSompi: "100000" });
    const fund = await post(`/${id}/fund`);
    expect(fund.status, JSON.stringify(fund.body)).toBe(400);
    expect(fund.body.code).toBe("ESCROW_FEE_BUDGET_BELOW_MINIMUM");
    expect(fund.body.error).toMatch(/fee budget \(100000 sompi.*below the node's minimum relay fee for its \w+ release \((\d+) sompi\)/);
    const minimum = BigInt(/release \((\d+) sompi\)/.exec(fund.body.error)![1]!);
    expect(minimum).toBeGreaterThan(100_000n);
    expect(minimum).toBeLessThan(2_000_000n);
    expect(node.calls).toEqual([]);
    expect(memoryStore.get(id)!.funding.status).toBe("none");
    expect(memoryStore.get(id)!.state).toBe("CREATED");
  });

  it("G3-3 the default budget funds a 0.1 KAS escrow; a 0.05 KAS one is funded with a warning that its default 50/50 mutualRelease is above the node's storage-mass limit", async () => {
    const ok = await post(`/${await create({ principal: "10000000" })}/fund`);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.warnings).toBeUndefined();
    memoryStore.clear();
    const small = await post(`/${await create({ principal: "5000000" })}/fund`);
    expect(small.status, JSON.stringify(small.body)).toBe(200);
    expect(small.body.data.warnings).toEqual([expect.stringMatching(/^mutualRelease with its default outputs cannot be released: TX_MASS_ABOVE_STANDARD_LIMIT: storage mass \d+ g is above the node's limit of 500000 g/)]);
  });

  it("G3-4 a recorded funding whose fee is under the node's minimum: ESCROW_FEE_BELOW_MINIMUM names the node's minimum for that release (not the old 10,000 sompi)", async () => {
    const id = await create({ principal: "100000000", feeBudgetSompi: "100000" });
    recordFunding(id, 100_100_000n);
    const prepared = await post(`/${id}/release/prepare`, { branch: "refundBuyer" });
    expect(prepared.status, JSON.stringify(prepared.body)).toBe(400);
    expect(prepared.body.code).toBe("ESCROW_FEE_BELOW_MINIMUM");
    expect(prepared.body.error).toMatch(/effective release fee \(100000 sompi\) is below the node's minimum relay fee for this release \(\d+ sompi/);
    expect(prepared.body.error).not.toMatch(/relay fee \(10000 sompi\)/);
    expect(memoryStore.get(id)!.preparedRelease).toBeUndefined();
  });
});
