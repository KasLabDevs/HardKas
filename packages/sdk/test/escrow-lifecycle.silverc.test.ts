import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { Hardkas, checkEscrowRelease, type EscrowRecord, type EscrowReleaseRequest } from "../src/index.js";
// the dev server's stand-in of the official kaspa-wasm client (no network), as its escrow tests use it
import { SINK, factoryOf, fakeEscrowNode, type FakeEscrowNode } from "../../dev-server/test/helpers/fake-escrow-node.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// ESCROW-LIFECYCLE-1 · sdk.escrow offline, with real escrows (the pinned silverc compiles EscrowFull and EscrowSplit):
// the creator's workspace holds the record, a signer's own workspace holds only the release request it is handed. The
// signer's check recompiles the contract from the request's terms and prepares the draft again: an edited amount, term,
// branch, signer list or network is refused before anything is signed, and only the role's own key signs. The
// signatures come back to the record verified (BIP340), so the release is ready and checks out. The funding output is
// recorded, not sent; the node a send would use is a counting loopback server that must see no connection.
// -----------------------------------------------------------------------------

const H = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const made: string[] = [];
let decoy: { port: number; connections: number; close(): Promise<void> };
let creatorWs = "";
let signerWs = "";
let creator: Hardkas;
let signer: Hardkas;
const party: Record<string, { publicKeyHex: string; destinationSpk: string }> = {};

async function outcome<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; code?: string; message: string }> {
  try {
    return { ok: true, value: await p };
  } catch (e: any) {
    return { ok: false, code: e?.code, message: String(e?.message ?? e) };
  }
}

