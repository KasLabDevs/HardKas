import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// P0-TX-SAFETY-1A hardening (owner review 2026-10-18). Each case is a way the first version of the guard could still
// produce a second transaction for the same payment: an unknown outcome forgotten when another payment succeeds, an
// evicted idempotency key, a dev-server restart, a key or request field silently ignored. Plus the end-to-end
// "one call, four txIds" reproduction kept as a CI test.

const node = vi.hoisted(() => ({
  cwd: "",
  network: "testnet-10" as string,
  plans: 0,
  broadcasts: [] as string[],
  mode: "accepted" as "accepted" | "unknown-timeout" | "crash-during-send"
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
          sign: vi.fn(async () => ({ txId: txIdOf(node.plans) })),
          simulate: vi.fn(async (s: any) => ({ receipt: { txId: s.txId, mode: "simulator" } })),
          send: vi.fn(async (s: any) => {
            node.broadcasts.push(s.txId);
            // the process "dies" after the broadcast: the request never completes
            if (node.mode === "crash-during-send") return new Promise(() => {});
            const submitResult =
              node.mode === "accepted"
                ? { accepted: true, transactionId: s.txId }
                : { accepted: false, error: "RPC request submitTransaction timed out after 5000ms" };
            const receipt = { txId: s.txId, submitResult };
            return { receipt, submission: receipt, txId: s.txId, submitted: submitResult.accepted };
          })
        }
      }))
    }
  };
});

const { dappTxRoutes } = await import("../src/routes/dapp-tx.js");
const guardModule: any = await import("../src/routes/send-guard.js");
const { createHardkasClient } = await import("../../sdk/src/client.js");

const app = new Hono();
app.route("/api/tx", dappTxRoutes);
const restart = () => guardModule.__resetSendGuardForTests?.(); // a new process: memory gone, disk kept

