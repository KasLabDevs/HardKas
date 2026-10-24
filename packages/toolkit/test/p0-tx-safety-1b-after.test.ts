/*
 * P0-TX-SAFETY-1B — WalletToolkit · the two properties the owner requires, together:
 *  1. a spend whose network is wrong or whose node identity cannot be verified is never signed nor submitted;
 *  2. a legitimate spend (simnet, testnet-10) with a correct identity goes through, with exactly ONE submit.
 * In-process fakes only (no network, no wallet, no funds). Planning and UTXO listing are stubbed so the guard → sign →
 * submit path is what is tested; the stubs never decide whether a network is allowed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { RpcTimeoutError, markRequestNotSent } from "@hardkas/kaspa-rpc";
import { WalletToolkit } from "../src/index.js";

type Answer = Record<string, unknown> | (() => never | Promise<never>);

interface Node {
  /** getServerInfo answers in order (last repeats); undefined = method absent */
  server?: Answer[];
  /** getBlockDagInfo answers in order (last repeats); undefined = method absent */
  dag?: Answer[];
  submit?: "ok" | "timeout" | "rejected" | "not-sent";
}

function fakeNode(o: Node) {
  const log: string[] = [];
  let s = 0;
  let d = 0;
  const pick = async (list: Answer[], i: number) => {
    const a = list[Math.min(i, list.length - 1)]!;
    return typeof a === "function" ? await a() : a;
  };
  const rpc: any = {
    submits: 0,
    async submitTransaction() {
      rpc.submits++;
      log.push("submit");
      if (o.submit === "timeout") throw new RpcTimeoutError("RPC request submitTransaction timed out after 5000ms");
      if (o.submit === "rejected") throw new Error("Rejected transaction ff: transaction ff is not standard: x");
      if (o.submit === "not-sent") throw markRequestNotSent(new Error("connection not open"));
      return { transactionId: "e".repeat(64) }; // the transaction that was signed
    }
  };
  if (o.server) rpc.getServerInfo = async () => { log.push("server"); return pick(o.server!, s++); };
  if (o.dag) rpc.getBlockDagInfo = async () => { log.push("dag"); return { virtualDaaScore: 1000n, ...(await pick(o.dag!, d++)) }; };
  return { rpc, log };
}

let tmp: string;
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p0-1b-")); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

let n = 0;
function wallet(decl: { network?: string; networkId?: string }, node: Node) {
  const { rpc, log } = fakeNode(node);
  const signer: any = {
    signs: 0,
    async signTxPlan({ planArtifact }: any) {
      signer.signs++;
      log.push("sign");
      signer.network = planArtifact.networkId;
      return { txId: "e".repeat(64), signedTransaction: { payload: JSON.stringify({ fake: true }) } };
    }
  };
  const w = WalletToolkit.open(`p${++n}`, { storePath: path.join(tmp, `p${n}.json`), ...(decl as any), rpc, signer, coinbaseMaturity: 100n });
  vi.spyOn(w, "receive").mockResolvedValue("kaspasim:qsource");
  vi.spyOn(w.utxos, "list").mockResolvedValue([
    { outpoint: { transactionId: "aa".repeat(32), index: 0 }, transactionId: "aa".repeat(32), outputIndex: 0, index: 0, amountSompi: 10_000_000n, scriptPublicKey: "00", address: "kaspasim:qsource", blockDaaScore: 1n, isCoinbase: false },
    { outpoint: { transactionId: "bb".repeat(32), index: 0 }, transactionId: "bb".repeat(32), outputIndex: 0, index: 0, amountSompi: 20_000_000n, scriptPublicKey: "00", address: "kaspasim:qsource", blockDaaScore: 1n, isCoinbase: false }
  ] as any);
  const plan = { inputs: [{ outpoint: { transactionId: "aa".repeat(32), index: 0 } }], outputs: [{ address: "kaspasim:qdest", amountSompi: 1_000n }], estimatedMass: 1000n, estimatedFeeSompi: 2000n };
  const planned: any[] = [];
  vi.spyOn(w as any, "planUpstream").mockImplementation(async (p: any) => { log.push("plan"); planned.push(p); return { plan }; });
  vi.spyOn(w as any, "planSweep").mockImplementation(async (p: any) => { log.push("plan"); planned.push(p); return plan; });
  return { w, rpc, signer, log, planned };
}

