import { describe, it, expect } from "vitest";
import { fundTestAccount, type IsolatedSimnetSession } from "../src/isolated-simnet.js";

// FUND-SPENDABLE-BY-PLANNER-1 (2026-11-16) · fundTestAccount hands over only a UTXO the HardKAS planners will spend: a
// coinbase more than maturity + 10 DAA deep (`excludeImmatureCoinbase`, @hardkas/tx-builder). It used to hand over a
// coinbase at exactly 1000 DAA, and a test planning with it inside the next 10 DAA had it excluded (cltv-ecdsa-node E-2:
// a flaky INSUFFICIENT_FUNDS_UPSTREAM on CI). A scripted node: its DAA score moves one per mined block. No real node.

const ADDRESS = "kaspasim:qqtfjtwvkatytgcyn2shwnf4x6zc9vqw9vp6ghrjjg5tle742q7zccql6z32g";
const KAS = 100_000_000n;

function fakeSession(state: { daa: bigint; utxos: any[] }): IsolatedSimnetSession & { mined: () => number } {
  let mined = 0;
  const rpc = {
    getBlockDagInfo: async () => ({ virtualDaaScore: state.daa }),
    getUtxosByAddress: async () => state.utxos,
    call: async (method: string) => {
      if (method === "getBlockTemplateRequest") return { block: {} };
      if (method === "submitBlockRequest") { mined++; state.daa += 1n; return {}; }
      throw new Error(`unexpected ${method}`);
    }
  };
  return { rpc, minerAddress: "kaspasim:miner", mined: () => mined } as any;
}
const coin = (txid: string, blockDaaScore: bigint, isCoinbase: boolean, amountSompi = 50n * KAS) => ({
  outpoint: { transactionId: txid.repeat(64).slice(0, 64), index: 0 },
  amountSompi,
  scriptPublicKey: { version: 0, script: "20" + "ab".repeat(32) + "ac" },
  blockDaaScore,
  isCoinbase
});

describe("FUND-SPENDABLE-BY-PLANNER-1 · fundTestAccount follows the planners' maturity rule", () => {
  it("FSP-1 a coinbase 1005 DAA deep (mature for consensus, not for the planners) is not handed over until it clears the margin", async () => {
    const state = { daa: 11_005n, utxos: [coin("a", 10_000n, true)] };
    const session = fakeSession(state);
    const got = await fundTestAccount(session, ADDRESS, 3n * KAS);
    expect(session.mined()).toBeGreaterThan(0); // it mined instead of returning the coin at once (the old behavior)
    expect(state.daa - got.blockDaaScore).toBeGreaterThan(1_010n); // what it returns, the planners spend
  });

  it("FSP-2 a coinbase 1011 DAA deep is handed over at once, nothing mined", async () => {
    const state = { daa: 11_011n, utxos: [coin("b", 10_000n, true)] };
    const session = fakeSession(state);
    const got = await fundTestAccount(session, ADDRESS, 3n * KAS);
    expect(got.outpoint.transactionId.startsWith("b")).toBe(true);
    expect(session.mined()).toBe(0);
  });

  it("FSP-3 at exactly maturity + 10 (1010 DAA) the planners still exclude it, so it is not handed over at once", async () => {
    const state = { daa: 11_010n, utxos: [coin("c", 10_000n, true)] };
    const session = fakeSession(state);
    await fundTestAccount(session, ADDRESS, 3n * KAS);
    expect(session.mined()).toBeGreaterThan(0);
  });

  it("FSP-4 a non-coinbase UTXO is handed over at once whatever its depth; a smaller one is skipped", async () => {
    const state = { daa: 100n, utxos: [coin("d", 99n, false, 1n * KAS), coin("e", 99n, false)] };
    const session = fakeSession(state);
    const got = await fundTestAccount(session, ADDRESS, 3n * KAS);
    expect(got.outpoint.transactionId.startsWith("e")).toBe(true);
    expect(session.mined()).toBe(0);
  });
});
