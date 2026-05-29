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

vi.mock("node:fs/promises", () => {
  return {
    default: {
      rm: vi.fn(),
      mkdir: vi.fn(),
      writeFile: vi.fn()
    }
  };
});

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
    vi.mocked(fs.rm).mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

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

    await runChaosEngine({
      runs: "1",
      seed: "123",
      profile: "smoke",
      isolate: false,
      actor: "HumanChaos"
    });

    expect(exitSpy).toHaveBeenCalledWith(ChaosExitCodes.NO_FINDINGS);
  });

  it("should fail if exitCode is non-zero and not in expectedExitCodes", async () => {
    vi.mocked(RotBot).mockResolvedValue({
      stdout: "Error: something failed",
      stderr: "Process crashed unexpectedly",
      exitCode: 2,
      action: "Mocked failing action"
      // no expectedExitCodes returned
    });

    await runChaosEngine({
      runs: "1",
      seed: "123",
      profile: "smoke",
      isolate: false,
      actor: "RotBot"
    });

    expect(exitSpy).toHaveBeenCalledWith(ChaosExitCodes.INVARIANT_VIOLATION);
  });

  it("should succeed if exitCode is non-zero but listed in expectedExitCodes", async () => {
    vi.mocked(HumanChaos).mockResolvedValue({
      stdout: "Command not found helper output",
      stderr: "Command 'this-does-not-exist' not found",
      exitCode: 1,
      action: "Mocked expected failure action",
      expectedExitCodes: [1]
    });

    await runChaosEngine({
      runs: "1",
      seed: "123",
      profile: "smoke",
      isolate: false,
      actor: "HumanChaos"
    });

    expect(exitSpy).toHaveBeenCalledWith(ChaosExitCodes.NO_FINDINGS);
  });

  it("should fail if raw stack trace is detected, even if exitCode is 0", async () => {
    vi.mocked(DriftHunter).mockResolvedValue({
      stdout: "Exception in thread main\n    at Object.run (index.js:10:15)",
      stderr: "",
      exitCode: 0,
      action: "Mocked stack trace action"
    });

    await runChaosEngine({
      runs: "1",
      seed: "123",
      profile: "smoke",
      isolate: false,
      actor: "DriftHunter"
    });

    expect(exitSpy).toHaveBeenCalledWith(ChaosExitCodes.INVARIANT_VIOLATION);
  });
});
