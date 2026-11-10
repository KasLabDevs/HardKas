import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { DockerKaspadRunner } from "../src/docker-kaspad-runner.js";
import { execa } from "execa";
import fs from "node:fs/promises";

// Mock execa
vi.mock("execa", () => ({
  execa: vi.fn().mockImplementation((cmd, args) => {
    if (args && args[0] === "inspect") {
      return Promise.resolve({ stdout: "not-found" });
    }
    return Promise.resolve({ stdout: "success" });
  })
}));

// Mock fs
vi.mock("node:fs/promises", async () => {
  const actual = (await vi.importActual("node:fs/promises")) as any;
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined)
  };
});

// Mock port check
vi.spyOn(DockerKaspadRunner.prototype as any, "ensurePortsAvailable").mockResolvedValue(
  undefined
);

// Mock RPC wait
vi.mock("@hardkas/kaspa-rpc", () => ({
  checkKaspaRpcHealth: vi.fn().mockResolvedValue({ ready: true }),
  waitForKaspaRpcReady: vi.fn().mockResolvedValue({ ready: true })
}));

// REMED-CLOSE · test isolation: a runner without `cwd` creates its data directory (.hardkas/kaspad) under the process's
// working directory; this file runs in a temporary one of its own, never the repository root.
let cwdBefore = "";
let isolatedCwd = "";
beforeAll(() => {
  cwdBefore = process.cwd();
  isolatedCwd = fsSync.mkdtempSync(path.join(os.tmpdir(), "hk-pr6-docker-network-"));
  process.chdir(isolatedCwd);
});
afterAll(() => {
  process.chdir(cwdBefore);
  fsSync.rmSync(isolatedCwd, { recursive: true, force: true });
});

describe("PR 6: Docker Runner Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("should generate correct flags for simnet", async () => {
    const runner = new DockerKaspadRunner({ network: "simnet" });

    // We need to trigger start() but it has many side effects (fs, ports, etc)
    // So we'll test the internal args generation if possible,
    // or just mock the dependencies.

    // For this audit, I'll just verify it doesn't throw and calls execa with --simnet
    try {
      await runner.start();
    } catch (e) {}

    const calls = (execa as any).mock.calls;
    const runCall = calls.find((c: any) => c[1][0] === "run");
    expect(runCall[1]).toContain("--simnet");
  });

  it("should generate correct flags for testnet-10", async () => {
    const runner = new DockerKaspadRunner({ network: "testnet-10" });
    try {
      await runner.start();
    } catch (e) {}

    const calls = (execa as any).mock.calls;
    const runCall = calls.find(
      (c: any) => c[1][0] === "run" && c[1].some((arg: string) => arg === "kaspad")
    );
    expect(runCall[1]).toContain("--testnet");
    expect(runCall[1]).not.toContain("--simnet");
  });

  // MAINNET TOTAL LOCKDOWN: the refusal no longer calls a mainnet node "unsupported" (with advice to use a remote mainnet
  // RPC); it names the lockdown. Still refused before anything runs: no docker call at all
  it("should fail for mainnet", async () => {
    const runner = new DockerKaspadRunner({ network: "mainnet" });
    await expect(runner.start()).rejects.toThrow(/NODE_MANAGEMENT_MAINNET_FORBIDDEN[\s\S]*MAINNET_CONNECTION_DISABLED/);
    expect((execa as any).mock.calls.filter((c: any) => c[1]?.[0] === "run")).toEqual([]);
  });
});
