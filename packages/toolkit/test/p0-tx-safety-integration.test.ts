/*
 * P0-TX-SAFETY integration · 1A × 1B. WalletToolkit (1B) classifies a submit's answer with `submitOutcomeOf` from
 * @hardkas/artifacts (1A). The node saying it ALREADY HOLDS the transaction — "is already in the mempool", "was already
 * accepted by the consensus", "is already in the orphan pool" (rusty-kaspa v2.1.0's texts, wrapped as "Rejected
 * transaction <id>: …") — must reach the caller as an unresolved outcome, never as a rejection that invites paying
 * again; whether the RPC throws it or returns it as a structured error. A refusal before anything left stays typed as
 * not sent. In-process fakes only.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { markRequestNotSent, isRpcRequestNotSentError } from "@hardkas/kaspa-rpc";
import { submitOutcomeOf, nodeAlreadyHoldsTx } from "@hardkas/artifacts";
import { WalletToolkit } from "../src/index.js";

const TX = "e".repeat(64);
const HELD = [
  `transaction ${TX} is already in the mempool`,
  `transaction ${TX} was already accepted by the consensus`,
  `orphan transaction ${TX} is already in the orphan pool`
];

let tmp: string;
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p0-int-")); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

let n = 0;
function wallet(submit: () => Promise<unknown>) {
  const rpc: any = {
    submits: 0,
    async getServerInfo() { return { networkId: "simnet" }; },
    async getBlockDagInfo() { return { network: "simnet", virtualDaaScore: 1000n }; },
    async submitTransaction() { rpc.submits++; return submit(); }
  };
  const signer: any = { signs: 0, async signTxPlan() { signer.signs++; return { txId: TX, signedTransaction: { payload: "{}" } }; } };
  const w = WalletToolkit.open(`i${++n}`, { storePath: path.join(tmp, `i${n}.json`), networkId: "simnet", rpc, signer, coinbaseMaturity: 100n });
  vi.spyOn(w, "receive").mockResolvedValue("kaspasim:qsource");
  vi.spyOn(w.utxos, "list").mockResolvedValue([{ transactionId: "aa".repeat(32), outputIndex: 0, amountSompi: 10_000_000n, scriptPublicKey: "00" }] as any);
  vi.spyOn(w as any, "planUpstream").mockResolvedValue({ plan: { inputs: [], outputs: [{ address: "kaspasim:qd", amountSompi: 1_000n }], estimatedMass: 1n, estimatedFeeSompi: 1n } });
  return { w, rpc, signer };
}

async function outcomeOf(submit: () => Promise<unknown>) {
  const ctx = wallet(submit);
  let threw: any;
  let result: unknown;
  try { result = await ctx.w.send({ to: "kaspasim:qd", amount: 1_000n, feeRate: 1n }); } catch (e) { threw = e; }
  return { ...ctx, threw, result };
}

describe("P0-TX-SAFETY integration · 1A's classification as WalletToolkit (1B) consumes it", () => {
  it("the artifacts helpers 1B uses are 1A's: 'already held' is unknown, a real rejection stays rejected", () => {
    for (const rule of HELD) {
      expect(nodeAlreadyHoldsTx(`Rejected transaction ${TX}: ${rule}`)).toBe(true);
      expect(submitOutcomeOf({ accepted: false, error: `Rejected transaction ${TX}: ${rule}` })).toBe("unknown");
    }
    expect(submitOutcomeOf({ accepted: false, error: `Rejected transaction ${TX}: transaction ${TX} is not standard: x` })).toBe("rejected");
  });

  it.each(HELD)("RPC THROWS 'Rejected transaction …: %s' → WALLET_SUBMIT_OUTCOME_UNKNOWN (never REJECTED), one submit", async (rule) => {
    const r = await outcomeOf(async () => { throw new Error(`Rejected transaction ${TX}: ${rule}`); });
    expect(r.result).toBeUndefined();
    expect(r.threw?.code).toBe("WALLET_SUBMIT_OUTCOME_UNKNOWN");
    expect(r.threw?.metadata?.txId).toBe(TX);
    expect(r.rpc.submits).toBe(1);
  });

  it.each(HELD)("RPC RETURNS { accepted:false, error:'Rejected transaction …: %s' } → WALLET_SUBMIT_OUTCOME_UNKNOWN, one submit", async (rule) => {
    const r = await outcomeOf(async () => ({ accepted: false, error: `Rejected transaction ${TX}: ${rule}` }));
    expect(r.result).toBeUndefined();
    expect(r.threw?.code).toBe("WALLET_SUBMIT_OUTCOME_UNKNOWN");
    expect(r.rpc.submits).toBe(1);
  });

  it.each(HELD)("RPC RETURNS { error: { message: 'Rejected transaction …: %s' } } → WALLET_SUBMIT_OUTCOME_UNKNOWN", async (rule) => {
    const r = await outcomeOf(async () => ({ error: { code: -1, message: `Rejected transaction ${TX}: ${rule}` } }));
    expect(r.threw?.code).toBe("WALLET_SUBMIT_OUTCOME_UNKNOWN");
  });

  it("a real rejection, thrown or returned, stays WALLET_SUBMIT_REJECTED", async () => {
    const text = `Rejected transaction ${TX}: transaction ${TX} is not standard: x`;
    expect((await outcomeOf(async () => { throw new Error(text); })).threw?.code).toBe("WALLET_SUBMIT_REJECTED");
    expect((await outcomeOf(async () => ({ accepted: false, error: text }))).threw?.code).toBe("WALLET_SUBMIT_REJECTED");
  });

  it("SUBMIT_NOT_SENT-class refusal (the request never left) stays typed as not sent, distinct from an ambiguous outcome", async () => {
    const notSent = await outcomeOf(async () => { throw markRequestNotSent(new Error("connection not open")); });
    expect(isRpcRequestNotSentError(notSent.threw)).toBe(true);
    expect(notSent.threw?.code).not.toBe("WALLET_SUBMIT_OUTCOME_UNKNOWN");
    const ambiguous = await outcomeOf(async () => { throw new Error("socket hang up"); });
    expect(ambiguous.threw?.code).toBe("WALLET_SUBMIT_OUTCOME_UNKNOWN");
  });

  it("control: an accepted submit is one success with the signed txId", async () => {
    const r = await outcomeOf(async () => ({ transactionId: TX }));
    expect((r.result as any)?.txId).toBe(TX);
    expect(r.rpc.submits).toBe(1);
  });
});