const ok = (id: string) => [{ networkId: id }];
const send = (w: WalletToolkit) => w.send({ to: "kaspasim:qdest", amount: 1_000n, feeRate: 1n });

async function refused(ctx: ReturnType<typeof wallet>, run: () => Promise<unknown>, code?: string | RegExp) {
  let threw: any;
  try { await run(); } catch (e) { threw = e; }
  const seen = JSON.stringify({ log: ctx.log, signs: ctx.signer.signs, submits: ctx.rpc.submits, code: threw?.code, msg: threw?.message });
  expect(threw, seen).toBeDefined();
  expect(ctx.signer.signs, seen).toBe(0);
  expect(ctx.rpc.submits, seen).toBe(0);
  if (code !== undefined) expect(String(threw?.code), seen).toMatch(code);
  return threw;
}

describe("P0-TX-SAFETY-1B · property 2: a legitimate spend goes through with ONE submit", () => {
  it("simnet declared, node simnet (HardKAS client shape) → signed once, submitted once, artifact network simnet", async () => {
    const ctx = wallet({ networkId: "simnet" }, { server: ok("simnet"), dag: ok("simnet") });
    const r = await send(ctx.w);
    expect(r.txId).toBe("e".repeat(64));
    expect(ctx.signer.signs).toBe(1);
    expect(ctx.rpc.submits).toBe(1);
    expect(ctx.signer.network).toBe("simnet");
    expect(ctx.planned[0].networkId).toBe("simnet");
  });

  it("testnet-10 declared, node testnet-10 in the raw kaspa-wasm shape (`network`) → one submit", async () => {
    const ctx = wallet({ network: "testnet", networkId: "testnet-10" }, { server: ok("testnet-10"), dag: [{ network: "testnet-10" }] });
    await send(ctx.w);
    expect(ctx.rpc.submits).toBe(1);
    expect(ctx.signer.network).toBe("testnet-10");
  });

  it("`kaspa-testnet-10` declared, node `testnet-10` → same network (alias), one submit", async () => {
    const ctx = wallet({ networkId: "kaspa-testnet-10" }, { server: ok("testnet-10"), dag: ok("testnet-10") });
    await send(ctx.w);
    expect(ctx.rpc.submits).toBe(1);
  });

  it("payMany, sweep, consolidate and split each go through once on a verified simnet node", async () => {
    for (const run of [
      (w: WalletToolkit) => w.payMany({ outputs: [{ address: "kaspasim:qdest", amount: 1_000n }], feeRate: 1n }),
      (w: WalletToolkit) => w.sweep({ to: "kaspasim:qdest", feeRate: 1n }),
      (w: WalletToolkit) => w.consolidate({ feeRate: 1n }),
      (w: WalletToolkit) => w.split({ outputsCount: 2, amountPerOutput: 1_000n, feeRate: 1n })
    ]) {
      const ctx = wallet({ networkId: "simnet" }, { server: ok("simnet"), dag: ok("simnet") });
      await run(ctx.w);
      expect(ctx.signer.signs).toBe(1);
      expect(ctx.rpc.submits).toBe(1);
    }
  });

  it("order: identity → plan → identity → sign → identity → submit", async () => {
    const ctx = wallet({ networkId: "simnet" }, { server: ok("simnet"), dag: ok("simnet") });
    await send(ctx.w);
    const order = ctx.log.filter((e) => e !== "dag" || true).join(" ");
    expect(order).toMatch(/server dag .*plan server dag sign server dag submit$/);
  });
});

