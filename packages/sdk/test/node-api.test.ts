import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hardkas } from "../src/index.js";
import { HardkasNodeApi } from "../src/node.js";
import { DockerKaspadRunner } from "@hardkas/node-runner";

vi.mock("@hardkas/node-runner", () => {
  return {
    DockerKaspadRunner: vi.fn().mockImplementation(() => {
      return {
        start: vi.fn().mockResolvedValue({ running: true }),
        stop: vi.fn().mockResolvedValue({ running: false }),
        reset: vi.fn().mockResolvedValue({ running: false }),
        status: vi.fn().mockResolvedValue({ running: true }),
        logs: vi.fn().mockResolvedValue("Mock logs"),
      };
    })
  };
});

describe("HardkasNodeApi", () => {
  let sdk: Hardkas;
  
  beforeEach(async () => {
    vi.clearAllMocks();
    sdk = await Hardkas.open({
      cwd: process.cwd(),
      network: "simulated"
    });
  });

  it("should fail to start on mainnet with NODE_MANAGEMENT_MAINNET_FORBIDDEN", async () => {
    const mainnetSdk = await Hardkas.open({
      cwd: process.cwd(),
      network: "mainnet",
      policy: { allowPublic: true }
    });

    await expect(mainnetSdk.node.start()).rejects.toThrow(
      "[NODE_MANAGEMENT_MAINNET_FORBIDDEN]"
    );
  });

  it("should start the node successfully on simnet", async () => {
    const status = await sdk.node.start();
    expect(status.running).toBe(true);
    expect(DockerKaspadRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        network: "simnet"
      })
    );
  });

  it("should configure internal miner when mineTo is provided", async () => {
    const status = await sdk.node.start({ mineTo: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j" });
    expect(status.running).toBe(true);
    expect(DockerKaspadRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        mineTo: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j"
      })
    );
  });

  it("should reset the node when reset option is true", async () => {
    const status = await sdk.node.start({ reset: true });
    expect(status.running).toBe(true);
    
    // We can't directly check the internal runner instance's reset method via the mock easily here
    // without exposing it, but we know it should have been created and called.
    const runnerMockInstance = vi.mocked(DockerKaspadRunner).mock.results[0].value;
    expect(runnerMockInstance.reset).toHaveBeenCalled();
    expect(runnerMockInstance.start).toHaveBeenCalled();
  });

  it("should be able to stop the node", async () => {
    const status = await sdk.node.stop();
    expect(status.running).toBe(false);
  });

  it("should be able to get status", async () => {
    const status = await sdk.node.status();
    expect(status.running).toBe(true);
  });

  it("should handle DOCKER_UNAVAILABLE error mapping", async () => {
    // Override the mock for this specific test
    const mockRunner = {
      start: vi.fn().mockRejectedValue(new Error("[DOCKER_UNAVAILABLE] Docker is missing"))
    };
    vi.mocked(DockerKaspadRunner).mockImplementation(() => mockRunner as any);
    
    await expect(sdk.node.start()).rejects.toThrow(
      "[DOCKER_UNAVAILABLE] Docker is missing"
    );
  });
});
