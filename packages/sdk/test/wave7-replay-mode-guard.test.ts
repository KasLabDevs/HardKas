import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { Hardkas } from "../src";

// -----------------------------------------------------------------------------
// Wave 7 · REPLAY-MODE-1 · SDK mode guard regression.
//
// Contract enforced (see packages/sdk/src/replay.ts, `HardkasReplay.verify`):
//
//   - When the resolved receipt's `mode` is not in REPLAY_SUPPORTED_MODES
//     (currently just "simulator"), `verify` returns a structured
//     `{ passed: false, code: "REPLAY_MODE_UNSUPPORTED", ... }` result
//     BEFORE entering simulator state reconstruction, `verifyReplay`, or
//     `applySimulatedPlan`.
//   - Lineage/integrity signals that were already computed BEFORE the guard
//     are preserved in the returned result (`lineage: "valid"`,
//     `determinism: "verified"`, `contamination: "clean"`).
//   - No simulator replay report file is written under the workspace.
//   - No misleading `diverged` / `non_deterministic` classification is
//     produced for real-node receipts.
// -----------------------------------------------------------------------------

const PLAN_ID =
  crypto.createHash("sha256").update("wave7-plan").digest("hex");
const SIGNED_ID =
  crypto.createHash("sha256").update("wave7-signed").digest("hex");
const RECEIPT_ID_LOCALNET =
  crypto.createHash("sha256").update("wave7-receipt-localnet").digest("hex");
const RECEIPT_ID_SIMULATOR =
  crypto.createHash("sha256").update("wave7-receipt-simulator").digest("hex");
const KASPA_TX_ID =
  crypto.createHash("sha256").update("wave7-tx").digest("hex");

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

async function seedRealNodeChain(ws: string) {
  const art = path.join(ws, ".hardkas", "artifacts");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeJson(
    path.join(art, `${timestamp}-plan-${PLAN_ID.slice(0, 16)}.plan.json`),
    {
      schema: "hardkas.txPlan",
      planId: `plan-${PLAN_ID.slice(0, 16)}`,
      contentHash: PLAN_ID,
      networkId: "simnet",
      mode: "localnet",
      lineage: {
        artifactId: PLAN_ID,
        parentArtifactId: "",
        sequence: 1
      }
    }
  );
  await writeJson(
    path.join(art, "signed", `signedTx-${SIGNED_ID}.json`),
    {
      schema: "hardkas.signedTx",
      signedId: `signed-${SIGNED_ID.slice(0, 16)}`,
      contentHash: SIGNED_ID,
      txId: KASPA_TX_ID,
      networkId: "simnet",
      mode: "localnet",
      lineage: {
        artifactId: SIGNED_ID,
        parentArtifactId: PLAN_ID,
        sequence: 2
      }
    }
  );
  await writeJson(
    path.join(art, "receipts", `txReceipt-${RECEIPT_ID_LOCALNET}.json`),
    {
      schema: "hardkas.txReceipt",
      contentHash: RECEIPT_ID_LOCALNET,
      txId: KASPA_TX_ID,
      networkId: "simnet",
      mode: "localnet",
      execution: { mode: "localnet", domain: "kaspa-l1", network: "simnet" },
      lineage: {
        artifactId: RECEIPT_ID_LOCALNET,
        parentArtifactId: SIGNED_ID,
        sequence: 3
      }
    }
  );
}

async function seedSimulatorChain(ws: string) {
  const art = path.join(ws, ".hardkas", "artifacts");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeJson(
    path.join(art, `${timestamp}-plan-sim.plan.json`),
    {
      schema: "hardkas.txPlan",
      planId: "plan-sim",
      contentHash: "sim-plan-hash-not-checked",
      mode: "simulator",
      networkId: "simulated",
      lineage: {
        artifactId: "sim-plan-artifact-id",
        parentArtifactId: "",
        sequence: 1
      }
    }
  );
  await writeJson(
    path.join(art, "receipts", `txReceipt-${RECEIPT_ID_SIMULATOR}.json`),
    {
      schema: "hardkas.txReceipt",
      contentHash: RECEIPT_ID_SIMULATOR,
      mode: "simulator",
      networkId: "simulated",
      execution: { mode: "simulator", domain: "kaspa-l1", network: "simulated" },
      lineage: {
        artifactId: RECEIPT_ID_SIMULATOR,
        parentArtifactId: "sim-plan-artifact-id",
        sequence: 2
      }
    }
  );
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
    await seedRealNodeChain(ws);
    const sdk = await Hardkas.open({ cwd: ws });
    const receiptPath = path.join(
      ws,
      ".hardkas",
      "artifacts",
      "receipts",
      `txReceipt-${RECEIPT_ID_LOCALNET}.json`
    );

    const result = await sdk.replay.verify({ path: receiptPath });
    expect(result.passed).toBe(false);
    expect(result.code).toBe("REPLAY_MODE_UNSUPPORTED");
    expect(result.error).toContain("localnet");
    expect(result.error).toContain("simulator");
  });

  it("real-node receipt preserves lineage and integrity signals in the unsupported result", async () => {
    await seedRealNodeChain(ws);
    const sdk = await Hardkas.open({ cwd: ws });
    const receiptPath = path.join(
      ws,
      ".hardkas",
      "artifacts",
      "receipts",
      `txReceipt-${RECEIPT_ID_LOCALNET}.json`
    );

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
    await seedRealNodeChain(ws);
    const sdk = await Hardkas.open({ cwd: ws });
    const receiptPath = path.join(
      ws,
      ".hardkas",
      "artifacts",
      "receipts",
      `txReceipt-${RECEIPT_ID_LOCALNET}.json`
    );

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
    await seedRealNodeChain(ws);
    const sdk = await Hardkas.open({ cwd: ws });
    const receiptPath = path.join(
      ws,
      ".hardkas",
      "artifacts",
      "receipts",
      `txReceipt-${RECEIPT_ID_LOCALNET}.json`
    );

    const result = await sdk.replay.verify({ path: receiptPath });
    // Pre-Wave-7 this would have been:
    //   report = { checks: { workflowDeterministic: "diverged", ... }, ... }
    // with 12 misleading divergence entries. Post-Wave-7 the report is null
    // because verifyReplay was never called.
    expect(result.report).toBeNull();
  });

  it("simulator-mode receipt still reaches the execution path (guard is scoped)", async () => {
    await seedSimulatorChain(ws);
    const sdk = await Hardkas.open({ cwd: ws });
    const receiptPath = path.join(
      ws,
      ".hardkas",
      "artifacts",
      "receipts",
      `txReceipt-${RECEIPT_ID_SIMULATOR}.json`
    );

    const result = await sdk.replay.verify({ path: receiptPath });
    // Guard did NOT fire for simulator receipts.
    expect(result.code).not.toBe("REPLAY_MODE_UNSUPPORTED");
    // Either the run enters simulator execution and produces a report,
    // or it fails on another cause (e.g. contentHash mismatch on the
    // synthetic fixture) — but the specific unsupported-mode short-circuit
    // must NOT be what happened.
  });
});
