import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../src/index.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";

// -----------------------------------------------------------------------------
// REPLAY-REAL-NODE-1 · `replay verify` of a real-node send (plan → signed → TxSubmission) or of a plan made for a node
// said "Lineage is missing a TxReceipt artifact" (REPLAY_MISSING_DEPENDENCY): correct, but it read as if something were
// lost. It is now the help's own statement, typed REPLAY_MODE_UNSUPPORTED: replay replays simulator runs only, this one
// is a real-node send (or a node plan), nothing runs, and `hardkas verify` / `tx status` are named. A simulator plan
// without its receipt keeps the missing-dependency message (control). The chains are sealed like wave7-replay-mode-guard.
// -----------------------------------------------------------------------------

const TXID = "6f1c2e9a0d4b8c7e5a3f2d1c0b9a8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a19";

async function writeJson(p: string, obj: any) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj), "utf-8");
}

function seal(draft: any, label?: "planId" | "signedId"): any {
  const a: any = { ...draft, hashVersion: CURRENT_HASH_VERSION };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  if (a.lineage) a.lineage.artifactId = a.contentHash;
  if (label === "planId") a.planId = `plan-${a.contentHash.slice(0, 16)}`;
  if (label === "signedId") a.signedId = `signed-${a.contentHash.slice(0, 16)}`;
  return a;
}

async function seedRealSend(ws: string) {
  const art = path.join(ws, ".hardkas", "artifacts");
  const execution = { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" };
  const plan = seal({ schema: "hardkas.txPlan", networkId: "testnet-10", mode: "rpc", execution, lineage: { artifactId: "", sequence: 1 } }, "planId");
  const signed = seal(
    {
      schema: "hardkas.signedTx",
      txId: TXID,
      networkId: "testnet-10",
      mode: "rpc",
      execution,
      lineage: { artifactId: "", parentArtifactId: plan.contentHash, lineageId: plan.contentHash, rootArtifactId: plan.contentHash, sequence: 2 }
    },
    "signedId"
  );
  const submission = seal({
    schema: "hardkas.txSubmission.v1",
    txId: TXID,
    networkId: "testnet-10",
    execution,
    lineage: { artifactId: "", parentArtifactId: signed.contentHash, lineageId: plan.contentHash, rootArtifactId: plan.contentHash, sequence: 3 }
  });
  const planPath = path.join(art, "plans", `txPlan-${plan.contentHash}.json`);
  const submissionPath = path.join(art, "submissions", `txSubmission-${submission.contentHash}.json`);
  await writeJson(planPath, plan);
  await writeJson(path.join(art, "signed", `signedTx-${signed.contentHash}.json`), signed);
  await writeJson(submissionPath, submission);
  return { planPath, submissionPath, submission };
}

describe("REPLAY-REAL-NODE-1 · replay verify of a real-node send says what it is", () => {
  let ws: string;
  beforeEach(async () => {
    ws = await fs.mkdtemp(path.join(os.tmpdir(), "hk-replay-real-"));
    await fs.mkdir(path.join(ws, ".hardkas", "artifacts"), { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  it("a TxSubmission's lineage: REPLAY_MODE_UNSUPPORTED naming the submission, its txId and how to check a real send; nothing runs", async () => {
    const { submissionPath, submission } = await seedRealSend(ws);
    const sdk = await Hardkas.open({ cwd: ws });
    try {
      const r = await sdk.replay.verify({ path: submissionPath });
      expect(r.passed).toBe(false);
      expect(r.code, r.error).toBe("REPLAY_MODE_UNSUPPORTED");
      expect(r.error).toMatch(/replays simulator runs only/);
      expect(r.error).toMatch(/is a real-node send: it records a TxSubmission/);
      expect(r.error).toContain(String(submission.contentHash));
      expect(r.error).toContain(TXID);
      expect(r.error).toMatch(/hardkas verify <submission>/);
      expect(r.error).not.toMatch(/Lineage is missing a TxReceipt/);
      expect(r.report).toBeNull();
    } finally {
      await sdk.close();
    }
  });

  it("a plan made for a node (no submission yet): REPLAY_MODE_UNSUPPORTED naming its execution mode and network", async () => {
    const { planPath } = await seedRealSend(ws);
    const sdk = await Hardkas.open({ cwd: ws });
    try {
      const r = await sdk.replay.verify({ path: planPath });
      expect(r.code, r.error).toBe("REPLAY_MODE_UNSUPPORTED");
      expect(r.error).toMatch(/is a plan for a node \(execution mode rpc, network testnet-10\): the simulator never ran it/);
    } finally {
      await sdk.close();
    }
  });

  it("control: a simulator plan without its receipt still says the receipt is missing", async () => {
    const art = path.join(ws, ".hardkas", "artifacts");
    const plan = seal({ schema: "hardkas.txPlan", mode: "simulator", networkId: "simulated", execution: { mode: "simulator", domain: "kaspa-l1", network: "simulated" }, lineage: { artifactId: "", sequence: 1 } }, "planId");
    const planPath = path.join(art, "plans", `txPlan-${plan.contentHash}.json`);
    await writeJson(planPath, plan);
    const sdk = await Hardkas.open({ cwd: ws });
    try {
      const r = await sdk.replay.verify({ path: planPath });
      expect(r.code).not.toBe("REPLAY_MODE_UNSUPPORTED");
      expect(r.error).toMatch(/Lineage is missing a TxReceipt artifact/);
    } finally {
      await sdk.close();
    }
  });
});
