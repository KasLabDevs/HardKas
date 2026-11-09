// SC-02 · silverc is started from a private copy of the bytes that matched the pin, never from the toolchain path.
//
// Before: resolveManagedSilverc() hashed HARDKAS_HOME/toolchains/silverc/<v>/silverc(.exe) and runSilverc() then started
// that path with execFile; a process of the same user could swap the file (or drop a DLL next to it) in between. Now the
// file is read once, hashed against the pin, copied to HARDKAS_HOME/run/silverc/silverc-XXXX/ and hashed again right
// before the start (staged-executable.ts, the staging the SilverScript runner already used).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stagePinnedExecutable } from "../src/staged-executable.js";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

const codes = { mismatchCode: "T_MISMATCH", changedCode: "T_CHANGED", stageFailedCode: "T_STAGE" } as const;

describe("SC-02 · silverc starts from a verified private copy", () => {
  let work: string;
  beforeEach(() => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-stage-"));
  });
  afterEach(() => {
    fs.rmSync(work, { recursive: true, force: true });
  });

  it("silverscript.ts never starts the toolchain path itself (it starts the staged copy)", () => {
    const text = fs.readFileSync(path.join(SRC, "silverscript.ts"), "utf8");
    // the start site: execFile's first argument
    const starts = [...text.matchAll(/execFile\(\s*([^,\s]+)\s*,/g)].map((m) => m[1]);
    expect(starts.length).toBeGreaterThan(0);
    expect(starts).not.toContain("silverc.path");
    expect(starts.every((s) => s === "staged.path")).toBe(true);
    expect(text).toMatch(/stagePinnedExecutable\(/);
  });

  it("the copy holds the pinned bytes even when the source is replaced after staging", () => {
    const source = path.join(work, "tool.exe");
    fs.writeFileSync(source, "pinned-bytes");
    const staged = stagePinnedExecutable({
      source,
      expectedSha256: sha("pinned-bytes"),
      stageRoot: path.join(work, "run", "tool"),
      fileName: "tool.exe",
      label: "tool",
      ...codes
    });
    try {
      expect(path.dirname(path.dirname(staged.path))).toBe(path.join(work, "run", "tool"));
      expect(staged.path).not.toBe(source);
      // the swap the TOCTOU window allowed: it no longer reaches what starts
      fs.writeFileSync(source, "attacker-bytes");
      staged.verify();
      expect(fs.readFileSync(staged.path, "utf8")).toBe("pinned-bytes");
      expect(staged.sha256).toBe(sha("pinned-bytes"));
    } finally {
      staged.cleanup();
    }
    expect(fs.existsSync(path.dirname(staged.path))).toBe(false);
  });

  it("refuses a source that does not match the pin, and makes no copy", () => {
    const source = path.join(work, "tool.exe");
    fs.writeFileSync(source, "something-else");
    const stageRoot = path.join(work, "run", "tool");
    expect(() =>
      stagePinnedExecutable({ source, expectedSha256: sha("pinned-bytes"), stageRoot, fileName: "tool.exe", label: "tool", ...codes })
    ).toThrow(expect.objectContaining({ code: "T_MISMATCH" }));
    expect(fs.existsSync(stageRoot) ? fs.readdirSync(stageRoot) : []).toEqual([]);
  });

  it("verify() refuses a copy that changed before the start", () => {
    const source = path.join(work, "tool.exe");
    fs.writeFileSync(source, "pinned-bytes");
    const staged = stagePinnedExecutable({
      source,
      expectedSha256: sha("pinned-bytes"),
      stageRoot: path.join(work, "run", "tool"),
      fileName: "tool.exe",
      label: "tool",
      ...codes
    });
    try {
      fs.writeFileSync(staged.path, "swapped-copy");
      expect(() => staged.verify()).toThrow(expect.objectContaining({ code: "T_CHANGED" }));
    } finally {
      staged.cleanup();
    }
  });

  it("each staging gets its own new directory", () => {
    const source = path.join(work, "tool.exe");
    fs.writeFileSync(source, "pinned-bytes");
    const opts = { source, expectedSha256: sha("pinned-bytes"), stageRoot: path.join(work, "run", "tool"), fileName: "tool.exe", label: "tool", ...codes };
    const a = stagePinnedExecutable(opts);
    const b = stagePinnedExecutable(opts);
    try {
      expect(path.dirname(a.path)).not.toBe(path.dirname(b.path));
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });
});
