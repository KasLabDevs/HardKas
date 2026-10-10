import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";
import { attachLedgerAppender, eventLedgerPath } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION, deriveTxStatus } from "@hardkas/artifacts";

vi.setConfig({ testTimeout: 120_000 });

// EVENT-LEDGER-2 · reviewer closeout, point 2 (submission semantics). `workflow.submitted` says a submission took place:
// it is recorded only once the submit call answered and the node accepted the transaction, naming the submission
// artifact that records the answer. A broadcast the node refused (its own rejection, thrown by the submit call, or an
// answer with accepted:false) is never recorded as submitted; its outcome is recorded as such (`workflow.failed`,
// naming the same submission artifact).
// Final closeout (decision 2): a submit call that failed WITHOUT an answer from the node (a timeout, a lost connection)
// is not a rejection either — whether the node received the transaction is unknown. It is recorded as what it is, an
// RPC error (`rpc.error`, an existing kind), never as `workflow.failed`; the workflow step fails with
// TX_SUBMISSION_OUTCOME_UNKNOWN, not TX_SUBMISSION_REJECTED; and the derived status is INSUFFICIENT_EVIDENCE (an existing
// state), not REJECTED_BY_NODE. No consensus state is invented.
//
// How the real-broadcast branch is reached hermetically (as wave1-3-b2-workflow-rejected-send does): a simulated
// workspace plans and signs; the signed artifact is re-issued as a non-synthetic, re-sealed v5 artifact; the instance
// reports a non-simulated network; `rpc.submitTransaction` is the only stub.

const LOOPBACK = "http://127.0.0.1:16110";

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

const ledger = (ws: string): any[] => {
  const file = eventLedgerPath(ws);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
};

