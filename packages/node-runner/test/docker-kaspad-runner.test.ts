import { describe, it, expect, vi, beforeEach } from "vitest";
import { DockerKaspadRunner } from "../src/docker-kaspad-runner";
import { execa } from "execa";
import { waitForKaspaRpcReady, checkKaspaRpcHealth } from "@hardkas/kaspa-rpc";
import net from "node:net";

vi.mock("execa", () => ({
  execa: vi.fn()
}));
// Aligning mock with the package import
vi.mock("@hardkas/kaspa-rpc", () => ({
  waitForKaspaRpcReady: vi.fn(),
  checkKaspaRpcHealth: vi.fn()
}));
vi.mock("node:net");

describe("DockerKaspadRunner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default Socket mock to succeed
    vi.mocked(net.Socket).mockReturnValue({
      setTimeout: vi.fn(),
      once: vi.fn().mockImplementation((event, cb) => {
        if (event === "connect") cb();
      }),
      connect: vi.fn(),
      destroy: vi.fn()
    } as any);
  });

  it("should build the correct docker run command with localhost binding", async () => {
    const runner = new DockerKaspadRunner({
      containerName: "test-node",
      image: "test-image",
      ports: { rpc: 1234 }
    });

    // Mock port availability
    vi.mocked(net.createServer).mockReturnValue({
      once: vi.fn().mockImplementation((event, cb) => {
        if (event === "listening") cb();
        return { close: vi.fn() };
      }),
      listen: vi.fn(),
      close: vi.fn()
    } as any);

    // Mock status to return not running
    vi.mocked(execa).mockResolvedValueOnce({ stdout: "not-found" } as any); // status()
    vi.mocked(execa).mockResolvedValueOnce({} as any); // docker version
    vi.mocked(execa).mockResolvedValueOnce({} as any); // docker rm
    vi.mocked(execa).mockResolvedValueOnce({} as any); // docker run
    vi.mocked(execa).mockResolvedValueOnce({ stdout: "running" } as any); // status() inside loop
    vi.mocked(execa).mockResolvedValueOnce({ stdout: "running" } as any); // status() after start

    // Mock RPC readiness
    vi.mocked(waitForKaspaRpcReady).mockResolvedValue({ ready: true } as any);
    vi.mocked(checkKaspaRpcHealth).mockResolvedValue({ ready: true } as any);

    await runner.start();

    // Check the docker run call
    const runCall = vi.mocked(execa).mock.calls.find(c => c[1]?.[0] === "run");
    expect(runCall).toBeDefined();
    const args = runCall![1];
    expect(args).toContain("test-node");
    expect(args).toContain("test-image");
    expect(args).toContain("127.0.0.1:1234:1234"); // Enforced localhost binding
    expect(args).toContain("--simnet");
  });

  it("should return status even if container doesn't exist", async () => {
    const runner = new DockerKaspadRunner();
    vi.mocked(execa).mockImplementation(() => {
      return Promise.reject(new Error("No such object")) as any;
    });

    const status = await runner.status();
    expect(status.running).toBe(false);
    expect(status.statusText).toBe("not-found");
    expect(status.transports.json.ready).toBe(false);
  });

  it("should fail if a port is already in use", async () => {
    const runner = new DockerKaspadRunner();

    // Mock port 16210 as busy
    vi.mocked(net.createServer).mockReturnValue({
      once: vi.fn().mockImplementation((event, cb) => {
        if (event === "error") cb(new Error("EADDRINUSE"));
        return { close: vi.fn() };
      }),
      listen: vi.fn(),
      close: vi.fn()
    } as any);

    await expect(runner.start()).rejects.toThrow(/Port 16210 is already in use/);
    
    // Should NOT have called docker run
    const runCall = vi.mocked(execa).mock.calls.find(c => c[1]?.[0] === "run");
    expect(runCall).toBeUndefined();
  });

  it("should use the default pinned image if none provided", () => {
    const runner = new DockerKaspadRunner();
    // @ts-ignore - accessing private property for test
    expect(runner.options.image).toBe("kaspanet/rusty-kaspad:v1.1.0");
    // @ts-ignore
    expect(runner.options.image).not.toContain(":latest");
  });

  it("should stop the container if it exists", async () => {
    const runner = new DockerKaspadRunner({ containerName: "stop-me" });
    vi.mocked(execa).mockResolvedValue({} as any);

    await runner.stop();

    expect(execa).toHaveBeenCalledWith("docker", ["stop", "stop-me"]);
    expect(execa).toHaveBeenCalledWith("docker", ["rm", "stop-me"]);
  });
});