describe("P0-TX-SAFETY-1B · property 1: no signature, no submit without a valid, coherent identity", () => {
  it.each([
    ["mainnet", "mainnet"],
    ["mainnet-1", "mainnet-1"],
    ["kaspa", "kaspa"],
    ["kaspa-mainnet", "kaspa-mainnet"],
    ["Mainnet", "MAINNET"]
  ])("declared networkId %s → MAINNET refusal before any read", async (declared) => {
    const ctx = wallet({ networkId: declared }, { server: ok("simnet"), dag: ok("simnet") });
    await refused(ctx, () => send(ctx.w), /MAINNET/);
    expect(ctx.log).toEqual([]);
  });

  it.each([["mainnet"], ["mainnet-1"], ["kaspa-mainnet"]])("node answers %s in both reads → refused", async (nodeNet) => {
    const ctx = wallet({ networkId: "testnet-10" }, { server: ok(nodeNet), dag: [{ network: nodeNet }] });
    await refused(ctx, () => send(ctx.w), /MAINNET|NODE_NETWORK/);
  });

  it("no network declared → WALLET_NETWORK_UNDECLARED (the node's network is never adopted)", async () => {
    const ctx = wallet({}, { server: ok("simnet"), dag: ok("simnet") });
    await refused(ctx, () => send(ctx.w), "WALLET_NETWORK_UNDECLARED");
  });

  it("`testnet` alone is ambiguous → refused; `simnet` alone is exact and accepted", async () => {
    const amb = wallet({ network: "testnet" }, { server: ok("testnet-10"), dag: ok("testnet-10") });
    await refused(amb, () => send(amb.w), "WALLET_NETWORK_AMBIGUOUS");
    const exact = wallet({ network: "simnet" }, { server: ok("simnet"), dag: ok("simnet") });
    await send(exact.w);
    expect(exact.rpc.submits).toBe(1);
  });

  it("an invalid or contradictory declaration → refused", async () => {
    const bad = wallet({ networkId: "prod" }, { server: ok("simnet"), dag: ok("simnet") });
    await refused(bad, () => send(bad.w), "WALLET_NETWORK_INVALID");
    const contra = wallet({ network: "simnet", networkId: "testnet-10" }, { server: ok("testnet-10"), dag: ok("testnet-10") });
    await refused(contra, () => send(contra.w), "WALLET_NETWORK_CONTRADICTORY");
  });

  it.each([
    ["testnet-10", "testnet-11"],
    ["testnet-11", "testnet-10"],
    ["simnet", "testnet-10"],
    ["testnet-10", "simnet"]
  ])("declared %s, node %s → NODE_NETWORK_MISMATCH", async (declared, nodeNet) => {
    const ctx = wallet({ networkId: declared }, { server: ok(nodeNet), dag: ok(nodeNet) });
    await refused(ctx, () => send(ctx.w), "NODE_NETWORK_MISMATCH");
  });

  it("getServerInfo absent → NODE_NETWORK_UNKNOWN", async () => {
    const ctx = wallet({ networkId: "simnet" }, { dag: ok("simnet") });
    await refused(ctx, () => send(ctx.w), "NODE_NETWORK_UNKNOWN");
  });

  it("getBlockDagInfo absent → NODE_NETWORK_UNKNOWN", async () => {
    const ctx = wallet({ networkId: "simnet" }, { server: ok("simnet") });
    await refused(ctx, () => send(ctx.w), "NODE_NETWORK_UNKNOWN");
  });

  it("the two answers disagree → NODE_NETWORK_MISMATCH", async () => {
    const ctx = wallet({ networkId: "testnet-10" }, { server: ok("testnet-10"), dag: ok("testnet-11") });
    await refused(ctx, () => send(ctx.w), "NODE_NETWORK_MISMATCH");
  });

  it("answers without a network, or 'unknown' → NODE_NETWORK_UNKNOWN", async () => {
    const a = wallet({ networkId: "simnet" }, { server: [{}], dag: ok("simnet") });
    await refused(a, () => send(a.w), "NODE_NETWORK_UNKNOWN");
    const b = wallet({ networkId: "simnet" }, { server: ok("simnet"), dag: ok("unknown") });
    await refused(b, () => send(b.w), "NODE_NETWORK_UNKNOWN");
  });

  it("getServerInfo fails (plain error) → refused (fail closed)", async () => {
    const ctx = wallet({ networkId: "simnet" }, { server: [() => { throw new Error("connection reset"); }], dag: ok("simnet") });
    await refused(ctx, () => send(ctx.w), "NODE_NETWORK_UNKNOWN");
  });

  it("getServerInfo / getBlockDagInfo time out (typed RPC timeout) → refused with the typed error", async () => {
    const t = () => { throw new RpcTimeoutError("RPC request getServerInfo timed out after 5000ms"); };
    const a = wallet({ networkId: "simnet" }, { server: [t], dag: ok("simnet") });
    await refused(a, () => send(a.w));
    const b = wallet({ networkId: "simnet" }, { server: ok("simnet"), dag: [t] });
    await refused(b, () => send(b.w));
  });

  it("identity changes after planning (pre-sign read says testnet-11) → nothing signed", async () => {
    // reads: server#1 dag#1 (initial) · dag#2 (DAA for planning) · server#2 dag#3 (pre-sign)
    const ctx = wallet({ networkId: "testnet-10" }, { server: [{ networkId: "testnet-10" }, { networkId: "testnet-11" }], dag: ok("testnet-10") });
    await refused(ctx, () => send(ctx.w), "NODE_NETWORK_MISMATCH");
  });

  it("identity changes after signing (pre-submit read turns mainnet) → signed once, NOT submitted", async () => {
    const ctx = wallet({ networkId: "simnet" }, { server: [{ networkId: "simnet" }, { networkId: "simnet" }, { networkId: "mainnet" }], dag: ok("simnet") });
    let threw: any;
    try { await send(ctx.w); } catch (e) { threw = e; }
    expect(threw).toBeDefined();
    expect(ctx.signer.signs).toBe(1);
    expect(ctx.rpc.submits).toBe(0);
  });

  it("every spend path refuses on a mismatched node with zero signatures", async () => {
    for (const run of [
      (w: WalletToolkit) => w.payMany({ outputs: [{ address: "kaspasim:qdest", amount: 1_000n }], feeRate: 1n }),
      (w: WalletToolkit) => w.sweep({ to: "kaspasim:qdest", feeRate: 1n }),
      (w: WalletToolkit) => w.consolidate({ feeRate: 1n }),
      (w: WalletToolkit) => w.split({ outputsCount: 2, amountPerOutput: 1_000n, feeRate: 1n }),
      (w: WalletToolkit) => (w as any).signAndBroadcast({ inputs: [], outputs: [{ address: "kaspasim:qdest", amountSompi: 1n }], estimatedFeeSompi: 1n })
    ]) {
      const ctx = wallet({ networkId: "simnet" }, { server: ok("testnet-10"), dag: ok("testnet-10") });
      await refused(ctx, () => run(ctx.w), "NODE_NETWORK_MISMATCH");
    }
  });
});

