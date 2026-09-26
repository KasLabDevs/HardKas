import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Hono } from "hono";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "@hardkas/sdk";

// Wave 1.5 · AUD-14 (=SEC-I), dev-server part · T-A14c
//   GET  /api/artifacts/:id/explain  reports the integrity it COMPUTED (no "analyzed signature",
//                                    no fixed "passed");
//   POST /api/artifacts/:id/replay   returns the SDK replay's verdict for a simulator receipt,
//                                    "unsupported" for anything with no execution to reproduce,
//                                    and never "passed" for a manipulated chain;
//   POST /api/session/replay, /diff-replay/:id  never fabricate a verdict.

const rows = new Map<string, any>();

vi.mock("../src/db.js", () => ({
  getQueryBackend: () => ({
    getArtifact: async (id: string) => rows.get(id) ?? null,
    findArtifacts: async () => Array.from(rows.values())
  }),
  disconnectQueryBackend: () => {}
}));

function row(artifact: any, filePath: string, kind: "OK" | "CORRUPTED" = "OK") {
  return {
    artifactId: artifact.contentHash,
    contentHash: artifact.contentHash,
    schema: artifact.schema,
    version: artifact.version,
    kind,
    mode: artifact.mode,
    networkId: artifact.networkId,
    txId: artifact.txId,
    createdAt: artifact.createdAt,
    path: filePath,
    payload: artifact
  };
}

async function buildApp() {
  const { artifactsRoutes } = await import("../src/routes/artifacts.js");
  const { sessionRoutes } = await import("../src/routes/session.js");
  const app = new Hono();
  app.route("/api/artifacts", artifactsRoutes);
  app.route("/api/session", sessionRoutes);
  return app;
}

describe("Wave 1.5 · AUD-14 · the dev-server reports only what it computed (T-A14c)", () => {
  let ws: string;
  let previousRoot: string | undefined;
  let plan: any;
  let receipt: any;
  let receiptPath: string;

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w15-devserver-"));
    previousRoot = process.env.HARDKAS_ROOT;
    process.env.HARDKAS_ROOT = ws;
    const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    const { absolutePath: planPath } = await sdk.artifacts.write(plan);
    const signed = await sdk.tx.sign(plan, "alice");
    const sent: any = await sdk.tx.send(signed);
    receipt = sent.receipt;
    receiptPath = sent.receiptPath;
    rows.set(plan.contentHash, row(plan, planPath!));
    rows.set(receipt.contentHash, row(receipt, receiptPath));
  });

  afterAll(() => {
    if (previousRoot === undefined) delete process.env.HARDKAS_ROOT;
    else process.env.HARDKAS_ROOT = previousRoot;
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("explain · the integrity verdict is computed (FULL, passed) and nothing about signatures or replays is claimed", async () => {
    const app = await buildApp();
    const res = await app.request(`/api/artifacts/${receipt.contentHash}/explain`);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.policyChecks).toEqual([{ name: "Integrity", status: "passed", authScope: "FULL", issues: [] }]);
    expect(JSON.stringify(json.data.actions)).not.toMatch(/signature/i);
    expect(json.data.deterministic).toBeUndefined();
    expect(json.data.replay).toMatch(/not run/);
    expect(json.data.replayable).toBe(true);
    expect(json.data.artifactRefs).toEqual([receipt.lineage.parentArtifactId]);
  });

  it("replay · a simulator receipt is actually replayed and the verdict is the replay's", async () => {
    const app = await buildApp();
    const res = await app.request(`/api/artifacts/${receipt.contentHash}/replay`, { method: "POST" });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.status, JSON.stringify(json.data)).toBe("passed");
    expect(json.data.lineage).toBe("valid");
    expect(json.data.determinism).toBe("verified");
    expect(json.data.artifactsScanned).toBeGreaterThanOrEqual(3);
    expect(json.data.divergences).toEqual([]);
  });

  it("replay · a plan has no execution to reproduce: unsupported, never passed", async () => {
    const app = await buildApp();
    const res = await app.request(`/api/artifacts/${plan.contentHash}/replay`, { method: "POST" });
    const json: any = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("unsupported");
    expect(JSON.stringify(json)).not.toMatch(/"passed"/);
  });

  it("manipulated chain · a tampered receipt fails the computed integrity check and its replay never passes", async () => {
    const tampered = structuredClone(receipt);
    tampered.amountSompi = "1";
    rows.set(receipt.contentHash, row(tampered, receiptPath));
    fs.writeFileSync(receiptPath, JSON.stringify(tampered, null, 2));

    const app = await buildApp();
    const explain: any = await (await app.request(`/api/artifacts/${receipt.contentHash}/explain`)).json();
    expect(explain.ok).toBe(true);
    expect(explain.data.policyChecks[0].status).toBe("failed");
    expect(explain.data.policyChecks[0].issues).toContain("ARTIFACT_HASH_MISMATCH");
    expect(JSON.stringify(explain)).not.toMatch(/"passed"/);

    const replay: any = await (await app.request(`/api/artifacts/${receipt.contentHash}/replay`, { method: "POST" })).json();
    expect(replay.ok).toBe(true);
    expect(replay.data.status).not.toBe("passed");
    expect(["missing_dependency", "diverged"]).toContain(replay.data.status);
  });

  it("session · replay and diff-replay never fabricate a verdict", async () => {
    const app = await buildApp();
    const replay: any = await (await app.request("/api/session/replay", { method: "POST" })).json();
    expect(replay.data.status).toBe("unsupported");
    expect(replay.data.differences).toBeUndefined();
    const diff: any = await (await app.request("/api/session/diff-replay/anything", { method: "POST" })).json();
    expect(diff.data.status).toBe("unsupported");
    expect(diff.data.divergenceClassifications).toEqual([]);
  });
});
