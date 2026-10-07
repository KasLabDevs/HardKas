import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

vi.setConfig({ testTimeout: 60_000 });

// SNAPSHOT-REPLAY (reproduced 2026-10-03 with the built CLI): `localnet snapshot create` copied only the top-level files
// of .hardkas/artifacts while the store keeps plans/, signed/, receipts/ and misc/ in subfolders, and `snapshot replay`
// deleted the whole store before copying the snapshot back, so even `create → replay` with nothing in between went
// from 12 artifacts to 2, with exit 0 and nothing printed under --json.
//   SNAPSHOT-COMPLETE-1: a snapshot represents, recursively, every artifact present when it is created, at its relative
//   path and with its bytes.
//   SNAPSHOT-NONDESTRUCTIVE-1: replay never removes an artifact.
//   SNAPSHOT-CONFLICT-1: the same path with different bytes in the snapshot and the workspace fails the replay before
//   the store is modified.
// Replay restores what is missing, keeps what is identical and keeps local-only artifacts. The SDK workspace and the
// query store are doubles; the snapshot code and the files are real.

const h = vi.hoisted(() => ({ root: "", storesOpened: [] as string[], rebuilds: 0 }));

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
    constructor(opts: { dbPath: string }) { h.storesOpened.push(opts.dbPath); }
    connect() {}
    getDatabase() { return {}; }
  },
  HardkasIndexer: class {
    async rebuild() { h.rebuilds++; return { ok: true, errors: [], artifacts: { indexed: 0 }, events: { indexed: 0 } }; }
  }
}));

import { runSnapshotCreate } from "../src/runners/snapshot-create-runner.js";
import { runSnapshotReplay } from "../src/runners/snapshot-replay-runner.js";
import { createCommandOutput, setGlobalOutput } from "../src/output.js";

const hex = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
/** The layout the real store produced in the reproduction: 2 top-level traces, 10 artifacts in canonical subfolders. */
const FIXTURE: Array<[string, string]> = [
  ["synthetic-a.trace.json", "hardkas.trace"],
  ["synthetic-b.trace.json", "hardkas.trace"],
  ["plans/txPlan-1.json", "hardkas.txPlan"],
  ["plans/txPlan-2.json", "hardkas.txPlan"],
  ["signed/signedTx-1.json", "hardkas.signedTx"],
  ["signed/signedTx-2.json", "hardkas.signedTx"],
  ["receipts/txReceipt-1.json", "hardkas.txReceipt"],
  ["receipts/txReceipt-2.json", "hardkas.txReceipt"],
  ["misc/snapshot-1.json", "hardkas.snapshot"],
  ["misc/snapshot-2.json", "hardkas.snapshot"],
  ["misc/snapshot-3.json", "hardkas.snapshot"],
  ["misc/snapshot-4.json", "hardkas.snapshot"]
];

let out: string;
let err: string;
const artifacts = () => path.join(h.root, ".hardkas", "artifacts");
function put(rel: string, schema: string, salt = "") {
  const p = path.join(artifacts(), rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ schema, contentHash: hex(rel + salt), body: { rel, salt } }, null, 2) + "\n");
}
/** relative path (posix) → sha256 of the bytes, for every file under dir. */
function tree(dir: string): Record<string, string> {
  const res: Record<string, string> = {};
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else res[path.relative(dir, p).split(path.sep).join("/")] = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    }
  };
  walk(dir);
  return res;
}
const create = () => runSnapshotCreate({ name: "s1", workspaceRoot: h.root, consensusValidated: false, json: true });
const replay = () => runSnapshotReplay({ name: "s1", json: true, workspaceRoot: h.root });

beforeEach(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-snapshot-replay-"));
  h.storesOpened = [];
  h.rebuilds = 0;
  for (const [rel, schema] of FIXTURE) put(rel, schema);
  out = "";
  err = "";
  setGlobalOutput(createCommandOutput({ mode: "json", stdout: { write: (s: string) => { out += s; } }, stderr: { write: (s: string) => { err += s; } } }));
  vi.spyOn(console, "log").mockImplementation(() => {}); // `snapshot create --json` prints its manifest with console.log
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(h.root, { recursive: true, force: true });
});

