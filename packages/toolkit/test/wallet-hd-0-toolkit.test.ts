/*
 * WALLET-HD-0 · WalletToolkit: its identity is the synthetic legacy one (keys computable from the wallet's NAME), so it
 * may exist on simnet only. On any other declared network the toolkit refuses to create the identity and to hand out an
 * address, before planning, signing or sending (F-01 / F-02 containment). In-process fakes only: no node, no funds.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { WalletToolkit } from "../src/index.js";

const BLOCKED = "WALLET_SYNTHETIC_NETWORK_BLOCKED";
let tmp: string;
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "whd0-toolkit-")); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

let n = 0;
/** The network name a coherent fake node would announce for a declaration (the identity rule, not the node, must refuse). */
const nodeNetFor = (decl: { network?: string; networkId?: string }): string => {
  const d = (decl.networkId ?? decl.network ?? "simnet").toLowerCase().replace(/^kaspa-/, "");
  return d === "testnet" ? "testnet-10" : d;
};
function wallet(decl: { network?: string; networkId?: string }, nodeNet: string = nodeNetFor(decl)) {
  const log: string[] = [];
  const rpc: any = {
    submits: 0,
    async getServerInfo() { log.push("server"); return { networkId: nodeNet }; },
    async getBlockDagInfo() { log.push("dag"); return { network: nodeNet, virtualDaaScore: 1000n }; },
    async getBalanceByAddress() { log.push("balance"); return { balanceSompi: 0n }; },
    async getUtxosByAddress() { log.push("utxos"); return []; },
    async submitTransaction() { rpc.submits++; log.push("submit"); return { transactionId: "e".repeat(64) }; }
  };
  const signer: any = { signs: 0, async signTxPlan() { signer.signs++; log.push("sign"); return { txId: "e".repeat(64), signedTransaction: { payload: "{}" } }; } };
  const w = WalletToolkit.open(`smoke-test-bot`, { storePath: path.join(tmp, `w${++n}.json`), ...(decl as any), rpc, signer, coinbaseMaturity: 100n });
  return { w, rpc, signer, log };
}

const codeOf = async (p: Promise<unknown>): Promise<string | undefined> => {
  try { await p; return undefined; } catch (e: any) { return String(e?.code ?? ""); }
};

describe("WALLET-HD-0 · a synthetic wallet on a public or unknown network is refused before any address exists", () => {
  it.each([
    [{ networkId: "testnet-10" }],
    [{ networkId: "testnet-11" }],
    [{ networkId: "kaspa-testnet-10" }],
    [{ network: "testnet" }],
    [{ network: "testnet", networkId: "testnet-10" }],
    [{ networkId: "devnet" }],
    [{ networkId: "mainnet" }]
  ])("declaration %j → create() and receive() refuse with the typed code; balance/send too; nothing signed or sent", async (decl) => {
    const ctx = wallet(decl as any);
    expect(await codeOf(ctx.w.create())).toBe(BLOCKED);
    expect(await codeOf(ctx.w.receive())).toBe(BLOCKED);
    expect(await codeOf(ctx.w.balance())).toBe(BLOCKED);
    expect(await codeOf(ctx.w.utxos.list())).toBe(BLOCKED);
    const sendCode = await codeOf(ctx.w.send({ to: "kaspatest:qdest", amount: 1_000n, feeRate: 1n }));
    // mainnet is refused by the product policy first and a bare `testnet` by the 1B ambiguity rule (both before the
    // identity is touched); every other declaration by the synthetic-identity rule
    expect([BLOCKED, "MAINNET_BROADCAST_DISABLED", "WALLET_NETWORK_AMBIGUOUS"]).toContain(sendCode);
    expect(ctx.signer.signs).toBe(0);
    expect(ctx.rpc.submits).toBe(0);
    // WALLET-HD-0.1: a refused operation does no external work at all — not even the node-identity reads: the declared
    // network and the wallet's identity are judged before the node is asked anything
    expect(ctx.log, JSON.stringify(ctx.log)).toEqual([]);
  });

  it("network: mainnet is refused already at open() by the query layer (pre-existing WALLET_QUERY_MAINNET_BLOCKED)", () => {
    expect(() => wallet({ network: "mainnet" })).toThrow(/WALLET_QUERY_MAINNET_BLOCKED/);
  });

  it.each([["foo"], [""], ["kaspatest"], ["kaspasim"]])("an unknown network name or an address prefix (%j) is not a network: refused, not defaulted to simnet", async (id) => {
    const ctx = wallet({ networkId: id });
    const created = await codeOf(ctx.w.create());
    expect(["WALLET_NETWORK_INVALID", BLOCKED]).toContain(created);
    const received = await codeOf(ctx.w.receive());
    expect(["WALLET_NETWORK_INVALID", BLOCKED]).toContain(received);
  });

  it("the refusal explains itself and points to a real account, without any key material", async () => {
    const ctx = wallet({ networkId: "testnet-10" });
    let err: any;
    try { await ctx.w.create(); } catch (e) { err = e; }
    expect(err?.code).toBe(BLOCKED);
    expect(String(err?.message)).toMatch(/synthetic/i);
    expect(String(err?.message)).toMatch(/accounts real generate/);
    expect(String(err?.message)).not.toMatch(/seedref_|[0-9a-f]{64}/);
  });
});

describe("WALLET-HD-0 · simnet keeps working exactly as before", () => {
  it.each([[{}], [{ networkId: "simnet" }], [{ network: "simnet" }], [{ networkId: "simulated" }], [{ networkId: "kaspa-simnet" }], [{ network: "local-docker-simnet" }]])(
    "declaration %j → create() + receive() give the pinned simnet address of this wallet name",
    async (decl) => {
      const ctx = wallet(decl as any, "simnet");
      await ctx.w.create();
      const addr = await ctx.w.receive();
      // walletId "smoke-test-bot", account 0, index 0, payload network "simnet": captured on develop 5b1bf4ee1
      expect(addr).toBe("kaspasim:qq6te2qh54u92aj8nz4h503ye5g0f2tj4ctr2msqj550spzqq4q9yqv3pwvfc");
      expect(await ctx.w.receive()).toBe(addr);
    }
  );

  it("a simnet wallet still plans a spend path up to the signer (the identity rule does not touch simnet)", async () => {
    const ctx = wallet({ networkId: "simnet" }, "simnet");
    await ctx.w.create();
    const addr = await ctx.w.receive();
    expect(addr).toMatch(/^kaspasim:/);
    // no UTXOs → the planner refuses for funds, never for the identity
    const code = await codeOf(ctx.w.send({ to: addr, amount: 1_000n, feeRate: 1n }));
    expect(code).not.toBe(BLOCKED);
    expect(ctx.log).toContain("utxos");
  });
});
