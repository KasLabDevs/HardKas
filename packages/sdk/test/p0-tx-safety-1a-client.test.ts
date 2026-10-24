import { describe, it, expect, vi, afterEach } from "vitest";
import { createHardkasClient } from "../src/client.js";

// P0-TX-SAFETY-1A — `createHardkasClient` never re-sends a request that can broadcast a transaction.
// Adversarial: the dev server processes the send and the answer is lost (the JSON cannot be read), the connection drops,
// the request times out. Before the fix every one of these was retried up to 3 times (4 POSTs) — with
// `allowDevAutoSign` each retry planned, signed and broadcast a new transaction.

const globalFetch = global.fetch;
afterEach(() => {
  global.fetch = globalFetch;
});

/** A dev server double: counts POST /api/tx/send, mints a new txId per request (auto-sign plans a new tx each time). */
function devServer(answer: "lost-after-processing" | "connection-reset" | "ok") {
  const sends: any[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/api/tx/send")) {
      sends.push(JSON.parse(String(init?.body ?? "{}")));
      const txId = String(sends.length).padStart(64, "a");
      if (answer === "connection-reset") throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
      if (answer === "lost-after-processing") {
        // processed (a transaction was broadcast) but the answer cannot be read
        return { json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } } as any;
      }
      return { json: async () => ({ ok: true, data: { receipt: { txId }, outcome: "accepted" }, warnings: [], meta: {} }) } as any;
    }
    return { json: async () => ({ ok: true, data: [] }) } as any;
  });
  global.fetch = fetchMock as any;
  return { sends, fetchMock };
}

describe("P0-TX-SAFETY-1A · createHardkasClient sends a broadcasting request once", () => {
  it("workflow.transfer: accepted, then the answer is lost → ONE request, TX_SEND_OUTCOME_UNKNOWN, no second txId", async () => {
    const server = devServer("lost-after-processing");
    const client = createHardkasClient({ baseUrl: "http://127.0.0.1:7420", network: "testnet-10" });
    const res = await client.workflow.transfer({ from: "alice", to: "bob", amountSompi: "1000", allowDevAutoSign: true });
    expect(server.sends).toHaveLength(1);
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("TX_SEND_OUTCOME_UNKNOWN");
    expect(res.error?.message).toMatch(/not sent again/);
    expect(typeof res.error?.idempotencyKey).toBe("string");
    expect(server.sends[0].idempotencyKey).toBe(res.error?.idempotencyKey);
  });

  it("tx.send: connection reset → ONE request, outcome unknown (never 'retry exhausted')", async () => {
    const server = devServer("connection-reset");
    const client = createHardkasClient();
    const res = await client.tx.send({ signedTxId: "signed-1" });
    expect(server.sends).toHaveLength(1);
    expect(res.error?.code).toBe("TX_SEND_OUTCOME_UNKNOWN");
  });

  it("timeout (the fetch never answers and is aborted) → ONE request", async () => {
    let sends = 0;
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/tx/send")) sends++;
      throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    }) as any;
    const client = createHardkasClient();
    const res = await client.workflow.transfer({ from: "alice", to: "bob", amountSompi: "1000", allowDevAutoSign: true });
    expect(sends).toBe(1);
    expect(res.error?.code).toBe("TX_SEND_OUTCOME_UNKNOWN");
  });

  it("the caller's idempotencyKey is sent as given; two consecutive calls with it carry the same key", async () => {
    const server = devServer("ok");
    const client = createHardkasClient();
    await client.workflow.transfer({ from: "alice", to: "bob", amountSompi: "1000", allowDevAutoSign: true, idempotencyKey: "pay-42" });
    await client.workflow.transfer({ from: "alice", to: "bob", amountSompi: "1000", allowDevAutoSign: true, idempotencyKey: "pay-42" });
    expect(server.sends.map((s) => s.idempotencyKey)).toEqual(["pay-42", "pay-42"]);
  });

  it("without a key each call gets its own (two calls are two requests the server can tell apart)", async () => {
    const server = devServer("ok");
    const client = createHardkasClient();
    await client.tx.send({ signedTxId: "signed-1" });
    await client.tx.send({ signedTxId: "signed-1" });
    expect(server.sends).toHaveLength(2);
    expect(server.sends[0].idempotencyKey).not.toBe(server.sends[1].idempotencyKey);
  });

  it("normal answer is returned unchanged", async () => {
    devServer("ok");
    const res = await createHardkasClient().workflow.transfer({ from: "alice", to: "bob", amountSompi: "1000", allowDevAutoSign: true });
    expect(res.ok).toBe(true);
    expect(res.data.receipt.txId).toBe("1".padStart(64, "a"));
  });

  it("read-only requests keep their retry (GET /api/localnet/status)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network fail"));
    global.fetch = fetchMock;
    const res = await createHardkasClient().localnet.status();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(res.error?.code).toBe("LOCALNET_RPC_RETRY_EXHAUSTED");
  });
});
