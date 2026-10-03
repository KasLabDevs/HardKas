import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

vi.setConfig({ testTimeout: 60_000 });

// SNAPSHOT-CREATE-EXISTING-1 (reproduced 2026-10-03 with the built CLI): `snapshot create` wrote in place into
// snapshots/<name>, so re-creating s1 after the store changed left the union of both generations (E1); a re-create that
// failed after copying left that union under the old manifest (E2); and a read error was counted as "corrupted" while
// the create succeeded without the artifact (E3).
//   SNAPSHOT-CREATE-ATOMIC-1: `snapshot create <name>` succeeds only if it publishes a complete snapshot of the
//   artifacts it enumerated, as one generation; a failure publishes nothing and never modifies an existing snapshot.
// Not claimed here: temporal consistency against concurrent writers (SNAPSHOT-CREATE-CONCURRENCY-1).
// The SDK workspace is a double; the snapshot code and the files are real; I/O failures are injected on node:fs/promises.

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
        }
      })
    }
  };
});

import { runSnapshotCreate } from "../src/runners/snapshot-create-runner.js";

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

const artifacts = () => path.join(h.root, ".hardkas", "artifacts");
const snapshots = () => path.join(h.root, "snapshots");
const s1 = () => path.join(snapshots(), "s1");
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
const tempResidues = () => (fs.existsSync(snapshots()) ? fs.readdirSync(snapshots()).filter((n) => n.startsWith(".s1.tmp-")) : []);
const create = () => runSnapshotCreate({ name: "s1", workspaceRoot: h.root, consensusValidated: false, json: true });
const posix = (p: unknown) => String(p).replace(/\\/g, "/");
const ioError = (code: string, p: unknown) => Object.assign(new Error(`${code}: simulated, ${String(p)}`), { code });

beforeEach(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-snapshot-create-"));
  for (const [rel, schema] of FIXTURE) put(rel, schema);
  vi.spyOn(console, "log").mockImplementation(() => {}); // `snapshot create --json` prints its manifest with console.log
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(h.root, { recursive: true, force: true });
});

describe("SNAPSHOT-CREATE-ATOMIC-1 · an existing snapshot is never modified", () => {
  it("an existing s1 is refused with SNAPSHOT_EXISTS and not one byte of it changes", async () => {
    await create();
    const before = tree(snapshots());
    await expect(create()).rejects.toMatchObject({ code: "SNAPSHOT_EXISTS" });
    expect(tree(snapshots())).toEqual(before);
    expect(tempResidues()).toEqual([]);
  });

  it("E1 · after the store changed, re-creating s1 is refused: s1 stays the first generation, no union", async () => {
    await create();
    const first = tree(s1());
    fs.rmSync(path.join(artifacts(), "plans", "txPlan-1.json"));
    fs.rmSync(path.join(artifacts(), "receipts", "txReceipt-1.json"));
    for (const rel of ["plans/txPlan-3.json", "signed/signedTx-3.json", "receipts/txReceipt-3.json", "misc/snapshot-5.json", "synthetic-c.trace.json"]) {
      put(rel, "hardkas.later");
    }
    await expect(create()).rejects.toMatchObject({ code: "SNAPSHOT_EXISTS" });
    expect(tree(s1())).toEqual(first);
  });

  it("E2 · a re-create meeting a read-only manifest (crash stand-in) leaves the previous s1 byte-identical", async () => {
    await create();
    const first = tree(s1());
    put("plans/txPlan-3.json", "hardkas.txPlan");
    const manifest = path.join(s1(), "manifest.json");
    fs.chmodSync(manifest, 0o444);
    try {
      await expect(create()).rejects.toMatchObject({ code: "SNAPSHOT_EXISTS" });
    } finally {
      fs.chmodSync(manifest, 0o644);
    }
    expect(tree(s1())).toEqual(first);
    expect(tempResidues()).toEqual([]);
  });

  it("an s1 that appears while the snapshot is being built is never replaced", async () => {
    const realMkdir = fsp.mkdir.bind(fsp);
    let raced = false;
    vi.spyOn(fsp, "mkdir").mockImplementation((async (p: fs.PathLike, opts?: any) => {
      if (!raced && path.basename(String(p)).startsWith(".s1.tmp-")) {
        raced = true; // another process publishes its own s1 right after our existence check
        fs.mkdirSync(s1(), { recursive: true });
        fs.writeFileSync(path.join(s1(), "manifest.json"), '{"racer":true}\n');
        fs.writeFileSync(path.join(s1(), "racer.txt"), "not ours\n");
      }
      return realMkdir(p, opts);
    }) as any);
    await expect(create()).rejects.toMatchObject({ code: "SNAPSHOT_EXISTS" });
    expect(raced, "the race was injected").toBe(true);
    expect(Object.keys(tree(s1())).sort()).toEqual(["manifest.json", "racer.txt"]);
    expect(fs.readFileSync(path.join(s1(), "manifest.json"), "utf-8")).toBe('{"racer":true}\n');
    expect(tempResidues()).toEqual([]);
  });
});

