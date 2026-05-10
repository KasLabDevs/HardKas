import { describe, it, expect, vi, beforeEach } from "vitest";
import { DockerKaspadRunner } from "../src/docker-kaspad-runner";
import { execa } from "execa";

vi.mock("execa");

describe("DockerKaspadRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should build the correct docker run command", async () => {
    const runner = new DockerKaspadRunner({
      containerName: "test-node",
      image: "test-image",
      ports: { rpc: 1234 }
    });

    // Mock status to return not running
    vi.mocked(execa).mockResolvedValueOnce({ stdout: "not-found" } as any); // status()
    vi.mocked(execa).mockResolvedValueOnce({} as any); // docker version
    vi.mocked(execa).mockResolvedValueOnce({} as any); // docker rm
    vi.mocked(execa).mockResolvedValueOnce({} as any); // docker run
    vi.mocked(execa).mockResolvedValueOnce({ stdout: "running" } as any); // status() again after start

    await runner.start();

    // Check the docker run call (4th call)
    const runCall = vi.mocked(execa).mock.calls.find(c => c[1]?.[0] === "run");
    expect(runCall).toBeDefined();
    const args = runCall![1];
    expect(args).toContain("test-node");
    expect(args).toContain("test-image");
    expect(args).toContain("1234:1234");
    expect(args).toContain("--simnet");
  });

  it("should return status even if container doesn't exist", async () => {
    const runner = new DockerKaspadRunner();
    vi.mocked(execa).mockRejectedValue(new Error("No such object"));

    const status = await runner.status();
    expect(status.running).toBe(false);
    expect(status.statusText).toBe("not-found");
  });

  it("should stop the container if it exists", async () => {
    const runner = new DockerKaspadRunner({ containerName: "stop-me" });
    vi.mocked(execa).mockResolvedValue({} as any);

    await runner.stop();

    expect(execa).toHaveBeenCalledWith("docker", ["stop", "stop-me"]);
    expect(execa).toHaveBeenCalledWith("docker", ["rm", "stop-me"]);
  });
});
