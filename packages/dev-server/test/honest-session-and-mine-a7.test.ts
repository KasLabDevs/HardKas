import { describe, it, expect, vi, beforeEach } from "vitest";

// A7 (rc2 audit) · dev-server routes answered success for work they did not do: POST /api/session/start, /snapshot,
// /time-travel, /import and GET /export returned `ok: true` with invented ids, `exported: true, content: {}`,
// `imported: true`; POST /api/simnet/mine?blocks=N ran the miner N x 500 ms (unbounded; NaN = 0 ms) and answered
// "mined" without reading the chain. Now the session routes say unsupported (501), `blocks` is a bounded integer and the
// mine answer reports the node's DAA score before and after. Hermetic: Docker, accounts, the identity proof and the node
// client are stand-ins; nothing is spawned or contacted.

const execFileCalls: unknown[][] = [];
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: (...args: unknown[]) => {
    execFileCalls.push(args);
    const cb = args[args.length - 1];
    if (typeof cb === "function") (cb as (e: unknown, r: unknown) => void)(null, { stdout: "", stderr: "" });
  }
}));
vi.mock("@hardkas/accounts", () => ({ listDevAccountsSync: () => [{ address: "kaspasim:qtestminer" }] }));
vi.mock("@hardkas/node-runner", () => ({ requireNodeIdentity: async () => ({ ok: true }) }));

const chain = { daa: 1000n, step: 0n, fail: false, closed: 0 };
vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual: any = await vi.importActual("@hardkas/kaspa-rpc");
  class StandInClient {
    async getBlockDagInfo() {
      if (chain.fail) throw new Error("node unreachable");
      const v = chain.daa;
      chain.daa += chain.step;
      return { virtualDaaScore: v };
    }
    async close() {
      chain.closed++;
    }
  }
  return { ...actual, JsonWrpcKaspaClient: StandInClient };
});

const { sessionRoutes } = await import("../src/routes/session.js");
const { simnetRoutes, simnetMineTiming, MAX_MINE_BLOCKS } = await import("../src/routes/simnet.js");
Object.assign(simnetMineTiming, { pollMs: 1, perBlockMs: 1, graceMs: 30, maxWaitMs: 200 });

const mine = (query: string) => simnetRoutes.request(`/mine${query}`, { method: "POST", headers: { host: "127.0.0.1:7420" } });
const dockerRuns = () => execFileCalls.filter((a) => Array.isArray(a[1]) && (a[1] as string[])[0] === "run").length;

describe("A7 · the session routes that do nothing say so", () => {
  for (const [method, route] of [
    ["POST", "/start"],
    ["POST", "/snapshot"],
    ["POST", "/time-travel"],
    ["GET", "/export"],
    ["POST", "/import"]
  ] as const) {
    it(`${method} ${route} → 501 SESSION_OPERATION_UNSUPPORTED, no invented id or "done" flag`, async () => {
      const res = await sessionRoutes.request(route, { method });
      const body = await res.json();
      expect(res.status).toBe(501);
      expect(body).toMatchObject({ ok: false, code: "SESSION_OPERATION_UNSUPPORTED", data: { status: "unsupported" } });
      expect(JSON.stringify(body)).not.toMatch(/sess_|snap_|view_|imported_|"exported":true|"imported":true|"created"|"ready"/);
    });
  }
});

describe("A7 · POST /api/simnet/mine: bounded blocks, and what really happened", () => {
  beforeEach(() => {
    execFileCalls.length = 0;
    Object.assign(chain, { daa: 1000n, step: 0n, fail: false, closed: 0 });
  });

  for (const q of ["?blocks=abc", "?blocks=0", "?blocks=-1", "?blocks=1.5", `?blocks=${MAX_MINE_BLOCKS + 1}`, "?blocks=100000000"]) {
    it(`${q} → 400 SIMNET_MINE_BLOCKS_INVALID, no miner started`, async () => {
      const res = await mine(q);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("SIMNET_MINE_BLOCKS_INVALID");
      expect(dockerRuns()).toBe(0);
    });
  }

  it("the DAA score advances by the blocks asked → ok, status mined, before/after reported, client closed", async () => {
    chain.step = 1n;
    const res = await mine("?blocks=3");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, data: { status: "mined", blocksRequested: 3, daaScoreBefore: "1000" } });
    expect(BigInt(body.data.daaScoreAdvancedBy)).toBeGreaterThanOrEqual(3n);
    expect(dockerRuns()).toBe(1);
    expect(chain.closed).toBe(1);
  });

  it("the miner ran but the chain did not move → 502 SIMNET_MINE_NO_PROGRESS (it used to say mined)", async () => {
    const res = await mine("?blocks=2");
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body).toMatchObject({ ok: false, code: "SIMNET_MINE_NO_PROGRESS", data: { status: "not-advanced", daaScoreAdvancedBy: "0" } });
  });

  it("the node cannot be read → 502 SIMNET_MINE_UNOBSERVED", async () => {
    chain.fail = true;
    const res = await mine("?blocks=1");
    expect(res.status).toBe(502);
    expect((await res.json()).data.status).toBe("unobserved");
  });
});