async function workspace(label: string): Promise<string> {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-escrow-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: `ws://127.0.0.1:${decoy.port}` } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg)};\n`);
  const { ensureDevAccounts } = await import("@hardkas/accounts");
  await ensureDevAccounts(ws);
  return ws;
}

/** The funding output recorded as `fund` records it after a broadcast (nothing is sent here). */
function recordFunding(id: string, amountSompi: bigint): void {
  const file = path.join(creatorWs, ".hardkas", "escrows", `${id}.json`);
  const rec = JSON.parse(fs.readFileSync(file, "utf8")) as EscrowRecord;
  rec.funding = {
    status: "confirmed",
    transactionId: H(`silverc funding ${id}`),
    outputIndex: 0,
    amountSompi: amountSompi.toString(),
    utxoEntry: { amount: amountSompi.toString(), scriptPublicKey: { version: 0, scriptPublicKey: rec.p2shState.lockingScriptHex }, blockDaaScore: "0", isCoinbase: false }
  };
  rec.state = "FUNDED";
  fs.writeFileSync(file, JSON.stringify(rec));
}

const terms = (extra: Record<string, unknown>) => ({
  buyer: { publicKeyHex: party.buyer!.publicKeyHex },
  seller: { publicKeyHex: party.seller!.publicKeyHex },
  arbiter: { publicKeyHex: party.arbiter!.publicKeyHex },
  buyerDestinationSpk: party.buyer!.destinationSpk,
  sellerDestinationSpk: party.seller!.destinationSpk,
  version: "v2" as const,
  ...extra
});

beforeAll(async () => {
  const server = net.createServer((s) => {
    decoy.connections++;
    s.destroy();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  decoy = { port: (server.address() as net.AddressInfo).port, connections: 0, close: () => new Promise<void>((r) => server.close(() => r())) };
  creatorWs = await workspace("creator");
  signerWs = await workspace("signer");
  creator = await Hardkas.open({ cwd: creatorWs, network: "simnet" });
  signer = await Hardkas.open({ cwd: signerWs, network: "simnet" });
  // the buyer is the creator's alice; the seller and the arbiter are the signer workspace's bob and carol
  party.buyer = await creator.escrow.partyOf("alice");
  party.seller = await signer.escrow.partyOf("bob");
  party.arbiter = await signer.escrow.partyOf("carol");
});
afterAll(async () => {
  await creator?.close();
  await signer?.close();
  await decoy?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("ESCROW-LIFECYCLE-1 · sdk.escrow, two workspaces", () => {
  it("S-1 EscrowFull mutualRelease: prepared by the creator, signed by the buyer there and by the seller in their own workspace; the signatures verified back into the record; ready to release", async () => {
    const record = await creator.escrow.create(terms({ mode: "full", principal: "100000000" }));
    expect(record).toMatchObject({ schema: "hardkas.escrow.record.v1", networkId: "simnet", state: "CREATED" });
    expect(record.provenance.contractName).toBe("EscrowFull");
    // the same terms (same nonce) are the same address: a second active escrow there is refused
    const again = await outcome(creator.escrow.create(record.config));
    expect(again.ok ? undefined : again.code).toBe("ESCROW_ADDRESS_ALREADY_ACTIVE");
    recordFunding(record.id, 102_000_000n);
    const request = await creator.escrow.prepare(record.id, { branch: "mutualRelease" });
    expect(request).toMatchObject({ schema: "hardkas.escrow.releaseRequest.v1", escrowId: record.id, requiredSigners: ["buyer", "seller"], feeSompi: "2000000" });
    expect(request.outputs.map((o) => o.amountSompi)).toEqual(["50000000", "50000000"]);

    const buyerSigned = await creator.escrow.sign(record.id, { role: "buyer", account: "alice" });
    expect(buyerSigned.record.state).toBe("PARTIALLY_SIGNED");
    // the seller's workspace has no record of this escrow: it checks the request against the escrow's own terms
    const checked = await signer.escrow.verifyRequest(request);
    expect(checked.requiredSigners).toEqual(["buyer", "seller"]);
    const wrongKey = await outcome(signer.escrow.signRequest(request, { role: "seller", account: "carol" }));
    expect(wrongKey.ok ? undefined : wrongKey.code).toBe("ESCROW_SIGNER_NOT_FOUND");
    const notRequired = await outcome(signer.escrow.signRequest(request, { role: "arbiter", account: "carol" }));
    expect(notRequired.ok ? undefined : notRequired.code).toBe("ESCROW_ROLE_NOT_REQUIRED");
    const sellerSigned = await signer.escrow.signRequest(request, { role: "seller", account: "bob" });
    expect(Object.keys(sellerSigned.request.signatures)).toEqual(["seller"]);

    // a signature with one byte changed is refused, nothing added
    const flipped: EscrowReleaseRequest = { ...sellerSigned.request, signatures: { seller: sellerSigned.signature.replace(/^(.{10})(.)/, (_m, a, b) => a + (b === "0" ? "1" : "0")) } };
    const bad = await outcome(creator.escrow.addSignatures(record.id, flipped));
    expect(bad.ok ? undefined : bad.code).toBe("ESCROW_SIGNATURE_INVALID");
    expect(Object.keys((await creator.escrow.status(record.id)).signatures)).toEqual(["buyer"]);

    const ready = await creator.escrow.addSignatures(record.id, sellerSigned.request);
    expect(ready.state).toBe("READY_TO_RELEASE");
    const check = checkEscrowRelease(ready, record.id);
    expect(check.ok, JSON.stringify(check)).toBe(true);
    // the release request now carries both signatures
    expect(Object.keys((await creator.escrow.releaseRequest(record.id)).signatures).sort()).toEqual(["buyer", "seller"]);
    expect(decoy.connections).toBe(0);
  });

  it("S-2 a request that does not do what the escrow's terms say is refused before anything is signed: an output, a term, the branch, the signer list, the allocation, the network", async () => {
    const record = await creator.escrow.create(terms({ mode: "full", principal: "100000000" }));
    recordFunding(record.id, 102_000_000n);
    const request = await creator.escrow.prepare(record.id, { branch: "releaseToSeller" });
    const clone = (): any => JSON.parse(JSON.stringify(request));
    const cases: Array<[string, any, string]> = [];
    {
      const r = clone();
      r.draft.outputs[0].valueSompi = "100500000";
      cases.push(["an output amount", r, "ESCROW_REQUEST_MISMATCH"]);
    }
    {
      const r = clone();
      r.draft.outputs[0].scriptPublicKey.script = party.buyer!.destinationSpk;
      cases.push(["an output destination", r, "ESCROW_REQUEST_MISMATCH"]);
    }
    {
      const r = clone();
      r.escrow.config.principal = "90000000";
      cases.push(["the principal", r, "ESCROW_REQUEST_MISMATCH"]);
    }
    {
      const r = clone();
      r.branch = "refundBuyer";
      cases.push(["the branch", r, "ESCROW_REQUEST_MISMATCH"]);
    }
    {
      const r = clone();
      r.requiredSigners = ["seller"];
      cases.push(["the signer list", r, "ESCROW_REQUEST_MISMATCH"]);
    }
    {
      const r = clone();
      r.branch = "mutualRelease";
      r.mutualSplit = { buyerSompi: "0", sellerSompi: "100000000" };
      cases.push(["an allocation the draft does not pay", r, "ESCROW_REQUEST_MISMATCH"]);
    }
    {
      const r = clone();
      r.networkId = "devnet";
      cases.push(["the network", r, "ESCROW_NETWORK_MISMATCH"]);
    }
    {
      const r = clone();
      r.schema = "hardkas.escrow.rescue.v1";
      cases.push(["the schema", r, "ESCROW_REQUEST_INVALID"]);
    }
    for (const [what, r, code] of cases) {
      const res = await outcome(signer.escrow.signRequest(r, { role: "seller", account: "bob" }));
      expect({ what, code: res.ok ? "SIGNED" : res.code }, res.ok ? "" : res.message).toEqual({ what, code });
    }
    // the untouched request is signed
    expect((await signer.escrow.signRequest(request, { role: "seller", account: "bob" })).role).toBe("seller");
    // prepared again: an earlier request is not of the prepared release any more
    const fresh = await creator.escrow.prepare(record.id, { branch: "refundBuyer" });
    const stale = await signer.escrow.signRequest(request, { role: "arbiter", account: "carol" });
    const merged = await outcome(creator.escrow.addSignatures(record.id, stale.request));
    expect(merged.ok ? undefined : merged.code).toBe("ESCROW_REQUEST_MISMATCH");
    expect(fresh.requiredSigners).toEqual(["buyer", "arbiter"]);
    expect(decoy.connections).toBe(0);
  });

  it("S-3 EscrowSplit executeSplit (buyer + arbiter), a custom mutualRelease allocation, and the G3 refusal of a fee budget under the node's minimum before any key or node", async () => {
    const record = await creator.escrow.create(terms({ mode: "split", buyerAmount: "60000000", sellerAmount: "40000000" }));
    expect(record.provenance.contractName).toBe("EscrowSplit");
    recordFunding(record.id, 102_000_000n);
    const request = await creator.escrow.prepare(record.id, { branch: "executeSplit" });
    expect(request.outputs.map((o) => o.amountSompi)).toEqual(["60000000", "40000000"]);
    await creator.escrow.sign(record.id, { role: "buyer", account: "alice" });
    const arbiter = await signer.escrow.signRequest(request, { role: "arbiter", account: "carol" });
    const ready = await creator.escrow.addSignatures(record.id, arbiter.request);
    expect(ready.state).toBe("READY_TO_RELEASE");
    expect(checkEscrowRelease(ready, record.id).ok).toBe(true);

    const mutual = await creator.escrow.prepare(record.id, { branch: "mutualRelease", mutualSplit: { buyerSompi: 30_000_000n, sellerSompi: 70_000_000n } });
    expect(mutual.mutualSplit).toEqual({ buyerSompi: "30000000", sellerSompi: "70000000" });
    expect(mutual.outputs.map((o) => o.amountSompi)).toEqual(["30000000", "70000000"]);
    expect((await signer.escrow.verifyRequest(mutual)).requiredSigners).toEqual(["buyer", "seller"]);

    const cheap = await creator.escrow.create(terms({ mode: "full", principal: "100000000", feeBudgetSompi: "100000" }));
    const notBuyer = await outcome(creator.escrow.fund(cheap.id, { account: "bob" }));
    expect(notBuyer.ok ? undefined : notBuyer.code).toBe("ESCROW_BUYER_ACCOUNT_NOT_FOUND");
    const g3 = await outcome(creator.escrow.fund(cheap.id, { account: "alice" }));
    expect(g3.ok ? undefined : g3.code).toBe("ESCROW_FEE_BUDGET_BELOW_MINIMUM");
    expect((await creator.escrow.status(cheap.id)).funding.status).toBe("none");
    expect(decoy.connections).toBe(0);
  });

  /** A ready-to-release EscrowFull (buyer and seller signed), its funding listed at `node`. */
  async function readyEscrow(node: FakeEscrowNode): Promise<EscrowRecord> {
    const record = await creator.escrow.create(terms({ mode: "full", principal: "100000000" }));
    recordFunding(record.id, 102_000_000n);
    const request = await creator.escrow.prepare(record.id, { branch: "mutualRelease" });
    await creator.escrow.sign(record.id, { role: "buyer", account: "alice" });
    await creator.escrow.addSignatures(record.id, (await signer.escrow.signRequest(request, { role: "seller", account: "bob" })).request);
    const rec = await creator.escrow.status(record.id);
    node.utxos.push({ outpoint: { transactionId: rec.funding.transactionId!, index: 0 }, address: rec.p2shState.address, amount: 102_000_000n, spk: `0000${rec.p2shState.lockingScriptHex}`, daa: 1000n });
    return rec;
  }

  /** The stand-in client, answering the sink's header too (the send's submit point, where the observer looks from). */
  function client(node: FakeEscrowNode): JsonWrpcKaspaClient {
    const base = factoryOf(node);
    const factory = (url: string) => {
      const c: any = base(url);
      return new Proxy(c, {
        get(t, p) {
          if (p === "getBlock") {
            return async (r: any) => (r?.hash === SINK ? { block: { header: { hash: SINK, blueScore: 5_000_000n, daaScore: 4_999_000n } } } : t.getBlock(r));
          }
          return t[p];
        }
      });
    };
    return new JsonWrpcKaspaClient({ rpcUrl: `ws://127.0.0.1:${decoy.port}`, expectedNetworkId: "simnet", requireSynced: true, rpcFactory: factory as any });
  }

  it("S-4 the release through sdk.tx.send (stand-in node): funding not listed → refused, nothing sent; an unknown outcome is recorded and never sent again, reconcile sees it accepted (RELEASED); the node's refusal is final, nothing re-sent", async () => {
    const node = fakeEscrowNode();
    const previous = creator.rpc;
    (creator as any).rpc = client(node);
    try {
      const a = await readyEscrow(node);
      // 1 · its funding not in the node's UTXO set: refused before anything is built or sent
      const saved = node.utxos.splice(0);
      const early = await outcome(creator.escrow.release(a.id));
      expect(early.ok ? undefined : early.code, early.ok ? "" : early.message).toBe("ESCROW_FUNDING_NOT_UNSPENT");
      expect(node.submitted).toEqual([]);
      expect((await creator.escrow.status(a.id)).release).toBeUndefined();
      node.utxos.push(...saved);
      // 2 · an answer that leaves the outcome unknown: recorded with its txId, never sent again
      node.submit = "already";
      const unknown = await outcome(creator.escrow.release(a.id));
      expect(unknown.ok ? undefined : unknown.code, unknown.ok ? "" : unknown.message).toBe("ESCROW_RELEASE_OUTCOME_UNKNOWN");
      expect(node.submitted).toHaveLength(1);
      const txId = node.submitted[0]!.id;
      expect((await creator.escrow.status(a.id)).release).toMatchObject({ transactionId: txId, status: "verification_timeout" });
      const pending = await outcome(creator.escrow.release(a.id));
      expect(pending.ok ? undefined : pending.code).toBe("ESCROW_RELEASE_PENDING");
      expect(node.submitted).toHaveLength(1);
      // the workspace holds the send's records: the plan, the signed transaction, the submission
      const stored = fs.readdirSync(path.join(creatorWs, ".hardkas", "artifacts"), { recursive: true }).map(String);
      expect(stored.some((f) => /txSubmission-/.test(f)), stored.join("\n")).toBe(true);
      node.accepted.add(txId);
      const rc = await creator.escrow.reconcile(a.id);
      expect(rc.observations.release?.finding, JSON.stringify(rc.observations)).toBe("chain_accepted");
      expect({ state: rc.record.state, release: rc.record.release?.status }).toEqual({ state: "RELEASED", release: "confirmed" });
      expect(node.submitted).toHaveLength(1);

      // 3 · the node's own refusal: nothing recorded on the escrow, and the same transaction is never sent again
      const b = await readyEscrow(node);
      node.submit = "reject";
      const refused = await outcome(creator.escrow.release(b.id));
      expect(refused.ok ? undefined : refused.code, refused.ok ? "" : refused.message).toBe("ESCROW_RELEASE_FAILED");
      expect(node.submitted).toHaveLength(2);
      expect((await creator.escrow.status(b.id)).release).toBeUndefined();
      const again = await outcome(creator.escrow.release(b.id));
      expect(again.ok ? undefined : again.code, again.ok ? "" : again.message).toBe("ESCROW_RELEASE_FAILED");
      expect(node.submitted, "never submitted a second time").toHaveLength(2);
      expect(decoy.connections).toBe(0);
    } finally {
      await (creator.rpc as any).close?.().catch?.(() => {});
      (creator as any).rpc = previous;
    }
  });

  it("S-5 a release whose compute mass outweighs its storage mass (10 KAS to one output) passes sdk.tx.send's economic check and is sent once", async () => {
    // With small outputs the storage mass (KIP-9) is the transaction's mass whatever its unlock is, so the plan's mass and
    // the SDK's recomputation of it agree. With one large output the compute mass is the mass: the contract's unlock made
    // the draft's real figure larger than the SDK's P2PK-shaped recomputation, and the send refused the plan
    // (ECONOMIC_VIOLATION "Mass mismatch"), so such a release could never be sent.
    const node = fakeEscrowNode();
    node.acceptOnSubmit = true;
    const previous = creator.rpc;
    (creator as any).rpc = client(node);
    try {
      const record = await creator.escrow.create(terms({ mode: "full", principal: "1000000000" }));
      recordFunding(record.id, 1_002_000_000n);
      const request = await creator.escrow.prepare(record.id, { branch: "releaseToSeller" });
      expect(request.outputs.map((o) => o.amountSompi)).toEqual(["1000000000"]);
      const signers: Record<string, () => Promise<unknown>> = {
        buyer: () => creator.escrow.sign(record.id, { role: "buyer", account: "alice" }),
        seller: async () => creator.escrow.addSignatures(record.id, (await signer.escrow.signRequest(request, { role: "seller", account: "bob" })).request),
        arbiter: async () => creator.escrow.addSignatures(record.id, (await signer.escrow.signRequest(request, { role: "arbiter", account: "carol" })).request)
      };
      for (const role of request.requiredSigners) await signers[role]!();
      const rec = await creator.escrow.status(record.id);
      expect(rec.state).toBe("READY_TO_RELEASE");
      node.utxos.push({ outpoint: { transactionId: rec.funding.transactionId!, index: 0 }, address: rec.p2shState.address, amount: 1_002_000_000n, spk: `0000${rec.p2shState.lockingScriptHex}`, daa: 1000n });
      const sent = await outcome(creator.escrow.release(record.id));
      expect(sent.ok ? "SENT" : sent.code, sent.ok ? "" : sent.message).toBe("SENT");
      expect(node.submitted).toHaveLength(1);
      expect(decoy.connections).toBe(0);
    } finally {
      await (creator.rpc as any).close?.().catch?.(() => {});
      (creator as any).rpc = previous;
    }
  });
});
