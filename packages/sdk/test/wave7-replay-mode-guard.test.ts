import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../src/index.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";

// -----------------------------------------------------------------------------
// Wave 7 · REPLAY-MODE-1 · SDK replay mode guard regression.
//
// Contract enforced (see packages/sdk/src/replay.ts, `HardkasReplay.verify`):
//   - A receipt whose `mode` is not simulator-executable ("localnet" today)
//     returns a structured `REPLAY_MODE_UNSUPPORTED` result before any
//     simulator execution, preserving the lineage/integrity signals
//     (`lineage: "valid"`, `contamination: "clean"`).
//   - No simulator replay report file is written under the workspace.
//   - No misleading `diverged` / `non_deterministic` classification is
//     produced for real-node receipts.
//
// Wave 1.2 re-base: lineage resolves only through verified identity, so the
// fixture chain is sealed under the current hash version (each child carries
// its parent's real recomputed identity).
// -----------------------------------------------------------------------------

async function writeJson(p: string, obj: any) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj), "utf-8");
}

async function makeWorkspace(): Promise<string> {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "hk-wave7-mode-"));
  const artifactsDir = path.join(ws, ".hardkas", "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  return ws;
}

/** Seals a draft under the current hash version (identity = recomputed hash). */
function seal(draft: any, label?: "planId" | "signedId"): any {
  const a: any = { ...draft, hashVersion: CURRENT_HASH_VERSION };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  if (a.lineage) a.lineage.artifactId = a.contentHash;
  if (label === "planId") a.planId = `plan-${a.contentHash.slice(0, 16)}`;
  if (label === "signedId") a.signedId = `signed-${a.contentHash.slice(0, 16)}`;
  return a;
}

async function seedRealNodeChain(ws: string): Promise<{ receiptPath: string; txId: string }> {
  const art = path.join(ws, ".hardkas", "artifacts");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const txId = "dc228d614488471f0804f368e8ddee605c9993624bf17b6805688df214ca32aa";
  const plan = seal(
    { schema: "hardkas.txPlan", networkId: "simnet", mode: "localnet", lineage: { artifactId: "", sequence: 1 } },
    "planId"
  );
  const signed = seal(
    {
      schema: "hardkas.signedTx",
      txId,
      networkId: "simnet",
      mode: "localnet",
      lineage: { artifactId: "", parentArtifactId: plan.contentHash, lineageId: plan.contentHash, rootArtifactId: plan.contentHash, sequence: 2 }
    },
    "signedId"
  );
  const receipt = seal({
    schema: "hardkas.txReceipt",
    txId,
    networkId: "simnet",
    mode: "localnet",
    execution: { mode: "localnet", domain: "kaspa-l1", network: "simnet" },
    lineage: { artifactId: "", parentArtifactId: signed.contentHash, lineageId: plan.contentHash, rootArtifactId: plan.contentHash, sequence: 3 }
  });
  await writeJson(path.join(art, `${timestamp}-plan-${plan.contentHash.slice(0, 16)}.plan.json`), plan);
  await writeJson(path.join(art, "signed", `signedTx-${signed.contentHash}.json`), signed);
  const receiptPath = path.join(art, "receipts", `txReceipt-${receipt.contentHash}.json`);
  await writeJson(receiptPath, receipt);
  return { receiptPath, txId };
}

async function seedSimulatorChain(ws: string): Promise<{ receiptPath: string }> {
  const art = path.join(ws, ".hardkas", "artifacts");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const plan = seal(
    { schema: "hardkas.txPlan", mode: "simulator", networkId: "simulated", lineage: { artifactId: "", sequence: 1 } },
    "planId"
  );
  const receipt = seal({
    schema: "hardkas.txReceipt",
    mode: "simulator",
    networkId: "simulated",
    execution: { mode: "simulator", domain: "kaspa-l1", network: "simulated" },
    lineage: { artifactId: "", parentArtifactId: plan.contentHash, lineageId: plan.contentHash, rootArtifactId: plan.contentHash, sequence: 2 }
  });
  await writeJson(path.join(art, `${timestamp}-plan-sim.plan.json`), plan);
  const receiptPath = path.join(art, "receipts", `txReceipt-${receipt.contentHash}.json`);
  await writeJson(receiptPath, receipt);
  return { receiptPath };
}

