import { describe, it, expect } from "vitest";
import * as rpc from "@hardkas/kaspa-rpc";
import { submitOutcomeOf } from "@hardkas/artifacts";

// RPC-SUBMIT-SAFETY-1 · the transport's "outcome unknown" reaches the SDK's classification as UNKNOWN: a submission
// recorded with it is neither rejected (an invitation to pay again) nor not-sent.
describe("RPC-SUBMIT-SAFETY-1 · the SDK reads the transport's unknown outcome as unknown", () => {
  it("RpcSubmitOutcomeUnknownError exists, is typed, keeps the txId, and is never retriable or not-sent", () => {
    const E = (rpc as any).RpcSubmitOutcomeUnknownError;
    expect(typeof E).toBe("function");
    const e = new E({ txId: "ab".repeat(32), cause: new rpc.RpcTimeoutError("RPC request submitTransaction timed out after 5000ms") });
    expect(e.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
    expect(e.txId).toBe("ab".repeat(32));
    expect(e.isRetriable).toBe(false);
    expect(rpc.isRpcRequestNotSentError(e)).toBe(false);
    // what sdk.tx.send records for it (submitResult.error = the message)
    expect(submitOutcomeOf({ accepted: false, error: e.message })).toBe("unknown");
  });

  it("the TQ guard treats it as ambiguous (probe, never SAFE_TO_RETRY) and submits once", async () => {
    const E = (rpc as any).RpcSubmitOutcomeUnknownError;
    expect(typeof E).toBe("function");
    const { submitWithAmbiguityGuard } = await import("@hardkas/testnet-qualification/src/submission-guard.js" as any).catch(
      () => import("../../testnet-qualification/src/submission-guard.js" as any)
    );
    let submits = 0;
    const guardRpc: any = {
      async submitTransaction() { submits++; throw new E({ txId: "ab".repeat(32), cause: new Error("WebSocket is not connected") }); },
      async getMempoolEntry() { return null; },
      async getUtxosByAddress() { return []; }
    };
    let n = 0;
    const out = await submitWithAmbiguityGuard(
      { rpc: guardRpc, signedTx: {}, txid: "ab".repeat(32), watchAddresses: [] },
      { sleep: async () => {}, probeWaitBeforeMs: 0, probeMaxWaitMs: 5, probePollIntervalMs: 1, now: () => new Date(Date.parse("2026-10-19T00:00:00Z") + n++ * 10) }
    );
    expect(out.state).toBe("UNRESOLVED");
    expect(submits).toBe(1);
  });
});
