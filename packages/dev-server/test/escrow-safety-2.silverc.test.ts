import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { escrowRoutes, escrowNode, memoryStore } from "../src/routes/escrow.js";
import { H, SINK, factoryOf, fakeEscrowNode, type FakeEscrowNode } from "./helpers/fake-escrow-node.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// ESCROW-SAFETY-2 · the release of a real escrow (the pinned silverc compiles the contract; buyer, seller and arbiter are
// dev accounts of a temporary workspace; the funding output is recorded, not sent): every required signature is
// verified (BIP340, SIGHASH_ALL, by the key the escrow names for the role) before anything is sent; an unknown submit
// outcome is recorded with its txId and never sent again; "confirmed" comes from the node's virtual chain. Stand-in of
// the official client, no network.
// -----------------------------------------------------------------------------

const json = { "Content-Type": "application/json" };
let dir: string;
let cwd: ReturnType<typeof vi.spyOn>;
let config: any;
let arbiterKey = "";
let node: FakeEscrowNode;

const post = async (p: string, body: unknown = {}) => {
  const res = await escrowRoutes.request(p, { method: "POST", headers: json, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};

/** A compiled escrow, its funding output recorded, the mutual release prepared and signed by the buyer and the seller. */
async function readyToRelease(): Promise<string> {
  const created = await post("/", config);
  expect(created.body.ok, JSON.stringify(created.body)).toBe(true);
  const id = created.body.data.id as string;
  const rec = memoryStore.get(id)!;
  rec.funding = {
    status: "confirmed",
    transactionId: H(`es2s funding ${id}`),
    outputIndex: 0,
    amountSompi: "200000000",
    utxoEntry: { amount: "200000000", scriptPublicKey: { version: 0, scriptPublicKey: rec.p2shState.lockingScriptHex }, blockDaaScore: "0", isCoinbase: false }
  };
  rec.state = "FUNDED";
  expect((await post(`/${id}/release/prepare`, { branch: "mutualRelease" })).body.ok).toBe(true);
  for (const role of ["buyer", "seller"]) {
    const signed = await post(`/${id}/sign`, { role });
    expect(signed.body.ok, JSON.stringify(signed.body)).toBe(true);
  }
  expect(memoryStore.get(id)!.state).toBe("READY_TO_RELEASE");
  return id;
}

beforeAll(async () => {
  const { getOrCreateDevAccount, loadKaspaWasm } = await import("@hardkas/accounts");
  const k: any = await loadKaspaWasm();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-es2s-"));
  const [buyer, seller, arbiter] = await Promise.all([getOrCreateDevAccount(dir, 0, "buyer"), getOrCreateDevAccount(dir, 1, "seller"), getOrCreateDevAccount(dir, 2, "arbiter")]);
  const xOnly = (a: { privateKey: string }) => String(new k.PrivateKey(a.privateKey).toPublicKey().toXOnlyPublicKey().toString());
  arbiterKey = arbiter.privateKey;
  config = {
    buyer: { publicKeyHex: xOnly(buyer) },
    seller: { publicKeyHex: xOnly(seller) },
    arbiter: { publicKeyHex: xOnly(arbiter) },
    buyerDestinationSpk: `20${xOnly(buyer)}ac`,
    sellerDestinationSpk: `20${xOnly(seller)}ac`,
    principal: "198000000",
    feeBudgetSompi: "2000000",
    refundAmount: "100000000",
    releaseAmount: "100000000"
  };
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  memoryStore.clear();
  cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  node = fakeEscrowNode();
  escrowNode.rpcFactory = factoryOf(node);
});
afterEach(() => {
  cwd.mockRestore();
  escrowNode.rpcFactory = undefined;
});

describe("ESCROW-SAFETY-2 · the release of a compiled escrow", () => {
  it("ES-S1 a signature with one byte changed, or a valid signature by another key in a signer's slot: ESCROW_SIGNATURE_INVALID, nothing sent", async () => {
    const id = await readyToRelease();
    const rec = memoryStore.get(id)!;
    const seller = rec.signatures.seller!;
    rec.signatures.seller = seller.slice(0, 10) + (seller[10] === "0" ? "1" : "0") + seller.slice(11);
    const flipped = await post(`/${id}/release`);
    expect(flipped.status, JSON.stringify(flipped.body)).toBe(400);
    expect(flipped.body.error).toMatch(/^ESCROW_SIGNATURE_INVALID: the seller's signature/);
    const { signSilverSpend } = await import("@hardkas/accounts");
    rec.signatures.seller = signSilverSpend(rec.preparedRelease!.draft, arbiterKey);
    const otherKey = await post(`/${id}/release`);
    expect(otherKey.status).toBe(400);
    expect(otherKey.body.error).toMatch(/^ESCROW_SIGNATURE_INVALID: the seller's signature/);
    expect(node.submitted).toEqual([]);
    expect(memoryStore.get(id)!.release).toBeUndefined();
  });

  it("ES-S2 valid signatures: sent once under its txId; a chain block of the node accepts it, so the escrow is RELEASED (confirmed)", async () => {
    const id = await readyToRelease();
    node.acceptOnSubmit = true;
    const res = await post(`/${id}/release`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe("confirmed");
    expect(node.submitted.map((s) => s.id)).toEqual([res.body.data.spendTxId]);
    const rec = memoryStore.get(id)!;
    expect(rec.state).toBe("RELEASED");
    expect(rec.release).toMatchObject({ transactionId: res.body.data.spendTxId, status: "confirmed", observeFrom: SINK });
  });

  it("ES-S3 an unknown outcome: recorded with its txId, not sent again (409); reconcile sees it accepted and the escrow is RELEASED", async () => {
    const id = await readyToRelease();
    node.submit = "already";
    const first = await post(`/${id}/release`);
    expect(first.status, JSON.stringify(first.body)).toBe(504);
    expect(first.body.error).toMatch(/^ESCROW_RELEASE_OUTCOME_UNKNOWN/);
    const txId = node.submitted[0]!.id;
    expect(memoryStore.get(id)!.release).toMatchObject({ transactionId: txId, status: "verification_timeout", observeFrom: SINK });
    expect(memoryStore.get(id)!.state).toBe("READY_TO_RELEASE");
    const again = await post(`/${id}/release`);
    expect(again.status).toBe(409);
    expect(node.submitted).toHaveLength(1);
    node.accepted.add(txId);
    const rc = await post(`/${id}/reconcile`);
    expect(rc.body.observations.release.finding).toMatch(/^(chain_accepted|finality_reached)$/);
    expect(memoryStore.get(id)!.state).toBe("RELEASED");
    expect(memoryStore.get(id)!.release!.status).toBe("confirmed");
  });
});
