import { describe, it, expect } from "vitest";
import { calculateDynamicFeeRate } from "../src/fee-estimator.js";

/*
 * MAINNET TOTAL LOCKDOWN · RC2 oracle O6. A node used as testnet-10 that answers mainnet to its identity question is
 * refused by the transport (MAINNET_CONNECTION_DISABLED). The fee estimator caught every failure of getFeeEstimate as
 * "no estimate" and returned the relay minimum (evidence "heuristic", source "network-minimum", ok), so `sdk.fees.estimate`
 * answered a fee for a mainnet node. A mainnet refusal is now the answer: it is rethrown, typed. Any other failure keeps
 * the documented fallback (the floor).
 */

const refusing = (code: string) => {
  const calls = { info: 0 };
  return {
    calls,
    rpc: {
      getFeeEstimate: async () => {
        throw Object.assign(new Error(`${code}: the node at ws://127.0.0.1:1 says it serves mainnet`), { code });
      },
      getInfo: async () => {
        calls.info += 1;
        return { mempoolSize: 1 };
      }
    } as any
  };
};

describe("O6 · a mainnet refusal from the node is the fee estimate's answer", () => {
  for (const code of ["MAINNET_CONNECTION_DISABLED", "MAINNET_BROADCAST_DISABLED", "MAINNET_SIGNING_DISABLED"]) {
    it(`${code} is rethrown with its code (never the relay minimum), and nothing else is asked`, async () => {
      const { rpc, calls } = refusing(code);
      await expect(calculateDynamicFeeRate(rpc, "normal")).rejects.toMatchObject({ code });
      expect(calls.info).toBe(0);
    });
  }

  it("control: any other failure keeps the fallback — the floor, evidence heuristic", async () => {
    const { rpc } = refusing("RPC_TIMEOUT");
    const r = await calculateDynamicFeeRate(rpc, "normal");
    expect(r).toMatchObject({ evidence: "heuristic", source: "network-minimum" });
  });
});