describe("SNAPSHOT-CREATE-ATOMIC-1 · a failed create publishes nothing", () => {
  it.each(["EBUSY", "EACCES", "ENOENT"])("E3 · %s while reading an artifact aborts the create: no s1, no temp left", async (code) => {
    const realReadFile = fsp.readFile.bind(fsp);
    vi.spyOn(fsp, "readFile").mockImplementation((async (p: any, opts?: any) => {
      if (posix(p).endsWith("/.hardkas/artifacts/receipts/txReceipt-2.json")) throw ioError(code, p);
      return realReadFile(p, opts);
    }) as any);
    await expect(create()).rejects.toMatchObject({ code: "SNAPSHOT_CREATE_FAILED" });
    expect(fs.existsSync(s1()), "nothing published as s1").toBe(false);
    expect(tempResidues()).toEqual([]);
  });

  it("a copy error during a first create publishes nothing and leaves no temp", async () => {
    const realCopy = fsp.copyFile.bind(fsp);
    const realWrite = fsp.writeFile.bind(fsp);
    const intoTemp = (p: unknown) => posix(p).includes("/.s1.tmp-") && posix(p).endsWith("/signed/signedTx-1.json");
    vi.spyOn(fsp, "copyFile").mockImplementation((async (src: any, dest: any, mode?: any) => {
      if (posix(src).endsWith("/signed/signedTx-1.json") && !posix(dest).includes("/.hardkas/")) throw ioError("EACCES", dest);
      return realCopy(src, dest, mode);
    }) as any);
    vi.spyOn(fsp, "writeFile").mockImplementation((async (p: any, data: any, opts?: any) => {
      if (intoTemp(p)) throw ioError("EACCES", p);
      return realWrite(p, data, opts);
    }) as any);
    await expect(create()).rejects.toMatchObject({ code: "SNAPSHOT_CREATE_FAILED" });
    expect(fs.existsSync(s1())).toBe(false);
    expect(tempResidues()).toEqual([]);
  });

  it("a failed manifest write during a first create publishes nothing (no manifest-less or partial s1)", async () => {
    const realWrite = fsp.writeFile.bind(fsp);
    vi.spyOn(fsp, "writeFile").mockImplementation((async (p: any, data: any, opts?: any) => {
      if (path.basename(String(p)) === "manifest.json") throw ioError("ENOSPC", p);
      return realWrite(p, data, opts);
    }) as any);
    await expect(create()).rejects.toMatchObject({ code: "SNAPSHOT_CREATE_FAILED" });
    expect(fs.existsSync(s1())).toBe(false);
    expect(tempResidues()).toEqual([]);
  });

  it("if the temp cannot be removed, the create error is still the one reported and the residue is never s1", async () => {
    const realReadFile = fsp.readFile.bind(fsp);
    vi.spyOn(fsp, "readFile").mockImplementation((async (p: any, opts?: any) => {
      if (posix(p).endsWith("/.hardkas/artifacts/plans/txPlan-2.json")) throw ioError("EBUSY", p);
      return realReadFile(p, opts);
    }) as any);
    vi.spyOn(fsp, "rm").mockImplementation((async (p: any) => {
      throw ioError("EPERM", p);
    }) as any);
    const err: any = await create().then(() => undefined, (e) => e);
    expect(err?.code).toBe("SNAPSHOT_CREATE_FAILED");
    expect(String(err?.message)).toMatch(/EBUSY/);
    expect(fs.existsSync(s1())).toBe(false);
    expect(tempResidues()).toHaveLength(1);
  });
});

describe("controls", () => {
  it("a successful create publishes s1 whole: every artifact, manifest counts equal to the files, no temp left", async () => {
    await create();
    const store = tree(artifacts());
    expect(tree(path.join(s1(), "artifacts"))).toEqual(store);
    const manifest = JSON.parse(fs.readFileSync(path.join(s1(), "manifest.json"), "utf-8"));
    expect(manifest.includedArtifacts).toBe(Object.keys(store).length);
    expect(tempResidues()).toEqual([]);
  });

  it("C · a non-hardkas JSON is excluded and an unparseable file counted corrupted: neither aborts the create", async () => {
    fs.writeFileSync(path.join(artifacts(), "misc", "other.json"), '{"schema":"something.else"}\n');
    fs.writeFileSync(path.join(artifacts(), "misc", "broken.json"), "{ not json\n");
    await create();
    const manifest = JSON.parse(fs.readFileSync(path.join(s1(), "manifest.json"), "utf-8"));
    expect(manifest).toMatchObject({ includedArtifacts: 12, excludedArtifacts: 1, corruptedArtifacts: 1 });
    expect(Object.keys(tree(path.join(s1(), "artifacts")))).toHaveLength(12);
  });
});
