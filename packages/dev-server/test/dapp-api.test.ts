import { describe, it, expect, vi } from "vitest";
import { dappTxRoutes } from "../src/routes/dapp-tx.js";
import { Hono } from "hono";

// P0-TX-SAFETY-1A: the send guard keeps its record in the workspace, so the mock's workspace is a real temporary one
const WS = await vi.hoisted(async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  return fs.mkdtempSync(path.join(os.tmpdir(), "hk-dapp-api-"));
});

// Basic mocking of Hardkas class to test envelope serialization
vi.mock("@hardkas/sdk", () => {
  return {
    Hardkas: {
      create: vi.fn().mockResolvedValue({
        cwd: WS,
        network: "simulated",
        tx: {
          plan: vi.fn().mockResolvedValue({ id: "plan-123" }),
          sign: vi.fn().mockResolvedValue({ id: "signed-123" }),
          simulate: vi.fn().mockResolvedValue({ receipt: { txId: "tx-123" } }),
          send: vi.fn().mockResolvedValue({ receipt: { txId: "tx-123" } })
        },
        artifacts: {
          list: vi.fn().mockResolvedValue([])
        }
      })
    }
  };
});

describe("Dev-Server dApp Endpoints Envelope", () => {
  const app = new Hono();
  app.route("/api/tx", dappTxRoutes);

  it("returns stable JSON envelope on successful plan", async () => {
    const req = new Request("http://localhost/api/tx/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "alice", to: "bob", amountSompi: "100" })
    });
    const res = await app.request(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ id: "plan-123" });
    expect(json.meta).toEqual({
      workspace: WS,
      network: "simulated",
      mode: "developer"
    });
  });

  it("returns stable JSON envelope on validation error", async () => {
    const req = new Request("http://localhost/api/tx/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "alice" }) // missing to/amount
    });
    const res = await app.request(req);
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("BAD_REQUEST");
    expect(json.error?.message).toContain("Missing");
    expect(json.meta).toBeDefined();
  });

  it("rejects auto-signing if allowDevAutoSign is missing", async () => {
    const req = new Request("http://localhost/api/tx/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "alice", to: "bob", amountSompi: "100" }) // missing allowDevAutoSign
    });
    const res = await app.request(req);
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
  });

  // ESCALÓN 4 · P38: auto-signing is off by default, also on the simulated ledger; the server's operator opens it
  it("allows auto-signing if allowDevAutoSign is present in simulated network and the server opted in", async () => {
    process.env.HARDKAS_DEV_SERVER_AUTOSIGN = "1";
    try {
      const req = new Request("http://localhost/api/tx/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "alice",
          to: "bob",
          amountSompi: "100",
          allowDevAutoSign: true
        })
      });
      const res = await app.request(req);
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.data.artifacts).toBeDefined();
      expect(json.data.receipt).toBeDefined();
    } finally {
      delete process.env.HARDKAS_DEV_SERVER_AUTOSIGN;
    }
  });

  it("refuses auto-signing on the simulated ledger when the server did not opt in (off by default)", async () => {
    delete process.env.HARDKAS_DEV_SERVER_AUTOSIGN;
    const req = new Request("http://localhost/api/tx/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "alice", to: "bob", amountSompi: "100", allowDevAutoSign: true, idempotencyKey: "p38-off" })
    });
    const json = await (await app.request(req)).json();
    expect(json.ok).toBe(false);
    expect(json.error?.code).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
  });
});