describe("SNAPSHOT-COMPLETE-1 · create", () => {
  it("captures every artifact of the store, recursively, at its relative path and with its bytes", async () => {
    const store = tree(artifacts());
    expect(Object.keys(store)).toHaveLength(12);
    await create();
    expect(tree(path.join(h.root, "snapshots", "s1", "artifacts"))).toEqual(store);
  });
});

describe("SNAPSHOT-NONDESTRUCTIVE-1 · replay never removes an artifact", () => {
  it("create → replay with nothing in between keeps all 12 artifacts, byte for byte", async () => {
    const before = tree(artifacts());
    await create();
    await replay();
    expect(tree(artifacts())).toEqual(before);
  });

  it("artifacts written after the snapshot survive the replay", async () => {
    await create();
    put("plans/txPlan-3.json", "hardkas.txPlan");
    put("signed/signedTx-3.json", "hardkas.signedTx");
    put("receipts/txReceipt-3.json", "hardkas.txReceipt");
    put("misc/snapshot-5.json", "hardkas.snapshot");
    put("synthetic-c.trace.json", "hardkas.trace");
    const before = tree(artifacts());
    expect(Object.keys(before)).toHaveLength(17);
    await replay();
    expect(tree(artifacts())).toEqual(before);
  });

  it("restores a snapshot artifact that is missing locally, at its relative path with its bytes", async () => {
    const original = tree(artifacts());
    await create();
    fs.rmSync(path.join(artifacts(), "receipts", "txReceipt-1.json"));
    fs.rmSync(path.join(artifacts(), "synthetic-a.trace.json"));
    await replay();
    expect(tree(artifacts())).toEqual(original);
  });
});

describe("SNAPSHOT-CONFLICT-1 · same path, different bytes", () => {
  it("fails before the store is modified: nothing restored, nothing overwritten", async () => {
    await create();
    fs.rmSync(path.join(artifacts(), "plans", "txPlan-1.json")); // would be restored by a successful replay
    put("signed/signedTx-2.json", "hardkas.signedTx", "different bytes"); // conflicts with the snapshot
    const before = tree(artifacts());
    await expect(replay()).rejects.toMatchObject({ code: "SNAPSHOT_REPLAY_CONFLICT" });
    expect(tree(artifacts())).toEqual(before);
    expect(out, "no result document before the error envelope").toBe("");
  });
});

describe("JSON-STREAM-1 · replay --json", () => {
  it("a successful replay prints exactly one JSON result on stdout and none on stderr", async () => {
    await create();
    fs.rmSync(path.join(artifacts(), "plans", "txPlan-2.json"));
    put("receipts/txReceipt-9.json", "hardkas.txReceipt"); // local only
    await replay();
    expect(out.trim(), "stdout carries the result").not.toBe("");
    const doc = JSON.parse(out.trim());
    expect(doc).toMatchObject({ ok: true, snapshot: "s1", restored: 1, identical: 11, localOnlyKept: 1 });
    expect(doc.restoredPaths).toEqual(["plans/txPlan-2.json"]);
    expect(err).not.toMatch(/\{[\s\S]*\}/);
  });
});

describe("projections · replay only refreshes a query store the workspace already has", () => {
  it("without .hardkas/store.db no query store is opened or created", async () => {
    await create();
    await replay();
    expect(h.storesOpened).toEqual([]);
    expect(fs.existsSync(path.join(h.root, ".hardkas", "store.db"))).toBe(false);
  });

  it("with an existing .hardkas/store.db the projection is rebuilt once (control)", async () => {
    const dbPath = path.join(h.root, ".hardkas", "store.db");
    fs.writeFileSync(dbPath, "");
    await create();
    await replay();
    expect(h.storesOpened).toEqual([dbPath]);
    expect(h.rebuilds).toBe(1);
  });
});
