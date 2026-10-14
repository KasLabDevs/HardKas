import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// EVENT-LEDGER-2 · reviewer final closeout, on the CLI side of `tx send` (the plan → sign → send flow behind
// `tx send --from`, `tx batch`, `dev tx send` and `dev tx generate`):
//  A1 · the flow keeps the typed EVENT_LEDGER_APPEND_FAILED, the identifiers and the partial result: a ledger failure
//       after the send step ran is reported on that step with its code, the effect (what was broadcast or executed)
//       and the send result — never as a generic step error that reads as "nothing was sent"; one before it says
//       nothing was sent;
//  D2 · a submission whose outcome is unknown (the submit call failed without an answer) is not recorded as a failed
//       receipt, and `why` never narrates it as the node's rejection; an accepted one is narrated as the acceptance of
//       the submission request, not as acceptance in the DAG.
// The plan, sign and send runners are doubles (as in tx-flow-outcome.test.ts); the flow is real. The ledger is made to
// fail at one event by a persistence sink that throws the ledger's own EventLedgerAppendError, as the attached ledger does.

vi.mock("../src/runners/tx-plan-runner.js", () => ({ runTxPlan: vi.fn() }));
vi.mock("../src/runners/tx-sign-runner.js", () => ({ runTxSign: vi.fn() }));
vi.mock("../src/runners/tx-send-runner.js", () => ({ runTxSend: vi.fn() }));
vi.mock("@hardkas/sdk", () => ({
  Hardkas: {
    open: async () => {
      throw new Error("no SDK in this test");
    }
  }
}));

import { coreEvents, EventLedgerAppendError } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION, HARDKAS_VERSION } from "@hardkas/artifacts";
import { runTxFlow } from "../src/runners/tx-flow.js";
import { runTxPlan } from "../src/runners/tx-plan-runner.js";
import { runTxSign } from "../src/runners/tx-sign-runner.js";
import { runTxSend } from "../src/runners/tx-send-runner.js";
import { describeWhyNode } from "../src/runners/why-narrative.js";

const TX = "c".repeat(64);
const plan = { mode: "rpc", networkId: "simnet", planId: "plan-0123456789abcdef", amountSompi: "100000000", contentHash: "a".repeat(64) };
const signed = { signedId: "signed-0123456789abcdef", networkId: "simnet", contentHash: "b".repeat(64), txId: TX };
const submission = (submitResult: Record<string, unknown>) => ({
  schema: "hardkas.txSubmission.v1",
  networkId: "simnet",
  txId: TX,
  contentHash: "d".repeat(64),
  submitResult
});

