import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { acquireLock } from "@hardkas/core";

vi.setConfig({ testTimeout: 60_000 });

// SNAPSHOT-REPLAY-UNIT-1 (phase 2B of SNAPSHOT-CREATE-CONCURRENCY-1): no cooperative writer can introduce, and no
// cooperative reader can observe, a mutation of the artifact store between the replay's check (preflight) and its last
// restore. Measured before the fix (2026-10-03, cut23 runs/units-2): the replay restores in alphabetical order, so for a
// moment a receipt is in the store without the signed artifact it descends from (verify: PARENT_MISSING), and each
// restore took the store separately. The projection rebuild that follows is outside the unit. The SDK workspace and the
// query store are doubles; the snapshot code, the store gate, the locks and the files are real.

const h = vi.hoisted(() => ({ root: "" }));

vi.mock("@hardkas/sdk", async () => {
  const p = await import("node:path");
  return {
    Hardkas: {
      open: async () => ({
        workspace: {
          root: h.root,
          hardkasDir: p.join(h.root, ".hardkas"),
          resolvePath: (...segments: string[]) => p.resolve(h.root, ...segments)
        },
        close: async () => {}
      })
    }
  };
});
vi.mock("@hardkas/query-store", () => ({
  HardkasStore: class {
    connect() {}
    getDatabase() { return {}; }
  },
  HardkasIndexer: class {
    async rebuild() { return { ok: true, errors: [], artifacts: { indexed: 0 }, events: { indexed: 0 } }; }
  }
}));

import { runSnapshotCreate } from "../src/runners/snapshot-create-runner.js";
import { runSnapshotReplay } from "../src/runners/snapshot-replay-runner.js";
import { createCommandOutput, setGlobalOutput } from "../src/output.js";

const CHAINS = 6;
const hex = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const artifacts = () => path.join(h.root, ".hardkas", "artifacts");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Writes CHAINS plan → signed → receipt chains, each artifact naming its parent by content hash. */
function writeChains(): string[] {
  const rels: string[] = [];
  for (let i = 1; i <= CHAINS; i++) {
    const plan = { schema: "hardkas.txPlan", contentHash: hex(`plan-${i}`) };
    const signed = { schema: "hardkas.signedTx", contentHash: hex(`signed-${i}`), lineage: { parentArtifactId: plan.contentHash } };
    const receipt = { schema: "hardkas.txReceipt", contentHash: hex(`receipt-${i}`), lineage: { parentArtifactId: signed.contentHash } };
    for (const [rel, body] of [[`plans/txPlan-${i}.json`, plan], [`signed/signedTx-${i}.json`, signed], [`receipts/txReceipt-${i}.json`, receipt]] as const) {
      const p = path.join(artifacts(), rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(body, null, 2) + "\n");
      rels.push(rel);
    }
  }
  return rels;
}
/** Receipts in the store whose signed parent is not in the store (what verify reports as PARENT_MISSING). */
function danglingReceipts(): string[] {
  const read = (dir: string) =>
    fs.existsSync(path.join(artifacts(), dir))
      ? fs.readdirSync(path.join(artifacts(), dir)).filter((f) => f.endsWith(".json")).map((f) => ({ f: `${dir}/${f}`, j: JSON.parse(fs.readFileSync(path.join(artifacts(), dir, f), "utf-8")) }))
      : [];
  const signed = new Set(read("signed").map((x) => x.j.contentHash));
  return read("receipts").filter((x) => !signed.has(x.j.lineage?.parentArtifactId)).map((x) => x.f);
}
/** Resolves the first time someone finds lockFile taken (an exclusive create that meets EEXIST): a waiter is waiting. */
function onContention(lockFile: string): Promise<void> {
  const original = fs.openSync;
  return new Promise((resolve) => {
    vi.spyOn(fs, "openSync").mockImplementation(((...args: Parameters<typeof fs.openSync>) => {
      try {
        return original.apply(fs, args);
      } catch (e: any) {
        if (e?.code === "EEXIST" && path.resolve(String(args[0])) === path.resolve(lockFile)) resolve();
        throw e;
      }
    }) as typeof fs.openSync);
  });
}

const create = () => runSnapshotCreate({ name: "s1", workspaceRoot: h.root, consensusValidated: false, json: true });
const replay = () => runSnapshotReplay({ name: "s1", json: true, workspaceRoot: h.root });

beforeEach(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-snapshot-replay-unit-"));
  setGlobalOutput(createCommandOutput({ mode: "json", stdout: { write: () => {} }, stderr: { write: () => {} } }));
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(h.root, { recursive: true, force: true });
});

describe("SNAPSHOT-REPLAY-UNIT-1 · replay holds the store from its check to its last restore", () => {
  it("a cooperative reader that looks during the replay never sees a receipt without its signed parent", async () => {
    const rels = writeChains();
    await create();
    for (const rel of rels) fs.rmSync(path.join(artifacts(), rel));

    let done = false;
    const replaying = replay().finally(() => {
      done = true;
    });
    // the reader starts once the replay has begun to restore, and looks whenever it can take the store
    while (!fs.existsSync(path.join(artifacts(), "plans", "txPlan-1.json")) && !done) await sleep(1);
    const seen: string[] = [];
    let looks = 0;
    while (!done) {
      const reader = await acquireLock({ rootDir: h.root, name: "artifacts", command: "a reader (test)", wait: true, pollMs: 1, timeoutMs: 30_000 });
      try {
        looks++;
        seen.push(...danglingReceipts());
      } finally {
        await reader.release();
      }
      await sleep(0);
    }
    await replaying;
    expect(looks).toBeGreaterThan(0);
    expect(seen, "receipts seen without their signed parent").toEqual([]);
    expect(danglingReceipts()).toEqual([]);
  });

  it("a conflicting artifact written while the replay waits for the store fails it before any restore", async () => {
    const rels = writeChains();
    await create();
    for (const rel of rels) fs.rmSync(path.join(artifacts(), rel));
    // another process holds the store when the replay starts
    const lockFile = path.join(h.root, ".hardkas", "locks", "artifacts.lock");
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(
      lockFile,
      JSON.stringify({ schema: "hardkas.lock.v1", name: "artifacts", pid: process.ppid, command: "another process (test)", cwd: h.root, hostname: os.hostname(), createdAt: new Date().toISOString(), expiresAt: null }, null, 2)
    );
    const waiting = onContention(lockFile);
    const replaying = replay();
    const outcome = replaying.then(() => "restored", (e: any) => e?.code ?? String(e));
    await Promise.race([waiting, replaying.catch(() => {})]);
    // while the replay waits, the holder writes different bytes at a path the snapshot holds, then lets go of the store
    fs.writeFileSync(path.join(artifacts(), "signed", `signedTx-${CHAINS}.json`), JSON.stringify({ schema: "hardkas.signedTx", contentHash: hex("written meanwhile") }, null, 2) + "\n");
    fs.rmSync(lockFile);

    expect(await outcome).toBe("SNAPSHOT_REPLAY_CONFLICT");
    const present = rels.filter((rel) => fs.existsSync(path.join(artifacts(), rel)));
    expect(present, "nothing restored: only the artifact written meanwhile is there").toEqual([`signed/signedTx-${CHAINS}.json`]);
  });
});
