import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectArtifactStore, writeArtifact, calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import { saveSimulatedTrace } from "@hardkas/localnet";
import { writeSilverRecord } from "../src/runners/silver-records.js";

// ARTIFACT-MUTATION-1 (phase 2A of SNAPSHOT-CREATE-CONCURRENCY-1): a store write by cooperative HardKAS code happens
// under the workspace's `artifacts` lock, so while another holder has it, nothing is written into .hardkas/artifacts;
// the write goes ahead once the holder lets go. A path outside any store is not the gate's business.
// The other holder is a lock file naming a live process that is not this one (the parent), as another process leaves it.

let root: string;
const store = () => path.join(root, ".hardkas", "artifacts");
const lockFile = () => path.join(root, ".hardkas", "locks", "artifacts.lock");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(dir, p).split(path.sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}
function holdArtifacts() {
  fs.mkdirSync(path.dirname(lockFile()), { recursive: true });
  fs.writeFileSync(lockFile(), JSON.stringify({ schema: "hardkas.lock.v1", name: "artifacts", pid: process.ppid, command: "another process", cwd: root, hostname: os.hostname(), createdAt: new Date().toISOString(), expiresAt: null }));
}
/** Runs a write while another holder has `artifacts`: what the store held during the hold, and after the holder left. */
async function underForeignHold(dir: string, write: () => Promise<unknown>) {
  const before = files(dir);
  holdArtifacts();
  const pending = write();
  await sleep(700);
  const duringHold = files(dir);
  fs.unlinkSync(lockFile());
  await pending;
  return { before, duringHold, after: files(dir) };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-mutation-lock-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("ARTIFACT-MUTATION-1 · store writes wait for the artifacts lock", () => {
  it("ProjectArtifactStore.writeArtifact", async () => {
    const draft: any = { schema: "hardkas.txPlan", version: "1.0.0", hashVersion: CURRENT_HASH_VERSION, planId: "plan-0123456789abcdef", networkId: "simnet", mode: "simulated", createdAt: new Date().toISOString() };
    const artifact = { ...draft, contentHash: calculateContentHash(draft, CURRENT_HASH_VERSION) };
    const r = await underForeignHold(store(), () => new ProjectArtifactStore(root).writeArtifact(artifact));
    expect(r.duringHold, "nothing written while another holder has the lock").toEqual(r.before);
    expect(r.after.length).toBe(r.before.length + 1);
  });

  it("writeArtifact (io) to a path inside the store", async () => {
    const target = path.join(store(), "misc", "export-1.json");
    const r = await underForeignHold(store(), () => writeArtifact(target, { schema: "hardkas.export", n: 1 }));
    expect(r.duringHold).toEqual(r.before);
    expect(r.after).toContain("misc/export-1.json");
  });

  it("saveSimulatedTrace (the store-root trace of a simulated tx)", async () => {
    const txId = `synthetic-${"ab".repeat(32)}`;
    const r = await underForeignHold(store(), () => saveSimulatedTrace({ txId, schema: "hardkas.txTrace", steps: [] } as any, { cwd: root }));
    expect(r.duringHold).toEqual(r.before);
    expect(r.after).toContain(`${txId}.trace.json`);
  });

  it("writeSilverRecord into silver/", async () => {
    const out = path.join(store(), "silver", "silverCompile-test.json");
    const r = await underForeignHold(store(), () => writeSilverRecord({ schema: "hardkas.silverCompile.v1", source: "x.sil" }, "silverCompile", out));
    expect(r.duringHold).toEqual(r.before);
    expect(r.after).toContain("silver/silverCompile-test.json");
  });

  it("control: a path outside any artifact store is written at once, the lock is the store's", async () => {
    const outDir = path.join(root, "exports");
    const r = await underForeignHold(outDir, () => writeArtifact(path.join(outDir, "x.json"), { schema: "hardkas.export" }));
    expect(r.duringHold).toContain("x.json");
  });
});
