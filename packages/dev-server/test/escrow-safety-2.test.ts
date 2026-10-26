import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { escrowRoutes, escrowNode, memoryStore, type EscrowRecord } from "../src/routes/escrow.js";
import { H, SINK, factoryOf, fakeEscrowNode, type FakeEscrowNode, type FakeUtxo } from "./helpers/fake-escrow-node.js";

// -----------------------------------------------------------------------------
// ESCROW-SAFETY-2 · the dev-server escrow routes with the protections HardKAS's own sends have, against a stand-in of
// the official kaspa-wasm client (no network): one funding per escrow; an unknown submit outcome recorded with its txId
// and never followed by another funding or release before reconcile; mempool pending spends left out of the funding; the
// node must say it serves simnet; and "confirmed" read from the node's virtual chain (the node has no transaction
// lookup by id, so the getTransaction the routes used never answered). Seeded in-memory records; the buyer is a dev
// account of a temporary workspace.
// -----------------------------------------------------------------------------

const LOCK = "aa20" + H("es2 p2sh") + "87";
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
const utxo = (n: number, sompi: bigint): FakeUtxo => ({ outpoint: { transactionId: H(`es2 buyer utxo ${n}`), index: 0 }, address: buyer.address, amount: sompi, spk: buyer.spk, daa: 1000n + BigInt(n) });
const post = async (p: string) => {
  const res = await escrowRoutes.request(p, { method: "POST", headers: json, body: "{}" });
  return { status: res.status, body: (await res.json()) as any };
};

beforeAll(async () => {
  const { getOrCreateDevAccount, loadKaspaWasm } = await import("@hardkas/accounts");
  const k: any = await loadKaspaWasm();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-es2-"));
  const acc = await getOrCreateDevAccount(dir, 0, "buyer");
  const xOnly = String(new k.PrivateKey(acc.privateKey).toPublicKey().toXOnlyPublicKey().toString());
  buyer = { address: String(acc.address), xOnly, spk: `000020${xOnly}ac` };
});
beforeEach(() => {
  memoryStore.clear();
  cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  node = fakeEscrowNode();
  node.utxos = [utxo(1, 50n * 100_000_000n)];
  escrowNode.rpcFactory = factoryOf(node);
});
afterEach(() => {
  cwd.mockRestore();
  escrowNode.rpcFactory = undefined;
});

