import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// TX-06 · POST /api/tx/send signed with the server's accounts whenever the HTTP CLIENT said `allowDevAutoSign: true`.
// Now the server decides: off the local worlds (simulator, simnet) it signs for clients only when its operator opted in
// (HARDKAS_DEV_SERVER_AUTOSIGN=1 in the server's environment); the client's flag is still required, never sufficient.
// Also: `amountSompi` reaches tx.plan as sompi (a bigint), not as a KAS string.

const node = vi.hoisted(() => ({ cwd: "", network: "testnet-10" as string, plans: [] as any[] }));
vi.mock("@hardkas/sdk", () => ({
  Hardkas: {
    create: vi.fn(async () => ({
      get cwd() {
        return node.cwd;
      },
      get network() {
        return node.network;
      },
      tx: {
        plan: vi.fn(async (o: any) => {
          node.plans.push(o);
          return { id: `plan-${node.plans.length}` };
        }),
        sign: vi.fn(async () => ({ signedId: "s", txId: "a".repeat(64) })),
        simulate: vi.fn(async (signed: any) => ({ receipt: { txId: signed.txId, mode: "simulator" } })),
        send: vi.fn(async (signed: any) => {
          const receipt = { schema: "hardkas.txSubmission.v1", txId: signed.txId, submitResult: { accepted: true, transactionId: signed.txId } };
          return { receipt, submission: receipt, txId: signed.txId, submitted: true };
        })
      }
    }))
  }
}));

const { dappTxRoutes, serverAllowsDevAutoSign } = await import("../src/routes/dapp-tx.js");
const app = new Hono();
app.route("/api/tx", dappTxRoutes);
async function send(body: Record<string, unknown>) {
  const res = await app.request(new Request("http://localhost/api/tx/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return (await res.json()) as any;
}

beforeEach(() => {
  node.cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tx06-"));
  node.network = "testnet-10";
  node.plans = [];
  delete process.env.HARDKAS_DEV_SERVER_AUTOSIGN;
});
afterEach(() => {
  delete process.env.HARDKAS_DEV_SERVER_AUTOSIGN;
  fs.rmSync(node.cwd, { recursive: true, force: true });
});

describe("TX-06 · dev-server auto-signing is the server's decision", () => {
  // ESCALÓN 4 · P38: off by default everywhere; with the server's opt-in, the local worlds only (dev-autosign-p38.test.ts)
  it("serverAllowsDevAutoSign: nothing without the server's opt-in; with it, the local worlds only; testnet and mainnet never", () => {
    expect(serverAllowsDevAutoSign("simulated", {})).toBe(false);
    expect(serverAllowsDevAutoSign("simnet", {})).toBe(false);
    expect(serverAllowsDevAutoSign("testnet-10", {})).toBe(false);
    expect(serverAllowsDevAutoSign("simulated", { HARDKAS_DEV_SERVER_AUTOSIGN: "1" })).toBe(true);
    expect(serverAllowsDevAutoSign("simnet", { HARDKAS_DEV_SERVER_AUTOSIGN: "1" })).toBe(true);
    expect(serverAllowsDevAutoSign("testnet-10", { HARDKAS_DEV_SERVER_AUTOSIGN: "1" })).toBe(false);
    expect(serverAllowsDevAutoSign("mainnet", { HARDKAS_DEV_SERVER_AUTOSIGN: "1" })).toBe(false);
  });

  it("testnet-10, the client says allowDevAutoSign: true, the server did not opt in → DEV_AUTOSIGN_NOT_ALLOWED, nothing planned", async () => {
    const r = await send({ from: "alice", to: "bob", amountSompi: "1000", allowDevAutoSign: true });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
    expect(node.plans).toEqual([]);
  });

  it("with the server's opt-in it plans (local simnet), and the amount reaches tx.plan in sompi (bigint 1000n, not '1000' KAS)", async () => {
    process.env.HARDKAS_DEV_SERVER_AUTOSIGN = "1";
    node.network = "simnet";
    await send({ from: "alice", to: "bob", amountSompi: "1000", allowDevAutoSign: true });
    expect(node.plans).toHaveLength(1);
    expect(node.plans[0].amount).toBe(1000n);
  });

  it("the client's flag is still required (simnet without it → refused)", async () => {
    node.network = "simnet";
    const r = await send({ from: "alice", to: "bob", amountSompi: "1000" });
    expect(r.error.code).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
  });
});
