import { describe, it, expect } from "vitest";
import { calculateDynamicFeeRate } from "../src/fee-estimator.js";

/*
 * HK-09 / CA-TX-01 (counter-audit X3-02-tx.log, EXP-04). kaspa-wasm 2.1.0 `getFeeEstimate` answers
 * `{ estimate: { priorityBucket, normalBuckets, lowBuckets } }` (kaspa.d.ts IGetFeeEstimateResponse / IFeeEstimate);
 * the estimator read `priorityBucket` at the root (never there), labelled the result "dynamic" whenever getInfo
 * answered, read the priority bucket whatever the priority, and took a flat-shaped rate of any size (1e6 sompi/g).
 */

const nodeShape = (priority: number, normal: number, low: number, mempoolSize = 5) => ({
  getInfo: async () => ({ mempoolSize }),
  getFeeEstimate: async () => ({
    estimate: {
      priorityBucket: { feerate: priority, estimatedSeconds: 1 },
      normalBuckets: [{ feerate: normal, estimatedSeconds: 30 }],
      lowBuckets: [{ feerate: low, estimatedSeconds: 60 }]
    }
  })
});

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e: any) {
    return e?.code;
  }
  return undefined;
}

describe("HK-09 · the node's fee estimate, read in its real shape", () => {
  it("each priority reads its bucket: fast → priorityBucket, normal → normalBuckets[0], slow → lowBuckets[0]", async () => {
    const rpc = nodeShape(500, 250, 120) as any;
    expect((await calculateDynamicFeeRate(rpc, "fast", 100n)).feeRate).toBe(500n);
    expect((await calculateDynamicFeeRate(rpc, "normal", 100n)).feeRate).toBe(250n);
    expect((await calculateDynamicFeeRate(rpc, "slow", 100n)).feeRate).toBe(120n);
    const r = await calculateDynamicFeeRate(rpc, "normal", 100n);
    expect(r.evidence).toBe("dynamic");
    expect(r.source).toBe("node-estimate");
    expect(r.nodeFeeRate).toBe(250);
  });

  it("a node rate below the floor gives the floor (the relay minimum), still from the node's estimate", async () => {
    const r = await calculateDynamicFeeRate(nodeShape(100, 100, 100) as any, "normal", 100n);
    expect(r.feeRate).toBe(100n);
    expect(r.evidence).toBe("dynamic");
  });

  it("no estimate (getInfo only, or no client): the relay minimum, labelled heuristic — never 'dynamic'", async () => {
    const infoOnly = { getInfo: async () => ({ mempoolSize: 60_000 }) } as any;
    const a = await calculateDynamicFeeRate(infoOnly, "fast", 100n);
    expect(a.feeRate).toBe(100n);
    expect(a.evidence).toBe("heuristic");
    expect(a.source).toBe("network-minimum");
    const b = await calculateDynamicFeeRate(undefined, "normal");
    expect(b.feeRate).toBe(100n);
    expect(b.evidence).toBe("heuristic");
  });

  it("a malformed estimate is not used (minimum, heuristic)", async () => {
    for (const bad of [Number.NaN, -5, Number.POSITIVE_INFINITY, "500" as any]) {
      const r = await calculateDynamicFeeRate(nodeShape(bad, bad, bad) as any, "fast", 100n);
      expect(r.feeRate).toBe(100n);
      expect(r.evidence).toBe("heuristic");
    }
  });
});

describe("CA-TX-01 · an untrusted node rate is bounded", () => {
  it("1e6 sompi/g (official shape) → FEE_RATE_ABOVE_BOUND", async () => {
    expect(await codeOf(calculateDynamicFeeRate(nodeShape(1_000_000, 1_000_000, 1_000_000) as any, "normal", 100n))).toBe("FEE_RATE_ABOVE_BOUND");
  });
  it("1e6 sompi/g (flat shape of injected clients) → FEE_RATE_ABOVE_BOUND", async () => {
    const flat = { getInfo: async () => ({ mempoolSize: 5 }), getFeeEstimate: async () => ({ priorityBucket: { feerate: 1_000_000 } }) } as any;
    expect(await codeOf(calculateDynamicFeeRate(flat, "fast", 100n))).toBe("FEE_RATE_ABOVE_BOUND");
  });
  it("the bound is configurable", async () => {
    const r = await calculateDynamicFeeRate(nodeShape(1_000_000, 1_000_000, 1_000_000) as any, "normal", 100n, { maxFeeRate: 2_000_000n });
    expect(r.feeRate).toBe(1_000_000n);
  });
});