describe("ESCROW-SAFETY-2 · dev-server escrow routes", () => {
  it("ES-1 an escrow is funded once: already funded, or a funding whose outcome is unknown, refuses another (409) without asking the node", async () => {
    const funded = seed({ state: "FUNDED", funding: { status: "broadcast", transactionId: H("es2 earlier funding") } as any });
    const a = await post(`/${funded.id}/fund`);
    expect(a.status).toBe(409);
    expect(a.body.error).toMatch(/^ESCROW_ALREADY_FUNDED/);
    const unknown = seed({ funding: { status: "verification_timeout", transactionId: H("es2 unknown funding") } as any });
    const b = await post(`/${unknown.id}/fund`);
    expect(b.status).toBe(409);
    expect(b.body.error).toMatch(/^ESCROW_FUNDING_OUTCOME_UNKNOWN/);
    expect(node.calls).toEqual([]);
  });

  it("ES-2 an unknown funding outcome is recorded with its txId (escrow stays CREATED), never sent again; reconcile sees it accepted and the escrow is FUNDED", async () => {
    const r = seed();
    node.submit = "already";
    const first = await post(`/${r.id}/fund`);
    expect(first.status, JSON.stringify(first.body)).toBe(504);
    expect(first.body.error).toMatch(/^ESCROW_FUNDING_OUTCOME_UNKNOWN/);
    expect(node.submitted).toHaveLength(1);
    const txId = node.submitted[0]!.id;
    const rec = memoryStore.get(r.id)!;
    expect(rec.state).toBe("CREATED");
    expect(rec.funding).toMatchObject({ status: "verification_timeout", transactionId: txId, outputIndex: 0, observeFrom: SINK });
    const again = await post(`/${r.id}/fund`);
    expect(again.status).toBe(409);
    expect(node.submitted).toHaveLength(1);
    node.accepted.add(txId); // a chain block of the node accepted it
    const rc = await post(`/${r.id}/reconcile`);
    expect(rc.body.observations.funding.finding).toMatch(/^(chain_accepted|finality_reached)$/);
    expect(memoryStore.get(r.id)!.funding.status).toBe("confirmed");
    expect(memoryStore.get(r.id)!.state).toBe("FUNDED");
  });

  it("ES-3 an accepted funding: FUNDED/broadcast; reconcile reports it in the mempool, then confirms it once a chain block accepts it (never through getTransaction)", async () => {
    const r = seed();
    const fund = await post(`/${r.id}/fund`);
    expect(fund.status, JSON.stringify(fund.body)).toBe(200);
    expect(fund.body.data.status).toBe("broadcast");
    const txId = node.submitted[0]!.id;
    expect(fund.body.data.txId).toBe(txId);
    const inMempool = await post(`/${r.id}/reconcile`);
    expect(inMempool.body.observations.funding.finding).toBe("mempool_entry");
    expect(memoryStore.get(r.id)!.funding.status).toBe("broadcast");
    node.accepted.add(txId);
    const accepted = await post(`/${r.id}/reconcile`);
    expect(accepted.body.observations.funding.finding).toMatch(/^(chain_accepted|finality_reached)$/);
    expect(memoryStore.get(r.id)!.funding.status).toBe("confirmed");
    expect(node.calls).not.toContain("getTransaction");
  });

  it("ES-4 the funding leaves out an outpoint the node's mempool is spending; no mempool evidence, no funding (nothing sent or recorded)", async () => {
    node.utxos = [utxo(1, 50n * 100_000_000n), utxo(2, 50n * 100_000_000n)];
    node.mempoolSpends = [`${node.utxos[0]!.outpoint.transactionId}:0`];
    const r = seed();
    const fund = await post(`/${r.id}/fund`);
    expect(fund.status, JSON.stringify(fund.body)).toBe(200);
    expect(node.submitted[0]!.inputs).toEqual([`${node.utxos[1]!.outpoint.transactionId}:0`]);
    node.failMempool = true;
    const other = seed();
    const refused = await post(`/${other.id}/fund`);
    expect(refused.status).toBe(502);
    expect(refused.body.error).toMatch(/^ESCROW_FUNDING_FAILED: .*PENDING_SPEND_EVIDENCE_UNAVAILABLE/);
    expect(node.submitted).toHaveLength(1);
    expect(memoryStore.get(other.id)!.funding.status).toBe("none");
  });

  it("ES-5 a node that does not say it serves simnet is never sent the funding (nothing recorded)", async () => {
    node.network = "testnet-10";
    const r = seed();
    const fund = await post(`/${r.id}/fund`);
    expect(fund.status).toBe(502);
    expect(fund.body.error).toMatch(/NODE_NETWORK_MISMATCH|testnet-10/);
    expect(node.calls).not.toContain("submitTransaction");
    expect(memoryStore.get(r.id)!.funding.status).toBe("none");
  });

  it("ES-6 the node's own refusal is final for that transaction and records nothing; funding again is allowed", async () => {
    const r = seed();
    node.submit = "reject";
    const refused = await post(`/${r.id}/fund`);
    expect(refused.status).toBe(502);
    expect(refused.body.error).toMatch(/^ESCROW_FUNDING_FAILED: the node refused it/);
    expect(memoryStore.get(r.id)!.funding.status).toBe("none");
    node.submit = "accept";
    const ok = await post(`/${r.id}/fund`);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(memoryStore.get(r.id)!.state).toBe("FUNDED");
  });

  it("ES-7 a release already sent is reconciled, never sent again (409), without asking the node", async () => {
    const r = seed({
      state: "READY_TO_RELEASE",
      funding: { status: "confirmed", transactionId: H("es2 funding"), outputIndex: 0 } as any,
      preparedRelease: { branch: "mutualRelease", draft: {}, args: [], expectedOutputsHash: "", policyHash: "" } as any,
      release: { transactionId: H("es2 release"), fundingOutpoint: `${H("es2 funding")}:0`, expectedOutputsHash: "", actualOutputsHash: "", status: "verification_timeout" }
    });
    const res = await post(`/${r.id}/release`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/^ESCROW_RELEASE_PENDING/);
    expect(node.calls).toEqual([]);
  });
});
