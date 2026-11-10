import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ESCALÓN 4 · P38 (+ P35) · the dev-server signs with its own accounts for an HTTP client (POST /api/tx/send with
// `allowDevAutoSign`, POST /api/tx/sign) only when its operator opened it, and only on a local world. Before: without
// HARDKAS_DEV_SERVER_AUTOSIGN the simulated ledger and simnet auto-signed for any client, `/sign` signed on any network
// that was not literally "mainnet", and with the variable set the server auto-signed on testnet-10 — and on mainnet
// spelled `mainnet-1`, `kaspa`, `kaspa-mainnet`, `MAINNET` or an alias, which passed the literal `=== "mainnet"` checks
// and reached tx.plan. Now: off by default; with `HARDKAS_DEV_SERVER_AUTOSIGN=1`, only the simulated ledger and a local
// simnet (declared simnet, loopback node endpoint); TN10, devnet and every mainnet spelling or alias are refused before
// anything is planned, signed or sent. Hermetic: the SDK is a stub that counts calls; no node, no network.

const node = vi.hoisted(() => ({ cwd: "", network: "simnet" as string, config: undefined as unknown, plans: 0, signs: 0, sends: 0, simulations: 0 }));
vi.mock("@hardkas/sdk", () => ({
  Hardkas: {
    create: vi.fn(async () => ({
      get cwd() {
        return node.cwd;
      },
      get network() {
        return node.network;
      },
      get sdkConfig() {
        return node.config;
      },
      tx: {
        plan: vi.fn(async () => ({ id: `plan-${++node.plans}` })),
        sign: vi.fn(async () => ({ signedId: `signed-${++node.signs}`, txId: node.signs.toString(16).padStart(64, "0") })),
        simulate: vi.fn(async (s: any) => {
          node.simulations++;
          return { receipt: { txId: s.txId, mode: "simulator" } };
        }),
        send: vi.fn(async (s: any) => {
          node.sends++;
          const receipt = { schema: "hardkas.txSubmission.v1", txId: s.txId, submitResult: { accepted: true, transactionId: s.txId } };
          return { receipt, submission: receipt, txId: s.txId, submitted: true };
        })
      }
    }))
  }
}));

const { dappTxRoutes, serverAllowsDevAutoSign, isMainnetDevServerNetwork } = await import("../src/routes/dapp-tx.js");
const guard: any = await import("../src/routes/send-guard.js");
const app = new Hono();
app.route("/api/tx", dappTxRoutes);
let n = 0;
async function post(route: "send" | "sign", body: Record<string, unknown>) {
  const res = await app.request(new Request(`http://localhost/api/tx/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return (await res.json()) as any;
}
const PAY = () => ({ from: "alice", to: "bob", amountSompi: "1000", allowDevAutoSign: true, idempotencyKey: `p38-${++n}` });
const SIGN = { plan: { id: "plan-x" }, account: "alice" };
const ON = { HARDKAS_DEV_SERVER_AUTOSIGN: "1" };
const MAINNET_SPELLINGS = ["mainnet", "mainnet-1", "kaspa", "kaspa-mainnet", "MAINNET", "Kaspa-Mainnet-1"];
const nothingHappened = () => expect({ plans: node.plans, signs: node.signs, sends: node.sends, simulations: node.simulations }).toEqual({ plans: 0, signs: 0, sends: 0, simulations: 0 });

beforeEach(() => {
  node.cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-p38-"));
  node.network = "simnet";
  node.config = undefined;
  node.plans = node.signs = node.sends = node.simulations = 0;
  delete process.env.HARDKAS_DEV_SERVER_AUTOSIGN;
  guard.__resetSendGuardForTests?.();
});
afterEach(() => {
  delete process.env.HARDKAS_DEV_SERVER_AUTOSIGN;
  fs.rmSync(node.cwd, { recursive: true, force: true });
});

describe("P38 · serverAllowsDevAutoSign: off by default, local worlds only", () => {
  it("without HARDKAS_DEV_SERVER_AUTOSIGN=1 nothing auto-signs, the local worlds included; only the value 1 opens it", () => {
    for (const net of ["simulated", "simnet", "simnet-1", "local-docker-simnet", "testnet-10", "devnet", "mainnet"]) {
      expect(serverAllowsDevAutoSign(net, {}), net).toBe(false);
    }
    for (const value of ["true", "yes", "0", "", " 1"]) expect(serverAllowsDevAutoSign("simnet", { HARDKAS_DEV_SERVER_AUTOSIGN: value }), value).toBe(false);
  });

  it("with it: the simulated ledger and a local simnet yes; TN10, other testnets and devnet no", () => {
    expect(serverAllowsDevAutoSign("simulated", ON)).toBe(true);
    expect(serverAllowsDevAutoSign("simnet", ON)).toBe(true);
    expect(serverAllowsDevAutoSign("simnet-1", ON)).toBe(true);
    for (const net of ["testnet-10", "testnet-11", "testnet", "devnet", "unknown-net", ""]) expect(serverAllowsDevAutoSign(net, ON), net).toBe(false);
  });

  it("every mainnet spelling is refused, and isMainnetDevServerNetwork sees them all (P35: not only the literal)", () => {
    for (const net of MAINNET_SPELLINGS) {
      expect(serverAllowsDevAutoSign(net, ON), net).toBe(false);
      expect(isMainnetDevServerNetwork(net), net).toBe(true);
    }
    expect(isMainnetDevServerNetwork("simnet")).toBe(false);
  });

  it("config aliases decide by what the entry declares, and a simnet must be local (loopback endpoint)", () => {
    const config = {
      networks: {
        prod: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: "ws://127.0.0.1:9" },
        tn: { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: "ws://127.0.0.1:9" },
        lab: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:18210" },
        far: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://10.20.30.40:18210" },
        simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://192.168.1.50:18210" },
        "testnet-10": { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:18210" }
      }
    };
    expect(serverAllowsDevAutoSign("prod", ON, config)).toBe(false);
    expect(isMainnetDevServerNetwork("prod", config)).toBe(true);
    expect(serverAllowsDevAutoSign("tn", ON, config)).toBe(false);
    expect(serverAllowsDevAutoSign("lab", ON, config)).toBe(true);
    expect(serverAllowsDevAutoSign("far", ON, config), "a remote simnet is not local").toBe(false);
    expect(serverAllowsDevAutoSign("simnet", ON, config), "simnet whose declared node is remote").toBe(false);
    expect(serverAllowsDevAutoSign("testnet-10", ON, config), "a testnet name never auto-signs, whatever it declares").toBe(false);
  });
});

describe("P38 · POST /api/tx/send (allowDevAutoSign): refused before anything is planned, signed or sent", () => {
  it("TN10 with the server's opt-in → DEV_AUTOSIGN_NOT_ALLOWED, nothing planned", async () => {
    process.env.HARDKAS_DEV_SERVER_AUTOSIGN = "1";
    node.network = "testnet-10";
    const r = await post("send", PAY());
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
    expect(r.error.message).toMatch(/off by default/);
    nothingHappened();
  });

  it("every mainnet spelling and an alias declaring mainnet, with the opt-in → refused, nothing planned (P35)", async () => {
    process.env.HARDKAS_DEV_SERVER_AUTOSIGN = "1";
    for (const net of MAINNET_SPELLINGS) {
      node.network = net;
      const r = await post("send", PAY());
      expect(r.error?.code, net).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
    }
    node.network = "prod";
    node.config = { networks: { prod: { kind: "kaspa-rpc", network: "kaspa-mainnet", rpcUrl: "ws://127.0.0.1:9" } } };
    expect((await post("send", PAY())).error?.code).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
    nothingHappened();
  });

  it("simnet and the simulated ledger without the opt-in → refused (off by default)", async () => {
    for (const net of ["simnet", "simulated"]) {
      node.network = net;
      expect((await post("send", PAY())).error?.code, net).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
    }
    nothingHappened();
  });

  it("control: with the opt-in, a local simnet plans, signs and sends once; the simulated ledger executes", async () => {
    process.env.HARDKAS_DEV_SERVER_AUTOSIGN = "1";
    const sim = await post("send", PAY());
    expect(sim.ok, JSON.stringify(sim)).toBe(true);
    expect({ plans: node.plans, signs: node.signs, sends: node.sends }).toEqual({ plans: 1, signs: 1, sends: 1 });
    node.network = "simulated";
    const led = await post("send", PAY());
    expect(led.ok, JSON.stringify(led)).toBe(true);
    expect(led.data.outcome).toBe("executed");
    expect(node.simulations).toBe(1);
    expect(node.sends).toBe(1);
  });
});

describe("P38 · POST /api/tx/sign (the server's accounts for a client): the same decision", () => {
  it("off by default: the simulated ledger and simnet are refused without the opt-in (they signed before)", async () => {
    for (const net of ["simulated", "simnet"]) {
      node.network = net;
      expect((await post("sign", SIGN)).error?.code, net).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
    }
    nothingHappened();
  });

  it("TN10 with the opt-in → refused; a mainnet spelling → HTTP_SIGNING_NOT_ALLOWED (P35: it passed the literal check)", async () => {
    process.env.HARDKAS_DEV_SERVER_AUTOSIGN = "1";
    node.network = "testnet-10";
    expect((await post("sign", SIGN)).error?.code).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
    for (const net of MAINNET_SPELLINGS) {
      node.network = net;
      expect((await post("sign", SIGN)).error?.code, net).toBe("HTTP_SIGNING_NOT_ALLOWED");
    }
    nothingHappened();
  });

  it("a plan the client hands in for another network is refused on a local simnet server too (the plan's own networks decide)", async () => {
    process.env.HARDKAS_DEV_SERVER_AUTOSIGN = "1";
    expect((await post("sign", { plan: { id: "p", networkId: "testnet-10" }, account: "alice" })).error?.code).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
    expect((await post("sign", { plan: { id: "p", networkId: "simnet", execution: { network: "testnet-10" } }, account: "alice" })).error?.code).toBe("DEV_AUTOSIGN_NOT_ALLOWED");
    for (const net of ["kaspa-mainnet", "MAINNET-1"]) {
      expect((await post("sign", { plan: { id: "p", networkId: net }, account: "alice" })).error?.code, net).toBe("HTTP_SIGNING_NOT_ALLOWED");
    }
    nothingHappened();
  });

  it("control: with the opt-in, a local simnet signs (a plan without a network, and a simnet plan)", async () => {
    process.env.HARDKAS_DEV_SERVER_AUTOSIGN = "1";
    const r = await post("sign", SIGN);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const s = await post("sign", { plan: { id: "p", networkId: "simnet", execution: { network: "simnet" } }, account: "alice" });
    expect(s.ok, JSON.stringify(s)).toBe(true);
    expect(node.signs).toBe(2);
  });
});
