import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../../src/index.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";

// WAVE_1_3_SECURITY_REVIEW · B2 (rejected broadcast recorded as workflow success)
//
// Since Wave 1.3 a real `send()` RECORDS a rejected submit (txSubmission.v1 with
// submitResult.accepted = false) and returns `submitted: false` instead of throwing.
// A workflow must never record that step as `success`: TX_SUBMISSION_REJECTED, the
// send step `failed`, the workflow `failed`, through the normal errorEnvelope.
//
// How the test reaches the real-broadcast branch hermetically: the workspace is a
// simulated one (plan and sign are synthetic), the instance reports a non-simulated
// network so the workflow takes its `send` branch, and `tx.send` is forwarded to
// the REAL implementation with an explicit loopback URL. The rejection comes from
// the mocked `rpc.submitTransaction` inside the real `send()`; nothing else is stubbed.

const LOOPBACK = "http://127.0.0.1:16110";

/**
 * Wave 1.4 · IC-6′.4: a synthetic authorization is never broadcast (SYNTHETIC_NOT_BROADCASTABLE),
 * so the real-broadcast branch is exercised with the same artifact re-issued as a non-synthetic
 * signed (hex payload), re-sealed under v5. Nothing else about the lifecycle changes.
 */
function asBroadcastable(signed: any): any {
  const s: any = structuredClone(signed);
  delete s.authorization;
  s.signedTransaction = { format: "hex", payload: "deadbeef" };
  s.txId = "f".repeat(64);
  delete s.contentHash;
  s.lineage = { ...s.lineage, artifactId: "" };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
}

async function realBroadcastSdk(ws: string, submit: () => Promise<any>): Promise<Hardkas> {
  const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  Object.defineProperty(sdk, "network", { get: () => "simnet", configurable: true });
  const realSend = sdk.tx.send.bind(sdk.tx);
  vi.spyOn(sdk.tx, "send").mockImplementation((signed: any) => realSend(asBroadcastable(signed), LOOPBACK));
  vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation(submit as any);
  return sdk;
}

const rejected = () => Promise.reject(new Error("Rejected transaction: orphan"));
const accepted = () => Promise.resolve({ transactionId: "b".repeat(64) });

describe("B2 · a rejected broadcast is never a successful workflow step", () => {
  let ws: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b2-wf-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("declarative tx.send: submitTransaction rejected → submitted:false → send step failed → workflow failed", async () => {
    const sdk = await realBroadcastSdk(ws, rejected);
    const sendSpy = vi.mocked(sdk.tx.send);

    const run: any = await sdk.workflow.run({
      steps: [
        { type: "tx.plan", from: "alice", to: "bob", amount: 10 },
        { type: "tx.send" }
      ]
    });

    // The real send ran and reported the rejection.
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sendResult: any = await sendSpy.mock.results[0]!.value;
    expect(sendResult.submitted).toBe(false);
    expect(sendResult.submission.submitResult.accepted).toBe(false);

    expect(run.status).toBe("failed");
    const sendStep = run.steps.find((s: any) => s.type === "tx.send");
    expect(sendStep.status).toBe("failed");
    expect(run.steps.some((s: any) => s.type === "tx.send" && s.status === "success")).toBe(false);
    expect(run.errorEnvelope?.code).toBe("TX_SUBMISSION_REJECTED");
    expect(run.errorEnvelope?.message).toContain(sendResult.submission.contentHash);
  });

  it("script ctx.tx.send: submitTransaction rejected → submitted:false → script step failed → workflow failed", async () => {
    const sdk = await realBroadcastSdk(ws, rejected);
    const sendSpy = vi.mocked(sdk.tx.send);

    const run: any = await sdk.workflow.run({
      steps: [
        {
          type: "script",
          script: `
            const plan = await ctx.tx.plan({ from: "alice", to: "bob", amount: "10" });
            const signed = await ctx.tx.sign(plan, "alice");
            return await ctx.tx.send(signed);
          `
        }
      ]
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sendResult: any = await sendSpy.mock.results[0]!.value;
    expect(sendResult.submitted).toBe(false);

    expect(run.status).toBe("failed");
    expect(run.steps).toHaveLength(1);
    expect(run.steps[0].status).toBe("failed");
    expect(run.errorEnvelope?.code).toBe("TX_SUBMISSION_REJECTED");
  });

  it("control: an accepted submit keeps the send step `success` on both paths (the guard is not a blanket failure)", async () => {
    const sdk = await realBroadcastSdk(ws, accepted);
    const declarative: any = await sdk.workflow.run({
      steps: [
        { type: "tx.plan", from: "alice", to: "bob", amount: 10 },
        { type: "tx.send" }
      ]
    });
    expect(declarative.status, JSON.stringify(declarative.errorEnvelope)).toBe("completed");
    expect(declarative.steps.find((s: any) => s.type === "tx.send").status).toBe("success");

    const ws2 = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b2-wf2-"));
    try {
      const sdk2 = await realBroadcastSdk(ws2, accepted);
      const scripted: any = await sdk2.workflow.run({
        steps: [
          {
            type: "script",
            script: `
              const plan = await ctx.tx.plan({ from: "alice", to: "bob", amount: "10" });
              const signed = await ctx.tx.sign(plan, "alice");
              return await ctx.tx.send(signed);
            `
          }
        ]
      });
      expect(scripted.status, JSON.stringify(scripted.errorEnvelope)).toBe("completed");
      expect(scripted.steps[0].status).toBe("success");
    } finally {
      fs.rmSync(ws2, { recursive: true, force: true });
    }
  });
});
