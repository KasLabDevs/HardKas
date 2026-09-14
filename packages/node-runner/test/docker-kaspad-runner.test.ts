import { describe, it, expect, vi, beforeEach } from "vitest";
import { DockerKaspadRunner, minerContainerNameFor } from "../src/docker-kaspad-runner";
import { verifyNodeIdentity } from "../src/identity";
import { KASPAD_REFERENCE_IMAGE, CANONICAL_LOCALNET, CANONICAL_NODE_EXPECTATION } from "@hardkas/core";
import { execa } from "execa";
import { waitForKaspaRpcReady, checkKaspaRpcHealth } from "@hardkas/kaspa-rpc";
import net from "node:net";

vi.mock("execa", () => ({
  execa: vi.fn()
}));
vi.mock("../src/identity", () => ({
  verifyNodeIdentity: vi.fn()
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
    const runCall = vi.mocked(execa).mock.calls.find((c) => c[1]?.[0] === "run");
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

  it("refuses, and starts nothing, when a port is held by something that is not its container", async () => {
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

    await expect(runner.start()).rejects.toMatchObject({ code: "NODE_PORT_OCCUPIED" });

    // Should NOT have called docker run
    const runCall = vi.mocked(execa).mock.calls.find((c) => c[1]?.[0] === "run");
    expect(runCall).toBeUndefined();
  });

  it("does not trust a running container on its canonical name alone", async () => {
    const runner = new DockerKaspadRunner();
    vi.mocked(execa).mockResolvedValue({ stdout: "running" } as any); // status(): container 'running'
    vi.mocked(checkKaspaRpcHealth).mockResolvedValue({ ready: true } as any);
    vi.mocked(verifyNodeIdentity).mockResolvedValue({
      verified: false,
      problems: ["container image sha256:bad does not carry the expected digest"],
      expected: CANONICAL_NODE_EXPECTATION
    } as any);

    await expect(runner.start()).rejects.toMatchObject({ code: "NODE_IDENTITY_UNVERIFIED" });
  });

  it("adopts a running canonical container that proves its identity", async () => {
    const runner = new DockerKaspadRunner();
    vi.mocked(execa).mockResolvedValue({ stdout: "running" } as any);
    vi.mocked(checkKaspaRpcHealth).mockResolvedValue({ ready: true } as any);
    vi.mocked(verifyNodeIdentity).mockResolvedValue({ verified: true, problems: [], expected: CANONICAL_NODE_EXPECTATION } as any);

    const status = await runner.start();
    expect(status.running).toBe(true);
    expect(vi.mocked(verifyNodeIdentity)).toHaveBeenCalledTimes(1);
  });

  it("fails without Docker unless a simulated node is explicitly allowed", async () => {
    vi.mocked(execa).mockImplementation(((file: string, args: string[]) =>
      args?.[0] === "version" ? Promise.reject(new Error("daemon not running")) : Promise.reject(new Error("No such object"))) as any);

    await expect(new DockerKaspadRunner().start()).rejects.toThrow(/DOCKER_UNAVAILABLE/);

    const simulated = await new DockerKaspadRunner({ allowSimulatedFallback: true }).start();
    expect(simulated.running).toBe(true);
  });

  it("uses the canonical node and miner names", () => {
    const runner = new DockerKaspadRunner();
    // @ts-ignore - accessing private property for test
    expect(runner.options.containerName).toBe(CANONICAL_LOCALNET.containerName);
    expect(minerContainerNameFor(CANONICAL_LOCALNET.containerName)).toBe(CANONICAL_LOCALNET.minerContainerName);
    expect(runner.expectedIdentity()?.imageDigest).toBe(CANONICAL_LOCALNET.imageDigest);
  });

  it("should use the default pinned image if none provided", () => {
    const runner = new DockerKaspadRunner();
    // @ts-ignore - accessing private property for test
    expect(runner.options.image).toBe(process.env.HARDKAS_KASPAD_IMAGE ?? KASPAD_REFERENCE_IMAGE);
  });

  it("pins the reference image by version and digest", () => {
    expect(KASPAD_REFERENCE_IMAGE).toMatch(/^kaspanet\/rusty-kaspad:v\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
  });

  it("should stop the container if it exists", async () => {
    const runner = new DockerKaspadRunner({ containerName: "stop-me" });
    vi.mocked(execa).mockResolvedValue({} as any);

    await runner.stop();

    expect(execa).toHaveBeenCalledWith("docker", ["stop", "stop-me"]);
    // (no miner configured, so only the node is stopped)
    expect(execa).toHaveBeenCalledWith("docker", ["rm", "stop-me"]);
  });
});
