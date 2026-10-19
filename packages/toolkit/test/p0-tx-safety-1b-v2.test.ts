/*
 * P0-TX-SAFETY-1B v2 (owner review 2026-10-18) · WalletToolkit:
 *  - addresses are derived for the DECLARED network (testnet-10 → kaspatest:), never the simnet default;
 *  - a testnet networkId without its suffix is ambiguous and refused, like `network: "testnet"`;
 *  - a submit that RESOLVES with a structured rejection (no exception) is never reported as success; an answer that
 *    names no transaction, or another one, proves nothing either.
 * In-process fakes only: no network, no wallet with funds.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { WalletToolkit } from "../src/index.js";

const SIGNED = "e".repeat(64);
let tmp: string;
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p0-1b-v2-")); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

let n = 0;
function wallet(decl: { network?: string; networkId?: string }, node: { net: string; answer?: unknown }) {
  const log: string[] = [];
  const rpc: any = {
    submits: 0,
    async getServerInfo() { log.push("server"); return { networkId: node.net }; },
    async getBlockDagInfo() { log.push("dag"); return { network: node.net, virtualDaaScore: 1000n }; },
    async submitTransaction() { rpc.submits++; log.push("submit"); return node.answer === undefined ? { transactionId: SIGNED } : node.answer; }
  };
  const signer: any = {
    signs: 0,
    async signTxPlan() { signer.signs++; log.push("sign"); return { txId: SIGNED, signedTransaction: { payload: "{}" } }; }
  };
  const w = WalletToolkit.open(`v${++n}`, { storePath: path.join(tmp, `v${n}.json`), ...(decl as any), rpc, signer, coinbaseMaturity: 100n });
  return { w, rpc, signer, log };
}

function stubSpendPath(ctx: ReturnType<typeof wallet>) {
  vi.spyOn(ctx.w, "receive").mockResolvedValue("kaspatest:qsource");
  vi.spyOn(ctx.w.utxos, "list").mockResolvedValue([{ transactionId: "aa".repeat(32), outputIndex: 0, amountSompi: 10_000_000n, scriptPublicKey: "00", blockDaaScore: 1n, isCoinbase: false }] as any);
  const plan = { inputs: [], outputs: [{ address: "kaspatest:qdest", amountSompi: 1_000n }], estimatedMass: 1000n, estimatedFeeSompi: 2000n };
  vi.spyOn(ctx.w as any, "planUpstream").mockResolvedValue({ plan });
  return ctx;
}

const send = (w: WalletToolkit) => w.send({ to: "kaspatest:qdest", amount: 1_000n, feeRate: 1n });

describe("P0-TX-SAFETY-1B v2 · addresses follow the declared network", () => {
  it("networkId testnet-10 → receive() is a kaspatest: address (BEFORE: kaspasim:)", async () => {
    const { w } = wallet({ networkId: "testnet-10" }, { net: "testnet-10" });
    await w.create();
    expect(await w.receive()).toMatch(/^kaspatest:/);
  });

  it("networkId simnet → kaspasim:; nothing declared keeps the simnet default for read-only use", async () => {
    const a = wallet({ networkId: "simnet" }, { net: "simnet" });
    await a.w.create();
    expect(await a.w.receive()).toMatch(/^kaspasim:/);
    const b = wallet({}, { net: "simnet" });
    await b.w.create();
    expect(await b.w.receive()).toMatch(/^kaspasim:/);
  });

  it("network simnet + networkId testnet-10 → receive() refuses (contradictory), no address is handed out", async () => {
    const { w } = wallet({ network: "simnet", networkId: "testnet-10" }, { net: "testnet-10" });
    await w.create();
    await expect(w.receive()).rejects.toMatchObject({ code: "WALLET_NETWORK_CONTRADICTORY" });
  });

  it("the change address of a testnet-10 spend is a testnet address (it is the wallet's receive address)", async () => {
    const ctx = wallet({ networkId: "testnet-10" }, { net: "testnet-10" });
    await ctx.w.create();
    vi.spyOn(ctx.w.utxos, "list").mockResolvedValue([{ transactionId: "aa".repeat(32), outputIndex: 0, amountSompi: 10_000_000n, scriptPublicKey: "00", blockDaaScore: 1n, isCoinbase: false }] as any);
    const seen: any[] = [];
    vi.spyOn(ctx.w as any, "planUpstream").mockImplementation(async (p: any) => {
      seen.push(p);
      return { plan: { inputs: [], outputs: [{ address: "kaspatest:qdest", amountSompi: 1_000n }], estimatedMass: 1000n, estimatedFeeSompi: 2000n } };
    });
    await send(ctx.w);
    expect(seen[0].fromAddress).toMatch(/^kaspatest:/);
    expect(seen[0].networkId).toBe("testnet-10");
    expect(ctx.rpc.submits).toBe(1);
  });
});

describe("P0-TX-SAFETY-1B v2 · a testnet networkId without its suffix is ambiguous", () => {
  it.each([["testnet"], ["kaspa-testnet"], ["TESTNET"]])("networkId %s → WALLET_NETWORK_AMBIGUOUS before any read, nothing signed", async (id) => {
    const ctx = stubSpendPath(wallet({ networkId: id }, { net: "testnet-10" }));
    await expect(send(ctx.w)).rejects.toMatchObject({ code: "WALLET_NETWORK_AMBIGUOUS" });
    expect(ctx.log).toEqual([]);
    expect(ctx.signer.signs).toBe(0);
  });

  it("devnet (no suffix needed) is exact and works with a devnet node", async () => {
    const ctx = stubSpendPath(wallet({ networkId: "devnet" }, { net: "devnet" }));
    await send(ctx.w);
    expect(ctx.rpc.submits).toBe(1);
  });
});

describe("P0-TX-SAFETY-1B v2 · a resolved rejection is never a success", () => {
  it.each([
    ["accepted:false + the node's rejection text", { accepted: false, error: `Rejected transaction ${SIGNED}: transaction ${SIGNED} is not standard: x` }, "WALLET_SUBMIT_REJECTED"],
    ["accepted:false, no error", { accepted: false }, "WALLET_SUBMIT_REJECTED"],
    ["an error object", { error: { code: -1, message: `Rejected transaction ${SIGNED}: output already spent` } }, "WALLET_SUBMIT_REJECTED"],
    ["accepted:false + a transport text", { accepted: false, error: "RPC request submitTransaction timed out after 5000ms" }, "WALLET_SUBMIT_OUTCOME_UNKNOWN"],
    ["an empty answer", {}, "WALLET_SUBMIT_OUTCOME_UNKNOWN"],
    ["another transaction's id", { transactionId: "d".repeat(64) }, "WALLET_SUBMIT_OUTCOME_UNKNOWN"],
    ["a transactionId WITH an error", { transactionId: SIGNED, error: "Rejected transaction x: y" }, "WALLET_SUBMIT_REJECTED"]
  ])("submit resolves with %s → %s, one submit, no txId returned", async (_label, answer, code) => {
    const ctx = stubSpendPath(wallet({ networkId: "testnet-10" }, { net: "testnet-10", answer }));
    let result: unknown;
    let threw: any;
    try { result = await send(ctx.w); } catch (e) { threw = e; }
    expect(result).toBeUndefined();
    expect(threw?.code).toBe(code);
    expect(ctx.rpc.submits).toBe(1);
  });

  it("control: { transactionId: <the signed id> } and { accepted: true } are successes", async () => {
    const a = stubSpendPath(wallet({ networkId: "testnet-10" }, { net: "testnet-10", answer: { transactionId: SIGNED } }));
    expect((await send(a.w)).txId).toBe(SIGNED);
    const b = stubSpendPath(wallet({ networkId: "testnet-10" }, { net: "testnet-10", answer: { accepted: true } }));
    expect((await send(b.w)).txId).toBe(SIGNED);
  });
});