describe("EVENT-LEDGER-2 closeout · CL-2 workflow.submitted is recorded only after an accepted submission", () => {
  let ws: string;
  let detach: (() => void) | undefined;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-el2-sub-"));
  });

  afterEach(() => {
    detach?.();
    detach = undefined;
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  /** Plans and signs in the simulator, then sends the re-issued artifact through the REAL send() with `submit`. */
  async function sendWith(submit: () => Promise<any>, seen: { atSubmit?: string[] } = {}) {
    const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" } as any);
    const signed = asBroadcastable(await sdk.tx.sign(plan as any, "alice"));
    Object.defineProperty(sdk, "network", { get: () => "simnet", configurable: true });
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation((async () => {
      seen.atSubmit = ledger(ws).map((e) => e.kind);
      return submit();
    }) as any);
    detach = attachLedgerAppender(ws);
    const result: any = await sdk.tx.send(signed, LOOPBACK);
    return { result, signed };
  }

  it("a broadcast whose submit call throws the node's own rejection is never recorded as submitted; its failure is, naming the submission", async () => {
    const { result } = await sendWith(() => Promise.reject(new Error("Rejected transaction: orphan")));
    const events = ledger(ws);
    const submission = result.submission;
    expect(submission.submitResult.accepted).toBe(false);
    expect(events.filter((e) => e.kind === "workflow.submitted")).toEqual([]);
    const failed = events.filter((e) => e.kind === "workflow.failed");
    expect(failed.map((e) => ({ artifactId: e.artifactId, txId: e.txId, mentions: String(e.payload?.error).includes("orphan") }))).toEqual([
      { artifactId: submission.contentHash, txId: submission.txId, mentions: true }
    ]);
    expect(events.some((e) => e.kind === "artifact.written" && e.artifactId === submission.contentHash)).toBe(true);
  });

  it("a broadcast the node answers with accepted:false is never recorded as submitted; its failure is", async () => {
    const { result } = await sendWith(() => Promise.resolve({ accepted: false }));
    const events = ledger(ws);
    expect(result.submission.submitResult.accepted).toBe(false);
    expect(events.filter((e) => e.kind === "workflow.submitted")).toEqual([]);
    expect(events.filter((e) => e.kind === "workflow.failed").map((e) => e.artifactId)).toEqual([result.submission.contentHash]);
  });

  it("an accepted broadcast: workflow.submitted appears only after the submit call answered, naming the submission artifact", async () => {
    const seen: { atSubmit?: string[] } = {};
    const { result, signed } = await sendWith(() => Promise.resolve({ transactionId: "b".repeat(64) }), seen);
    const events = ledger(ws);
    const submitted = events.filter((e) => e.kind === "workflow.submitted");
    expect({
      beforeTheSubmitCall: (seen.atSubmit ?? []).filter((k) => k === "workflow.submitted").length,
      afterIt: submitted.map((e) => ({ artifactId: e.artifactId, txId: e.payload?.txId, workflowId: e.workflowId }))
    }).toEqual({
      beforeTheSubmitCall: 0,
      afterIt: [{ artifactId: result.submission.contentHash, txId: result.submission.txId, workflowId: signed.workflowId ?? "wf_unknown_standalone" }]
    });
    expect(events.filter((e) => e.kind === "workflow.failed")).toEqual([]);
  });

  for (const [what, transport] of [
    ["a timeout", "RPC request submitTransaction timed out after 5000ms"],
    ["a lost connection", "Connection to Kaspa RPC at ws://127.0.0.1:16110 was lost: socket closed"]
  ] as const) {
    it(`a submit call that failed without an answer (${what}) is recorded as an RPC error with an unknown outcome — never as a rejection`, async () => {
      const { result } = await sendWith(() => Promise.reject(new Error(transport)));
      const events = ledger(ws);
      const submission = result.submission;
      expect(submission.submitResult, "the call's result is recorded as it returned").toMatchObject({ accepted: false, error: transport });
      expect(events.filter((e) => e.kind === "workflow.submitted" || e.kind === "workflow.failed"), "neither submitted nor rejected").toEqual([]);
      const rpcErrors = events.filter((e) => e.kind === "rpc.error");
      expect(rpcErrors.map((e) => ({ artifactId: e.artifactId, txId: e.txId, retriable: e.payload?.retriable }))).toEqual([
        { artifactId: submission.contentHash, txId: submission.txId, retriable: false }
      ]);
      expect(String(rpcErrors[0].payload.error)).toMatch(/outcome of the submission is unknown/);
      const status = deriveTxStatus({ txId: submission.txId, submission, observations: [] });
      expect(status.status, "an unknown outcome decides nothing: not REJECTED_BY_NODE").toBe("INSUFFICIENT_EVIDENCE");
      expect(status.reasons.join(" ")).toMatch(/unknown/);
    });
  }

  it("a workflow's tx.send step whose submit call failed without an answer fails with TX_SUBMISSION_OUTCOME_UNKNOWN, not TX_SUBMISSION_REJECTED", async () => {
    const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    Object.defineProperty(sdk, "network", { get: () => "simnet", configurable: true });
    const realSend = sdk.tx.send.bind(sdk.tx);
    vi.spyOn(sdk.tx, "send").mockImplementation((signed: any) => realSend(asBroadcastable(signed), LOOPBACK));
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation((() => Promise.reject(new Error("RPC request submitTransaction timed out after 5000ms"))) as any);
    const run: any = await sdk.workflow.run({ steps: [{ type: "tx.plan", from: "alice", to: "bob", amount: 10 } as any, { type: "tx.send" } as any] });
    const sent: any = await vi.mocked(sdk.tx.send).mock.results[0]!.value;
    expect(run.status).toBe("failed");
    expect(run.errorEnvelope?.code).toBe("TX_SUBMISSION_OUTCOME_UNKNOWN");
    expect(run.errorEnvelope?.message).toContain(sent.submission.contentHash);
    expect(run.errorEnvelope?.message).toMatch(/unknown/);
    expect(run.errorEnvelope?.message).not.toMatch(/did not accept|rejected/i);
  });
});
