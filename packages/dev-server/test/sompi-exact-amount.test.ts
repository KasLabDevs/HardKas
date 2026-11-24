import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// BETA-FIX · an HTTP body's amountSompi is sompi, read exactly, and reaches the SDK as a bigint.
//  - /api/tx/plan passed the field through: sdk.tx.plan reads a string (and a number) as KAS (L1-11), so
//    {"amountSompi":"100"} planned 100 KAS — 10^8 times the amount the client asked for.
//  - every route read String(value): a JSON number past 2^53 - 1, already rounded by JSON.parse, went on as other digits.

const h = vi.hoisted(() => ({ planArgs: [] as any[], ws: "" }));
const WS = await vi.hoisted(async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  return fs.mkdtempSync(path.join(os.tmpdir(), "hk-sompi-exact-"));
});

vi.mock("@hardkas/sdk", () => ({
  Hardkas: {
    create: vi.fn().mockResolvedValue({
      cwd: WS,
      network: "simulated",
      tx: {
        plan: vi.fn(async (args: any) => {
          h.planArgs.push(args);
          return { id: "plan-1" };
        }),
        sign: vi.fn().mockResolvedValue({ id: "signed-1" }),
        simulate: vi.fn().mockResolvedValue({ receipt: { txId: "tx-1" } }),
        send: vi.fn().mockResolvedValue({ receipt: { txId: "tx-1" } })
      },
      artifacts: { list: vi.fn().mockResolvedValue([]) }
    })
  }
}));

import { dappTxRoutes } from "../src/routes/dapp-tx.js";
import { exactSompiOf } from "../src/routes/sompi.js";
import { createWalletProbeRoutes } from "../src/routes/wallet-probe.js";

const app = new Hono();
app.route("/api/tx", dappTxRoutes);
const plan = async (rawBody: string) => (await app.request("http://localhost/api/tx/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: rawBody })).json();

beforeEach(() => {
  h.planArgs = [];
});

describe("BETA-FIX · amountSompi is read exactly, as sompi", () => {
  it("exactSompiOf: digits and safe JSON integers only", () => {
    expect(exactSompiOf("100")).toBe(100n);
    expect(exactSompiOf("12345678901234567890")).toBe(12345678901234567890n);
    expect(exactSompiOf(100)).toBe(100n);
    expect(exactSompiOf(0)).toBe(0n);
    expect(exactSompiOf(Number.MAX_SAFE_INTEGER)).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    for (const bad of ["1.5", "-1", "1e3", " 100", "0x10", "", 1.5, -1, Number.MAX_SAFE_INTEGER + 1, 1e21, NaN, null, undefined, {}, [100]]) {
      expect(exactSompiOf(bad), String(bad)).toBeUndefined();
    }
  });

  it("/api/tx/plan hands the SDK a bigint of sompi (a string used to be read as KAS)", async () => {
    const r = await plan(JSON.stringify({ from: "alice", to: "bob", amountSompi: "100" }));
    expect(r.ok).toBe(true);
    expect(h.planArgs).toHaveLength(1);
    expect(h.planArgs[0].amount).toBe(100n);
    const n = await plan(JSON.stringify({ from: "alice", to: "bob", amountSompi: 250 }));
    expect(n.ok).toBe(true);
    expect(h.planArgs[1].amount).toBe(250n);
  });

  it("/api/tx/plan: a JSON number past 2^53 - 1 is refused, never rounded; as a string it is exact", async () => {
    const r = await plan('{"from":"alice","to":"bob","amountSompi":12345678901234567890}');
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("BAD_REQUEST");
    expect(r.error.message).toMatch(/2\^53 - 1/);
    expect(h.planArgs).toHaveLength(0);
    const s = await plan('{"from":"alice","to":"bob","amountSompi":"12345678901234567890"}');
    expect(s.ok).toBe(true);
    expect(h.planArgs[0].amount).toBe(12345678901234567890n);
  });

  it("/api/tx/plan: a fraction, a negative or a string that is not plain digits is refused before the SDK plans", async () => {
    for (const v of ['"1.5"', "1.5", "-1", '"-1"', '"1e3"', "1e21"]) {
      const r = await plan(`{"from":"alice","to":"bob","amountSompi":${v}}`);
      expect(r.ok, v).toBe(false);
      expect(r.error.code, v).toBe("BAD_REQUEST");
    }
    expect(h.planArgs).toHaveLength(0);
    // a JSON number whose value is an exact whole number is that number (1e3 is 1000)
    const e = await plan('{"from":"alice","to":"bob","amountSompi":1e3}');
    expect(e.ok).toBe(true);
    expect(h.planArgs[0].amount).toBe(1000n);
  });

  it("the wallet probe's payment route: a JSON number past 2^53 - 1 is refused before the SDK is opened", async () => {
    const openSdk = vi.fn();
    const probe = new Hono();
    probe.route("/", createWalletProbeRoutes({ openSdk: openSdk as any }));
    const LOOP = { incoming: { socket: { remoteAddress: "127.0.0.1" } } } as any;
    const r = await probe.request(
      "/api/wallet-probe/payment",
      { method: "POST", body: '{"address":"kaspatest:q","to":"kaspatest:q","amountSompi":12345678901234567890}' },
      LOOP
    );
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe("BAD_REQUEST");
    expect(openSdk).not.toHaveBeenCalled();
  });
});
