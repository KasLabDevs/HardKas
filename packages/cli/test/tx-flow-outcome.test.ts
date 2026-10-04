import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// PAPERCUTS-1, the shared plan → sign → send flow behind `tx send --from`, `tx batch`, `dev tx send` and
// `dev tx generate`:
// - F3: a submission the node REJECTED (sendResult.accepted === false) left the flow's `ok` true, so the batch
//   commands counted it as a success. Decided: a rejected submission is a failure. The send step itself still ran
//   (status "ok"): `tx send` reports it as "rejected" (AUX-11) from the send artifact, which stays as it was.
// - A leftover debug line printed every flow failure, with its stack, to stderr (`[runTxFlow catch]`) around the CLI's
//   own output and secret masking. The error is reported in the step result only.
// The plan, sign and send runners are doubles; the flow is real.

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

import { runTxFlow } from "../src/runners/tx-flow.js";
import { runTxPlan } from "../src/runners/tx-plan-runner.js";
import { runTxSign } from "../src/runners/tx-sign-runner.js";
import { runTxSend } from "../src/runners/tx-send-runner.js";

const plan = { mode: "rpc", networkId: "simnet", planId: "plan-0123456789abcdef", amountSompi: "100000000", contentHash: "a".repeat(64) };
const signed = { signedId: "signed-0123456789abcdef", networkId: "simnet", contentHash: "b".repeat(64) };

describe("tx flow · outcome of a broadcast", () => {
  let ws: string;
  const flow = () =>
    runTxFlow({ from: "alice", to: "bob", amount: "1", network: "simnet", config: {} as any, send: true, yes: true, workspaceRoot: ws });

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tx-flow-"));
    vi.mocked(runTxPlan).mockResolvedValue(plan as any);
    vi.mocked(runTxSign).mockResolvedValue(signed as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("a submission the node rejected makes the flow fail; the send step ran and keeps its artifact", async () => {
    vi.mocked(runTxSend).mockResolvedValue({ accepted: false, txId: "c".repeat(64) } as any);
    const result = await flow();
    expect(result.ok, "rejected ⇒ failure").toBe(false);
    expect(result.steps.send.status).toBe("ok");
    expect(result.steps.send.artifact?.accepted).toBe(false);
  });

  it("an accepted submission keeps the flow ok (control)", async () => {
    vi.mocked(runTxSend).mockResolvedValue({ accepted: true, txId: "c".repeat(64) } as any);
    const result = await flow();
    expect(result.ok).toBe(true);
    expect(result.result).toBe("broadcast");
  });

  it("a failing step is reported in the result only, with no debug dump on stderr", async () => {
    vi.mocked(runTxPlan).mockRejectedValue(new Error("PLAN_FAILED_FOR_TEST: no inputs"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await flow();
    expect(result.ok).toBe(false);
    expect(result.steps.plan).toMatchObject({ status: "error", error: "PLAN_FAILED_FOR_TEST: no inputs" });
    expect(errors.mock.calls.filter((c) => String(c[0]).includes("[runTxFlow catch]")), "no debug line").toEqual([]);
  });
});