async function listReplayReports(ws: string): Promise<string[]> {
  const art = path.join(ws, ".hardkas", "artifacts");
  const collected: string[] = [];
  const walk = async (dir: string) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && e.name.endsWith(".replay.json")) {
        collected.push(full);
      }
    }
  };
  await walk(art);
  return collected;
}

describe("Wave 7 · REPLAY-MODE-1 · SDK mode guard", () => {
  let ws: string;

  beforeEach(async () => {
    ws = await makeWorkspace();
  });

  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  it("real-node (mode='localnet') receipt returns REPLAY_MODE_UNSUPPORTED", async () => {
    const { receiptPath } = await seedRealNodeChain(ws);
    const sdk = await Hardkas.open({ cwd: ws });

    const result = await sdk.replay.verify({ path: receiptPath });
    expect(result.passed).toBe(false);
    expect(result.code).toBe("REPLAY_MODE_UNSUPPORTED");
    expect(result.error).toContain("localnet");
    expect(result.error).toContain("simulator");
  });

  it("real-node receipt preserves lineage and integrity signals in the unsupported result", async () => {
    const { receiptPath } = await seedRealNodeChain(ws);
    const sdk = await Hardkas.open({ cwd: ws });

    const result = await sdk.replay.verify({ path: receiptPath });
    // Lineage was resolved successfully — we know the receipt IS reachable.
    expect(result.lineage).toBe("valid");
    // Artifact contentHash integrity is a static check, unaffected by the
    // execution guard. Wave 7 preserves whatever it evaluated to.
    expect(result.determinism).toMatch(/^(verified|failed)$/);
    expect(result.contamination).toBe("clean");
    // 3-node chain resolved (plan + signed + receipt).
    expect(result.artifactsScanned).toBe(3);
  });

  it("real-node receipt never enters simulator execution (no replay report file emitted)", async () => {
    const { receiptPath } = await seedRealNodeChain(ws);
    const sdk = await Hardkas.open({ cwd: ws });

    const reportsBefore = await listReplayReports(ws);
    expect(reportsBefore).toEqual([]);

    await sdk.replay.verify({ path: receiptPath });

    // The simulator execution path in HardkasReplay.verify writes a
    // `<timestamp>-<txId>.replay.json` file after `verifyReplay` returns.
    // If the guard is missing, that file materialises. Wave 7 must not
    // produce it for unsupported-mode receipts.
    const reportsAfter = await listReplayReports(ws);
    expect(reportsAfter).toEqual([]);
  });

  it("real-node receipt is NOT classified as diverged or non_deterministic", async () => {
    const { receiptPath } = await seedRealNodeChain(ws);
    const sdk = await Hardkas.open({ cwd: ws });

    const result = await sdk.replay.verify({ path: receiptPath });
    // Pre-Wave-7 this would have been:
    //   report = { checks: { workflowDeterministic: "diverged", ... }, ... }
    // with 12 misleading divergence entries. Post-Wave-7 the report is null
    // because verifyReplay was never called.
    expect(result.report).toBeNull();
  });

  it("simulator-mode receipt still reaches the execution path (guard is scoped)", async () => {
    const { receiptPath } = await seedSimulatorChain(ws);
    const sdk = await Hardkas.open({ cwd: ws });

    const result = await sdk.replay.verify({ path: receiptPath });
    // Guard did NOT fire for simulator receipts.
    expect(result.code).not.toBe("REPLAY_MODE_UNSUPPORTED");
    // Either the run enters simulator execution and produces a report,
    // or it fails on another cause (e.g. schema gaps on the synthetic
    // fixture) — but the specific unsupported-mode short-circuit must NOT
    // be what happened.
  });
});
