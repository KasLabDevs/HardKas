import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

vi.setConfig({ testTimeout: 60_000 });

// SNAPSHOT-NAME-TRAVERSAL-1 (registered 2026-10-03): `localnet snapshot create <name>` and `snapshot replay <name>`
// resolved `<workspace>/snapshots/<name>` with a bare path.resolve, so a name such as `../.hardkas/artifacts/x`,
// `../elsewhere` or an absolute path created a snapshot, or imported artifacts from a directory, outside `snapshots/`.
// A snapshot name is one plain path segment under `<workspace>/snapshots`; anything else is refused (SNAPSHOT_NAME_INVALID)
// before any file is read or written. The SDK workspace is a double; the snapshot code and the files are real.

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
import { runSnapshotReplay } from "../src/runners/snapshot-replay-runner.js";

const store = () => path.join(h.root, ".hardkas", "artifacts");
const hex = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
function put(dir: string, rel: string) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ schema: "hardkas.txPlan", contentHash: hex(rel) }, null, 2) + "\n");
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
const create = (name: string) => runSnapshotCreate({ name, workspaceRoot: h.root, consensusValidated: false, json: true });
const replay = (name: string) => runSnapshotReplay({ name, workspaceRoot: h.root, json: true });

describe("SNAPSHOT-NAME-TRAVERSAL-1 · a snapshot name is one segment under snapshots/", () => {
  let abs: string;

  beforeEach(() => {
    h.root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-snap-name-"));
    abs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-snap-name-abs-"));
    put(store(), "plans/txPlan-1.json");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(h.root, { recursive: true, force: true });
    fs.rmSync(abs, { recursive: true, force: true });
  });

  it.each([
    ["a parent-relative name", () => "../escaped", () => path.join(h.root, "escaped")],
    ["a name that reaches into the artifact store", () => "../.hardkas/artifacts/x", () => path.join(store(), "x")],
    ["an absolute path", () => path.join(abs, "snap"), () => path.join(abs, "snap")],
    ["a nested name", () => "a/b", () => path.join(h.root, "snapshots", "a")],
    ["a backslash-separated name", () => "a\\b", () => path.join(h.root, "snapshots", "a\\b")],
    ["'.'", () => ".", () => path.join(h.root, "snapshots")],
    ["'..'", () => "..", () => path.join(h.root, "snapshots")]
  ])("create refuses %s and writes nothing", async (_label, name, target) => {
    const storeBefore = tree(store());
    await expect(create(name())).rejects.toMatchObject({ code: "SNAPSHOT_NAME_INVALID" });
    expect(fs.existsSync(target()), "nothing created where the name points").toBe(false);
    expect(tree(store()), "the artifact store is unchanged").toEqual(storeBefore);
    expect(fs.readdirSync(h.root).sort(), "nothing new at the workspace root").toEqual([".hardkas"]);
  });

  it.each([
    ["a parent-relative name", () => "../outside", () => path.join(h.root, "outside")],
    ["an absolute path", () => abs, () => abs]
  ])("replay refuses %s and imports nothing", async (_label, name, planted) => {
    // a complete-looking snapshot outside snapshots/, holding an artifact the store does not have
    fs.mkdirSync(planted(), { recursive: true });
    fs.writeFileSync(path.join(planted(), "manifest.json"), JSON.stringify({ snapshotVersion: 1, createdAt: "2026-10-04T00:00:00.000Z", hardkasVersion: "x", stateAuthority: "filesystem", projectionAuthority: "sqlite", deterministicScope: "local-only", consensusValidated: false, includedArtifacts: 1, excludedArtifacts: 0, corruptedArtifacts: 0 }));
    put(path.join(planted(), "artifacts"), "plans/txPlan-planted.json");
    const storeBefore = tree(store());
    await expect(replay(name())).rejects.toMatchObject({ code: "SNAPSHOT_NAME_INVALID" });
    expect(tree(store()), "nothing imported into the store").toEqual(storeBefore);
  });

  it("a plain name still creates and replays (control)", async () => {
    await create("s1");
    expect(fs.existsSync(path.join(h.root, "snapshots", "s1", "manifest.json"))).toBe(true);
    fs.rmSync(path.join(store(), "plans", "txPlan-1.json"));
    await replay("s1");
    expect(fs.existsSync(path.join(store(), "plans", "txPlan-1.json")), "restored from snapshots/s1").toBe(true);
  });
});
