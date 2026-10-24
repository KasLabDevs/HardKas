import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// P0-TX-SAFETY-1A — the dev server's POST /api/tx/send never turns an unknown outcome into another transaction.
// Adversarial: accepted then the answer is lost, a submit timeout, a lost connection after the submit, two consecutive
// identical requests, two concurrent ones. The node double counts broadcasts and mints a NEW txId for every newly
// planned transaction, which is what the auto-sign path does.

const node = vi.hoisted(() => ({
  cwd: "",
  network: "testnet-10" as string,
  plans: 0,
  signs: 0,
  broadcasts: [] as string[],
  mode: "accepted" as "accepted" | "unknown-timeout" | "throws-after-submit" | "rejected" | "not-sent" | "hang",
  release: undefined as undefined | (() => void)
}));

vi.mock("@hardkas/sdk", () => {
  const txIdOf = (n: number) => n.toString(16).padStart(64, "0");
  return {
    Hardkas: {
      create: vi.fn(async () => ({
        get cwd() {
          return node.cwd;
        },
        get network() {
          return node.network;
        },
        tx: {
          plan: vi.fn(async () => ({ id: `plan-${++node.plans}` })),
          sign: vi.fn(async (plan: any) => ({ signedId: `signed-${++node.signs}`, txId: txIdOf(node.signs), plan: plan.id })),
          simulate: vi.fn(async (signed: any) => ({ receipt: { txId: signed.txId, mode: "simulator" } })),
          send: vi.fn(async (signed: any) => {
            if (node.mode === "not-sent") {
              throw Object.assign(new Error("Transaction was not sent: the request never left this process"), { code: "SUBMIT_NOT_SENT" });
            }
            node.broadcasts.push(signed.txId);
            if (node.mode === "hang") await new Promise<void>((r) => (node.release = r));
            if (node.mode === "throws-after-submit") throw new Error("event ledger append failed after the broadcast");
            const submitResult =
              node.mode === "accepted"
                ? { accepted: true, transactionId: signed.txId }
                : node.mode === "rejected"
                  ? { accepted: false, error: `Rejected transaction ${signed.txId}: transaction ${signed.txId} is not standard: x` }
                  : { accepted: false, error: "RPC request submitTransaction timed out after 5000ms" };
            const receipt = { schema: "hardkas.txSubmission.v1", txId: signed.txId, submitResult };
            return { receipt, submission: receipt, txId: signed.txId, submitted: submitResult.accepted };
          })
        }
      }))
    }
  };
});

const { dappTxRoutes } = await import("../src/routes/dapp-tx.js");
const guard: any = await import("../src/routes/send-guard.js").catch(() => ({}));

const app = new Hono();
app.route("/api/tx", dappTxRoutes);