describe("EVENT-LEDGER-2 final closeout · the tx send flow keeps the typed failure, the effect and the partial result", () => {
  let ws: string;
  let detach: (() => void) | undefined;
  let passed: any[];
  const flow = () =>
    runTxFlow({ from: "alice", to: "bob", amount: "1", network: "simnet", config: {} as any, send: true, yes: true, workspaceRoot: ws });
  const ledgerFailingOn = (fails: (e: any) => boolean) => {
    detach = coreEvents.persistWith((event: any) => {
      if (fails(event)) throw new EventLedgerAppendError(path.join(ws, "events.jsonl"), event, new Error("no space left on the ledger's disk (test double)."));
      passed.push(event);
    });
  };

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-el2-flow-"));
    passed = [];
    vi.mocked(runTxPlan).mockResolvedValue(plan as any);
    vi.mocked(runTxSign).mockResolvedValue(signed as any);
  });

  afterEach(() => {
    detach?.();
    detach = undefined;
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("the ledger fails on workflow.started: the failure is typed and says nothing was sent", async () => {
    vi.mocked(runTxSend).mockResolvedValue({ accepted: true, txId: TX } as any);
    ledgerFailingOn((e) => e.kind === "workflow.started");
    const err: any = await flow().then(() => undefined, (e) => e);
    expect(err?.code).toBe("EVENT_LEDGER_APPEND_FAILED");
    expect(err.metadata?.effect).toMatchObject({ operation: "broadcast", outcome: "not-performed" });
    expect(err.message).toMatch(/^Nothing was sent/);
    expect(vi.mocked(runTxSend)).not.toHaveBeenCalled();
  });

  it("the ledger fails on the plan's announcement: the plan step keeps the typed code and says nothing was sent", async () => {
    vi.mocked(runTxSend).mockResolvedValue({ accepted: true, txId: TX } as any);
    ledgerFailingOn((e) => e.kind === "artifact.written" && e.sourceSubsystem === "cli:tx-flow");
    const result: any = await flow();
    expect(result.ok).toBe(false);
    expect(result.steps.plan).toMatchObject({ status: "error", code: "EVENT_LEDGER_APPEND_FAILED", effect: { operation: "broadcast", outcome: "not-performed" } });
    expect(result.steps.plan.error).toMatch(/^Nothing was sent/);
    expect(result.steps.send.status).not.toBe("ok");
    expect(vi.mocked(runTxSend)).not.toHaveBeenCalled();
  });

  it("an accepted broadcast, then the ledger fails on workflow.receipt: the send step keeps the code, the effect and the send result", async () => {
    const sendResult = { accepted: true, txId: TX, rpcUrl: "http://127.0.0.1:16110", networkName: "simnet", receipt: submission({ accepted: true, transactionId: TX }) };
    vi.mocked(runTxSend).mockResolvedValue(sendResult as any);
    ledgerFailingOn((e) => e.kind === "workflow.receipt");
    const result: any = await flow();
    expect(result.ok).toBe(false);
    expect(result.result, "it was broadcast").toBe("broadcast");
    expect(result.steps.send).toMatchObject({
      status: "error",
      code: "EVENT_LEDGER_APPEND_FAILED",
      effect: { operation: "broadcast", outcome: "accepted", txId: TX, artifactId: "d".repeat(64) },
      artifact: { accepted: true, txId: TX }
    });
    expect(result.steps.send.error).toMatch(/it WAS sent/);
    expect(fs.existsSync(result.steps.send.effect.artifactPath), "the receipt copy the flow wrote").toBe(true);
  });

  it("a ledger failure raised inside the send step without a named effect keeps its code and is never labelled 'nothing was sent'", async () => {
    // what the flow cannot know (the failure came from inside the send runner, which named no effect) it never claims
    vi.mocked(runTxSend).mockImplementation(async () => {
      const lost: any = { kind: "workflow.submitted", eventId: "e-inside-send", workflowId: "wf", txId: TX, payload: {} };
      throw new EventLedgerAppendError(path.join(ws, "events.jsonl"), lost, new Error("no space left on the ledger's disk (test double)."));
    });
    ledgerFailingOn(() => false);
    const result: any = await flow();
    expect(result.ok).toBe(false);
    expect(result.steps.send).toMatchObject({ status: "error", code: "EVENT_LEDGER_APPEND_FAILED" });
    expect(result.steps.send.effect?.outcome, "not claimed as not performed").not.toBe("not-performed");
    expect(result.steps.send.error).not.toMatch(/^Nothing was sent/);
    expect(result.steps.send.error).toMatch(/may already have been executed or submitted/);
  });

  it("a submission whose outcome is unknown is not announced as a failed receipt (no status is known)", async () => {
    const receipt = submission({ accepted: false, error: "RPC request submitTransaction timed out after 5000ms" });
    vi.mocked(runTxSend).mockResolvedValue({ accepted: false, txId: TX, rpcUrl: "http://127.0.0.1:16110", networkName: "simnet", receipt } as any);
    ledgerFailingOn(() => false);
    const result: any = await flow();
    expect(result.ok, "not accepted ⇒ the flow fails").toBe(false);
    expect(result.steps.send.status).toBe("ok");
    expect(passed.filter((e) => e.kind === "workflow.receipt")).toEqual([]);
  });
});

describe("EVENT-LEDGER-2 final closeout · `why` narrates what a submission establishes", () => {
  const seal = (body: Record<string, unknown>) => {
    const a: any = { ...body, hashVersion: CURRENT_HASH_VERSION };
    a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
    a.lineage.artifactId = a.contentHash;
    return a;
  };
  const sub = (submitResult: Record<string, unknown>) =>
    seal({
      schema: "hardkas.txSubmission.v1",
      hardkasVersion: HARDKAS_VERSION,
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "localnet",
      createdAt: "2026-10-09T00:00:00.000Z",
      signedArtifactId: "a".repeat(64),
      txId: TX,
      submitResult,
      lineage: { artifactId: "", parentArtifactId: "a".repeat(64), lineageId: "9".repeat(64), rootArtifactId: "9".repeat(64), sequence: 3 }
    });

  it("a submit call that failed without an answer: an unknown outcome, never the node's rejection", () => {
    const text = describeWhyNode(sub({ accepted: false, error: "RPC request submitTransaction timed out after 5000ms" }))!;
    expect(text).toMatch(/unknown/i);
    expect(text).toContain("timed out");
    expect(text).not.toMatch(/rejected|not accepted/i);
  });

  it("an accepted submission: the node accepted the submission request, which is not acceptance in the DAG", () => {
    const text = describeWhyNode(sub({ accepted: true, transactionId: TX }))!;
    expect(text).toMatch(/submission request/);
    expect(text).toMatch(/not acceptance .*in the DAG/);
  });
});