async function send(body: Record<string, unknown>) {
  const res = await app.request(
    new Request("http://localhost/api/tx/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  );
  return (await res.json()) as any;
}

const PAY = { from: "alice", to: "bob", amountSompi: "1000", allowDevAutoSign: true };
const tmpRoots: string[] = [];
const guardLog = () => path.join(node.cwd, ".hardkas", "dev-server", "send-guard.v1.jsonl");

beforeEach(() => {
  node.cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-send-guard-"));
  tmpRoots.push(node.cwd);
  node.network = "testnet-10";
  node.plans = 0;
  node.broadcasts = [];
  node.mode = "accepted";
  restart();
});
afterAll(() => {
  for (const r of tmpRoots) fs.rmSync(r, { recursive: true, force: true });
});

describe("P0-TX-SAFETY-1A hardening · an unknown outcome is never forgotten", () => {
  it("unknown A (txId 1) → explicit new payment accepted (txId 2) → an identical request is STILL refused (no txId 3)", async () => {
    node.mode = "unknown-timeout";
    const a = await send(PAY);
    expect(a.data.outcome).toBe("unknown");
    node.mode = "accepted";
    const b = await send({ ...PAY, allowNewPaymentAfterUnknown: true });
    expect(b.data.outcome).toBe("accepted");
    const c = await send(PAY);
    expect(c.error?.code).toBe("PRIOR_SEND_OUTCOME_UNKNOWN");
    expect(c.error?.txId).toBe(a.data.receipt.txId);
    expect(node.broadcasts).toHaveLength(2);
  });

  it("two unknown sends of the same payment are both named", async () => {
    node.mode = "unknown-timeout";
    await send(PAY);
    await send({ ...PAY, allowNewPaymentAfterUnknown: true });
    const r = await send(PAY);
    expect(r.error?.code).toBe("PRIOR_SEND_OUTCOME_UNKNOWN");
    expect(r.error?.message).toMatch(/^2 earlier send/);
  });
});

describe("P0-TX-SAFETY-1A hardening · an idempotency key is never forgotten", () => {
  it("after 1,000 more keyed sends, the first key still replays its answer: no second transaction", async () => {
    node.network = "simulated"; // cheap sends; the key store is the same for every network
    const first = await send({ ...PAY, idempotencyKey: "key-0" });
    for (let i = 1; i <= 1000; i++) await send({ ...PAY, amountSompi: String(1000 + i), idempotencyKey: `key-${i}` });
    const plansBefore = node.plans;
    const again = await send({ ...PAY, idempotencyKey: "key-0" });
    expect(again).toEqual(first);
    expect(node.plans).toBe(plansBefore);
  }, 120_000);
});

describe("P0-TX-SAFETY-1A hardening · a dev-server restart does not lift the protection", () => {
  it("unknown outcome, restart, the same payment → still refused", async () => {
    node.mode = "unknown-timeout";
    const a = await send(PAY);
    restart();
    node.mode = "accepted";
    const b = await send(PAY);
    expect(b.error?.code).toBe("PRIOR_SEND_OUTCOME_UNKNOWN");
    expect(b.error?.txId).toBe(a.data.receipt.txId);
    expect(node.broadcasts).toHaveLength(1);
  });

  it("accepted with a key, restart, the same key → the recorded answer, no new transaction", async () => {
    const a = await send({ ...PAY, idempotencyKey: "pay-r" });
    restart();
    const b = await send({ ...PAY, idempotencyKey: "pay-r" });
    expect(b).toEqual(a);
    expect(node.broadcasts).toHaveLength(1);
  });

  it("the process stops DURING the send (after the broadcast), restart → that payment is an unknown outcome with its txId", async () => {
    node.mode = "crash-during-send";
    void send({ ...PAY, idempotencyKey: "pay-crash" });
    await vi.waitFor(() => expect(node.broadcasts).toHaveLength(1));
    restart();
    node.mode = "accepted";
    const sameKey = await send({ ...PAY, idempotencyKey: "pay-crash" });
    expect(sameKey.error?.code).toBe("TX_SEND_IN_PROGRESS");
    const newKey = await send({ ...PAY, idempotencyKey: "pay-crash-2" });
    expect(newKey.error?.code).toBe("PRIOR_SEND_OUTCOME_UNKNOWN");
    expect(newKey.error?.txId).toBe(node.broadcasts[0]);
    expect(node.broadcasts).toHaveLength(1);
  });

  it("an edited log does not verify → every broadcasting send is refused (fail closed), nothing planned", async () => {
    node.mode = "unknown-timeout";
    await send(PAY);
    const lines = fs.readFileSync(guardLog(), "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    // erase the unknown outcome by rewriting it as accepted
    fs.writeFileSync(guardLog(), lines.map((l) => l.replace('"outcome":"unknown"', '"outcome":"accepted"')).join("\n") + "\n");
    restart();
    node.mode = "accepted";
    const plansBefore = node.plans;
    const r = await send(PAY);
    expect(r.error?.code).toBe("SEND_GUARD_UNAVAILABLE");
    const other = await send({ ...PAY, to: "carol" });
    expect(other.error?.code).toBe("SEND_GUARD_UNAVAILABLE");
    expect(node.plans).toBe(plansBefore);
  });

  it("a log truncated mid-line → fail closed", async () => {
    await send(PAY);
    const text = fs.readFileSync(guardLog(), "utf8");
    fs.writeFileSync(guardLog(), text.slice(0, text.length - 20));
    restart();
    const r = await send({ ...PAY, to: "dave" });
    expect(r.error?.code).toBe("SEND_GUARD_UNAVAILABLE");
  });

  it("a log that cannot be written → refused before planning (fail closed); the simulator still runs", async () => {
    fs.mkdirSync(path.join(node.cwd, ".hardkas"), { recursive: true });
    fs.writeFileSync(path.join(node.cwd, ".hardkas", "dev-server"), "a file where the log directory should be");
    restart();
    const r = await send(PAY);
    expect(r.error?.code).toBe("SEND_GUARD_UNAVAILABLE");
    expect(node.plans).toBe(0);
    node.network = "simulated";
    const sim = await send(PAY);
    expect(sim.ok).toBe(true);
  });
});

describe("P0-TX-SAFETY-1A hardening · keys and request fields are validated, never ignored", () => {
  it("a key over 200 characters is refused (not silently ignored)", async () => {
    const r = await send({ ...PAY, idempotencyKey: "k".repeat(201) });
    expect(r.error?.code).toBe("IDEMPOTENCY_KEY_INVALID");
    expect(node.plans).toBe(0);
  });

  it("a key that is not a string, or empty, is refused", async () => {
    expect((await send({ ...PAY, idempotencyKey: 42 })).error?.code).toBe("IDEMPOTENCY_KEY_INVALID");
    expect((await send({ ...PAY, idempotencyKey: "" })).error?.code).toBe("IDEMPOTENCY_KEY_INVALID");
    expect(node.plans).toBe(0);
  });

  it("the same key with an authorization flag added is ANOTHER request (IDEMPOTENCY_KEY_REUSED), not a replay", async () => {
    await send({ ...PAY, idempotencyKey: "pay-f" });
    const r = await send({ ...PAY, idempotencyKey: "pay-f", allowNewPaymentAfterUnknown: true });
    expect(r.error?.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("the same key with another inline signed transaction (no contentHash) is another request", async () => {
    await send({ signedTx: { txId: "a".repeat(64), raw: "one" }, idempotencyKey: "pay-s" });
    const r = await send({ signedTx: { txId: "b".repeat(64), raw: "two" }, idempotencyKey: "pay-s" });
    expect(r.error?.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});

describe("P0-TX-SAFETY-1A · CI reproduction: one client call whose answer is lost", () => {
  it("workflow.transfer through the real dev-server route, answer lost → 1 POST, 1 plan, 1 broadcast, 1 txId", async () => {
    let posts = 0;
    const g = global.fetch;
    global.fetch = (async (_url: string, init?: RequestInit) => {
      posts++;
      await app.request(
        new Request("http://localhost/api/tx/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: init?.body as any })
      );
      return { json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } } as any;
    }) as any;
    try {
      const r: any = await createHardkasClient().workflow.transfer(PAY);
      expect(r.error?.code).toBe("TX_SEND_OUTCOME_UNKNOWN");
    } finally {
      global.fetch = g;
    }
    expect(posts).toBe(1);
    expect(node.plans).toBe(1);
    expect(node.broadcasts).toHaveLength(1);
    expect(new Set(node.broadcasts).size).toBe(1);
  });
});