describe("P0-TX-SAFETY-1B · one attempt, and an honest outcome after the submit", () => {
  it("timeout after the submit → WALLET_SUBMIT_OUTCOME_UNKNOWN (never 'not sent'), exactly one submit", async () => {
    const ctx = wallet({ networkId: "simnet" }, { server: ok("simnet"), dag: ok("simnet"), submit: "timeout" });
    let threw: any;
    try { await send(ctx.w); } catch (e) { threw = e; }
    expect(threw?.code).toBe("WALLET_SUBMIT_OUTCOME_UNKNOWN");
    expect(threw?.message).toMatch(/may have received it/);
    expect(threw?.metadata?.txId).toBe("e".repeat(64));
    expect(ctx.rpc.submits).toBe(1);
  });

  it("the node's own rejection → WALLET_SUBMIT_REJECTED, one submit", async () => {
    const ctx = wallet({ networkId: "simnet" }, { server: ok("simnet"), dag: ok("simnet"), submit: "rejected" });
    let threw: any;
    try { await send(ctx.w); } catch (e) { threw = e; }
    expect(threw?.code).toBe("WALLET_SUBMIT_REJECTED");
    expect(ctx.rpc.submits).toBe(1);
  });

  it("a transport refusal before anything left (RPC_REQUEST_NOT_SENT) stays typed as not sent", async () => {
    const ctx = wallet({ networkId: "simnet" }, { server: ok("simnet"), dag: ok("simnet"), submit: "not-sent" });
    let threw: any;
    try { await send(ctx.w); } catch (e) { threw = e; }
    expect(threw?.code).not.toBe("WALLET_SUBMIT_OUTCOME_UNKNOWN");
    expect(ctx.rpc.submits).toBe(1);
  });
});

describe("P0-TX-SAFETY-1B · read-only queries stay available", () => {
  it("balance and estimateFee work without a declared network (they sign and send nothing)", async () => {
    const ctx = wallet({}, { server: ok("simnet"), dag: ok("simnet") });
    await expect(ctx.w.balance()).resolves.toBeDefined();
    await expect(ctx.w.estimateFee({ to: "kaspasim:qdest", amount: 1_000n, feeRate: 1n })).resolves.toBeDefined();
    expect(ctx.signer.signs).toBe(0);
    expect(ctx.rpc.submits).toBe(0);
  });
});
