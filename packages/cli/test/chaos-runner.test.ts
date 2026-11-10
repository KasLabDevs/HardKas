import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  LockHell,
  RotBot,
  DriftHunter,
  HumanChaos
} from "../src/runners/chaos-actors.js";
import { runChaosEngine } from "../src/runners/chaos-runner.js";
import { ChaosExitCodes } from "../src/commands/chaos.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("node:fs/promises", () => {
  return {
    default: {
      rm: vi.fn(),
      mkdir: vi.fn(),
      mkdtemp: vi.fn(),
      writeFile: vi.fn()
    }
  };
});

// ESCALÓN 3 · P20: the run directory the (mocked) mkdtemp hands out; nothing outside it may be removed
const RUN_DIR = path.join(os.tmpdir(), "hardkas-chaos-unit");

vi.mock("../src/runners/chaos-actors.js", () => {
  return {
    LockHell: vi.fn(),
    RotBot: vi.fn(),
    DriftHunter: vi.fn(),
    HumanChaos: vi.fn()
  };
});

describe("Chaos Runner Exit Code & Failure Logic", () => {
  let exitSpy: any;

  beforeEach(() => {
    vi.mocked(fs.rm).mockReset().mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockReset().mockResolvedValue(undefined);
    vi.mocked(fs.mkdtemp).mockReset().mockResolvedValue(RUN_DIR as any);
    vi.mocked(fs.writeFile).mockReset().mockResolvedValue(undefined);

    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  it("should succeed if exitCode is 0 and no raw stack trace is present", async () => {
    vi.mocked(HumanChaos).mockResolvedValue({
      stdout: "Clean execution output",
      stderr: "",
      exitCode: 0,
      action: "Mocked safe action",
      expectedExitCodes: [1]
    });

    await expect(
      runChaosEngine({
        runs: "1",
        seed: "123",
        profile: "smoke",
        isolate: false,
        actor: "HumanChaos"
      })
    ).resolves.toBeUndefined();
  });

  it("should fail if exitCode is non-zero and not in expectedExitCodes", async () => {
    vi.mocked(RotBot).mockResolvedValue({
      stdout: "Error: something failed",
      stderr: "Process crashed unexpectedly",
      exitCode: 2,
      action: "Mocked failing action"
      // no expectedExitCodes returned
    });

    await expect(
      runChaosEngine({
        runs: "1",
        seed: "123",
        profile: "smoke",
        isolate: false,
        actor: "RotBot"
      })
    ).rejects.toMatchObject({ exitCode: ChaosExitCodes.INVARIANT_VIOLATION });
  });

  it("should succeed if exitCode is non-zero but listed in expectedExitCodes", async () => {
    vi.mocked(HumanChaos).mockResolvedValue({
      stdout: "Command not found helper output",
      stderr: "Command 'this-does-not-exist' not found",
      exitCode: 1,
      action: "Mocked expected failure action",
      expectedExitCodes: [1]
    });

    await expect(
      runChaosEngine({
        runs: "1",
        seed: "123",
        profile: "smoke",
        isolate: false,
        actor: "HumanChaos"
      })
    ).resolves.toBeUndefined();
  });

  it("ESCALÓN 3 · P20: the campaign runs in its own temp directory and removes nothing outside it", async () => {
    vi.mocked(HumanChaos).mockClear();
    vi.mocked(HumanChaos).mockResolvedValue({
      stdout: "",
      stderr: "Command 'this-does-not-exist' not found",
      exitCode: 1,
      action: "Mocked expected failure action",
      expectedExitCodes: [1]
    });

    await runChaosEngine({ runs: "2", seed: "7", profile: "smoke", isolate: false, actor: "HumanChaos" });

    expect(vi.mocked(fs.mkdtemp)).toHaveBeenCalledWith(path.join(os.tmpdir(), "hardkas-chaos-"));
    const workspaces = vi.mocked(HumanChaos).mock.calls.map((c) => (c[0] as any).workspaceDir);
    expect(new Set(workspaces)).toEqual(new Set([path.join(RUN_DIR, "workspace")]));
    // `isolate: false` used to run the actors in the current directory itself
    expect(workspaces).not.toContain(process.cwd());
    const removed = vi.mocked(fs.rm).mock.calls.map((c) => String(c[0]));
    expect(removed).toEqual([path.join(RUN_DIR, "workspace")]);
    for (const p of [...removed, ...vi.mocked(fs.mkdir).mock.calls.map((c) => String(c[0]))]) {
      expect(p.startsWith(RUN_DIR + path.sep), p).toBe(true);
    }
    for (const c of vi.mocked(fs.writeFile).mock.calls) expect(String(c[0]).startsWith(path.join(RUN_DIR, "reports"))).toBe(true);
  });

  it("should fail if raw stack trace is detected, even if exitCode is 0", async () => {
    vi.mocked(DriftHunter).mockResolvedValue({
      stdout: "Exception in thread main\n    at Object.run (index.js:10:15)",
      stderr: "",
      exitCode: 0,
      action: "Mocked stack trace action"
    });

    await expect(
      runChaosEngine({
        runs: "1",
        seed: "123",
        profile: "smoke",
        isolate: false,
        actor: "DriftHunter"
      })
    ).rejects.toMatchObject({ exitCode: ChaosExitCodes.INVARIANT_VIOLATION });
  });
});
