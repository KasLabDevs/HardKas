import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// COVERAGE 1.0 · GET /api/overview: the semantic state of the runtime (EMPTY, PENDING, DEGRADED, CORRUPTED, VERIFIED, ACTIVE),
// the counts and the guarantees it states. The projection (query backend), the config, the accounts and the replay verdict
// are mocked: what is under test is the decision the route makes from them, and the honesty of the guarantees
// (consensus and finality are never claimed).

const state = {
  artifacts: [] as any[],
  replays: [] as any[],
  receipts: [] as any[],
  events: [] as any[],
  replayVerdict: "NONE" as string,
  accounts: [] as any[],
  failFind: false
};

vi.mock("@hardkas/config", () => ({ loadHardkasConfig: async () => ({ config: { defaultNetwork: "simnet", project: { name: "demo" } } }) }));
vi.mock("@hardkas/accounts", () => ({ listHardkasAccounts: () => state.accounts }));
vi.mock("../src/replay-status.js", () => ({ overallReplayStatus: () => state.replayVerdict }));
vi.mock("../src/db.js", () => ({
  getQueryBackend: () => ({
    findArtifacts: async (filter?: { schema?: string }) => {
      if (state.failFind) throw new Error("projection unavailable");
      if (filter?.schema === "hardkas.replayReport.v1") return state.replays;
      if (filter?.schema === "hardkas.txReceipt.v1") return state.receipts;
      return state.artifacts;
    },
    getEvents: async () => state.events
  })
}));

const { overviewRoutes } = await import("../src/routes/overview.js");

let cwd: string;
const get = async () => (await overviewRoutes.request("/")).json() as Promise<any>;

beforeEach(() => {
  Object.assign(state, { artifacts: [], replays: [], receipts: [], events: [], replayVerdict: "NONE", accounts: [], failFind: false });
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-overview-"));
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe("overview · the runtime state", () => {
  it("OV-1 a workspace with nothing recorded is EMPTY and says how to start", async () => {
    const o = await get();
    expect(o).toMatchObject({ projectName: "demo", network: "simnet", runtimeState: "EMPTY", recommendedAction: "hardkas tx send --from alice --to bob --amount 10 --yes" });
    expect(o.counts).toMatchObject({ artifacts: 0, transactions: 0, events: 0, replays: 0, pendingReplays: 0, corruptedArtifacts: 0 });
  });

  it("OV-2 artifacts but no replay yet is PENDING: `hardkas replay verify`", async () => {
    state.artifacts = [{ schema: "hardkas.txPlan.v1", kind: "VALID", payload: { txId: "a" } }];
    const o = await get();
    expect(o).toMatchObject({ runtimeState: "PENDING", recommendedAction: "hardkas replay verify" });
    expect(o.counts).toMatchObject({ artifacts: 1, transactions: 1 });
  });

  it("OV-3 a confirmed receipt nobody replayed is PENDING and counted as a pending replay", async () => {
    state.artifacts = [{ schema: "hardkas.txReceipt.v1", kind: "VALID", payload: { txId: "t1", status: "confirmed" } }];
    state.receipts = [{ payload: { txId: "t1", status: "confirmed" } }, { payload: { txId: "t2", status: "failed" } }];
    state.replays = [{ payload: { txId: "other" } }];
    state.replayVerdict = "PASS";
    const o = await get();
    expect(o.runtimeState).toBe("PENDING");
    expect(o.runtimeReason).toBe("Unverified transaction receipts exist.");
    expect(o.counts.pendingReplays).toBe(1);
  });

  it("OV-4 a corrupted artifact is CORRUPTED and the guarantee of artifact integrity is `failed`", async () => {
    state.artifacts = [{ schema: "hardkas.txPlan.v1", kind: "CORRUPTED", payload: {} }];
    const o = await get();
    expect(o).toMatchObject({ runtimeState: "CORRUPTED", recommendedAction: "hardkas doctor --consistency --strict" });
    expect(o.runtimeReason).toMatch(/integrity failed/);
    expect(o.counts.corruptedArtifacts).toBe(1);
    expect(o.guarantees.artifactIntegrity).toBe("failed");
  });

  it("OV-5 a failed replay is CORRUPTED, whatever else exists, and the local replay guarantee is `failed`", async () => {
    state.artifacts = [{ schema: "hardkas.txPlan.v1", kind: "VALID", payload: {} }];
    state.replays = [{ payload: { txId: "x" } }];
    state.replayVerdict = "FAIL";
    const o = await get();
    expect(o).toMatchObject({ runtimeState: "CORRUPTED", runtimeReason: "Replay verification failed." });
    expect(o.guarantees.localReplay).toBe("failed");
  });

  it("OV-6 files on disk the projection does not know is DEGRADED: rebuild the store", async () => {
    fs.mkdirSync(path.join(cwd, ".hardkas", "artifacts"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".hardkas", "artifacts", "a.json"), "{}");
    const o = await get();
    expect(o).toMatchObject({ runtimeState: "DEGRADED", recommendedAction: "hardkas query store rebuild" });
  });

  it("OV-7 every receipt replayed and nothing corrupted is VERIFIED, and consensus and finality are still not claimed", async () => {
    state.artifacts = [{ schema: "hardkas.txReceipt.v1", kind: "VALID", payload: { txId: "t1", status: "confirmed" } }];
    state.receipts = [{ payload: { txId: "t1", status: "confirmed" } }];
    state.replays = [{ payload: { txId: "t1" } }];
    state.replayVerdict = "PASS";
    state.events = [{}];
    const o = await get();
    expect(o).toMatchObject({ runtimeState: "VERIFIED", recommendedAction: "hardkas status" });
    expect(o.guarantees).toEqual({ artifactIntegrity: "available", localReplay: "verified", consensusValidated: false, networkFinality: false });
  });

  it("OV-8 the replay guarantee reads `legacy` and `not_checked` as they are, never as a pass", async () => {
    state.artifacts = [{ schema: "hardkas.txPlan.v1", kind: "VALID", payload: {} }];
    state.replays = [{ payload: { txId: "x" } }];
    state.replayVerdict = "LEGACY";
    expect((await get()).guarantees.localReplay).toBe("legacy");
    state.replayVerdict = "NONE";
    expect((await get()).guarantees.localReplay).toBe("not_checked");
  });

  it("OV-9 deployments and receipts of both families count; transactions are counted once per txId", async () => {
    state.artifacts = [
      { schema: "hardkas.txReceipt.v1", kind: "VALID", payload: { txId: "same" } },
      { schema: "hardkas.txPlan.v1", kind: "VALID", payload: { txId: "same" } },
      { schema: "hardkas.igraTxReceipt.v1", kind: "VALID", payload: { txId: "igra" } },
      { schema: "hardkas.deployment.v1", kind: "VALID", payload: {} }
    ];
    state.accounts = [{}, {}];
    const o = await get();
    expect(o.counts).toMatchObject({ artifacts: 4, transactions: 2 });
  });

  it("OV-10 a projection that fails still answers, with zeros, instead of a 500", async () => {
    state.failFind = true;
    const res = await overviewRoutes.request("/");
    expect(res.status).toBe(200);
    const o: any = await res.json();
    expect(o.counts).toMatchObject({ artifacts: 0, replays: 0 });
    expect(o.runtimeState).toBe("EMPTY");
  });
});