async function send(body: Record<string, unknown>) {
  const res = await app.request(
    new Request("http://localhost/api/tx/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  return (await res.json()) as any;
}

const PAY = { from: "alice", to: "bob", amountSompi: "1000", allowDevAutoSign: true };

beforeEach(() => {
  // each case is its own workspace: the guard keeps its record there
  node.cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-dapp-send-"));
  node.network = "testnet-10";
  node.plans = 0;
  node.signs = 0;
  node.broadcasts = [];
  node.mode = "accepted";
  guard.__resetSendGuardForTests?.();
});

describe("P0-TX-SAFETY-1A · dev-server send: an unknown outcome never authorizes another transaction", () => {
  it("submit timeout (outcome unknown), then the same payment again → refused, ONE broadcast, ONE txId", async () => {
    node.mode = "unknown-timeout";
    const first = await send(PAY);
    expect(first.data?.outcome).toBe("unknown");
    expect(first.data?.warnings?.[0]).toMatch(/Do not pay again/);
    node.mode = "accepted";
    const second = await send(PAY);
    expect(second.ok).toBe(false);
    expect(second.error?.code).toBe("PRIOR_SEND_OUTCOME_UNKNOWN");
    expect(second.error?.txId).toBe(first.data.receipt.txId);
    expect(node.plans).toBe(1);
    expect(node.broadcasts).toHaveLength(1);
  });

  it("a failure after the broadcast started (lost answer) → TX_SEND_OUTCOME_UNKNOWN, and the payment is not re-planned", async () => {
    node.mode = "throws-after-submit";
    const first = await send(PAY);
    expect(first.error?.code).toBe("TX_SEND_OUTCOME_UNKNOWN");
    expect(first.error?.txId).toMatch(/^[0-9a-f]{64}$/);
    node.mode = "accepted";
    const second = await send(PAY);
    expect(second.error?.code).toBe("PRIOR_SEND_OUTCOME_UNKNOWN");
    expect(node.broadcasts).toHaveLength(1);
  });

  it("accepted, the client lost the answer and repeats with the SAME idempotencyKey → the recorded answer, no new tx", async () => {
    const first = await send({ ...PAY, idempotencyKey: "pay-1" });
    const again = await send({ ...PAY, idempotencyKey: "pay-1" });
    expect(again).toEqual(first);
    expect(node.plans).toBe(1);
    expect(node.broadcasts).toEqual([first.data.receipt.txId]);
  });

  it("unknown outcome, repeated with the same idempotencyKey (reconnection) → the same recorded unknown answer", async () => {
    node.mode = "unknown-timeout";
    const first = await send({ ...PAY, idempotencyKey: "pay-2" });
    node.mode = "accepted";
    const again = await send({ ...PAY, idempotencyKey: "pay-2" });
    expect(again).toEqual(first);
    expect(node.broadcasts).toHaveLength(1);
  });

  it("the same idempotencyKey with another payment → IDEMPOTENCY_KEY_REUSED, nothing planned", async () => {
    await send({ ...PAY, idempotencyKey: "pay-3" });
    const other = await send({ ...PAY, amountSompi: "2000", idempotencyKey: "pay-3" });
    expect(other.error?.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(node.plans).toBe(1);
  });

  it("two concurrent identical requests → the second is refused while the first runs; ONE broadcast", async () => {
    node.mode = "hang";
    const firstP = send(PAY);
    await vi.waitFor(() => expect(node.broadcasts).toHaveLength(1));
    const second = await send(PAY);
    expect(second.error?.code).toBe("TX_SEND_IN_PROGRESS");
    node.release?.();
    const first = await firstP;
    expect(first.ok).toBe(true);
    expect(node.broadcasts).toHaveLength(1);
  });

  it("a new payment after an unknown one only with explicit allowNewPaymentAfterUnknown: true", async () => {
    node.mode = "unknown-timeout";
    await send(PAY);
    node.mode = "accepted";
    const explicit = await send({ ...PAY, allowNewPaymentAfterUnknown: true });
    expect(explicit.ok).toBe(true);
    expect(explicit.data.outcome).toBe("accepted");
    expect(node.broadcasts).toHaveLength(2);
  });

  it("refused before anything was sent (SUBMIT_NOT_SENT) → no unknown record; the payment can be sent again", async () => {
    node.mode = "not-sent";
    const first = await send(PAY);
    expect(first.error?.code).toBe("SUBMIT_NOT_SENT");
    node.mode = "accepted";
    const second = await send(PAY);
    expect(second.ok).toBe(true);
    expect(node.broadcasts).toHaveLength(1);
  });

  it("a node rejection is reported as rejected and does not block a corrected payment", async () => {
    node.mode = "rejected";
    const first = await send(PAY);
    expect(first.data?.outcome).toBe("rejected");
    node.mode = "accepted";
    const second = await send(PAY);
    expect(second.ok).toBe(true);
  });

  it("two consecutive accepted payments without a key stay two explicit payments (normal behaviour kept)", async () => {
    const a = await send(PAY);
    const b = await send(PAY);
    expect(a.data.outcome).toBe("accepted");
    expect(b.data.outcome).toBe("accepted");
    expect(node.broadcasts).toHaveLength(2);
  });

  it("simulated network: executed, no broadcast", async () => {
    node.network = "simulated";
    const r = await send(PAY);
    expect(r.ok).toBe(true);
    expect(r.data.outcome).toBe("executed");
    expect(node.broadcasts).toHaveLength(0);
  });
});
