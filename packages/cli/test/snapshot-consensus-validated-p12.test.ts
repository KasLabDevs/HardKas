import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.setConfig({ testTimeout: 60_000 });

// ESCALÓN 2 · P12 · `localnet snapshot create --consensus-validated` made the snapshot declare itself validated by
// consensus with nothing checked (manifest `consensusValidated: true`, "Consensus Validated: YES"). The option is now
// refused as a usage error before anything is opened or written, core's createSnapshot refuses that scope for every
// caller, and a normal create never says YES. The SDK workspace is a double (as in snapshot-create-atomic.test.ts).

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

import { runSnapshotCreate } from "../src/runners/snapshot-create-runner.js";
import { createSnapshot } from "@hardkas/core";

const snapshots = () => path.join(h.root, "snapshots");

beforeEach(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-p12-snapshot-"));
  fs.mkdirSync(path.join(h.root, ".hardkas", "artifacts"), { recursive: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(h.root, { recursive: true, force: true });
});

describe("ESCALÓN 2 · P12 · no self-declared consensus validation", () => {
  it("--consensus-validated is refused (usage error, SNAPSHOT_CONSENSUS_VALIDATION_UNSUPPORTED) and nothing is written", async () => {
    await expect(runSnapshotCreate({ name: "s1", workspaceRoot: h.root, consensusValidated: true, json: true })).rejects.toMatchObject({
      code: "SNAPSHOT_CONSENSUS_VALIDATION_UNSUPPORTED",
      exitCode: 2
    });
    expect(fs.existsSync(snapshots())).toBe(false);
  });

  it("core's createSnapshot refuses the scope for any caller, before writing", async () => {
    const outputDir = path.join(snapshots(), "s2");
    await expect(
      createSnapshot({ hardkasDir: path.join(h.root, ".hardkas"), outputDir, deterministicScope: "consensus-validated" })
    ).rejects.toMatchObject({ code: "SNAPSHOT_CONSENSUS_VALIDATION_UNSUPPORTED" });
    expect(fs.existsSync(snapshots())).toBe(false);
  });

  it("a normal create is local-only and its output never says Consensus Validated: YES", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
    await runSnapshotCreate({ name: "s3", workspaceRoot: h.root, consensusValidated: false, json: true });
    const manifest = JSON.parse(lines.join("\n"));
    expect(manifest).toMatchObject({ deterministicScope: "local-only", consensusValidated: false });
    const saved = JSON.parse(fs.readFileSync(path.join(snapshots(), "s3", "manifest.json"), "utf8"));
    expect(saved.consensusValidated).toBe(false);
  });
});
