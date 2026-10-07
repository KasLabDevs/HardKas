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

    const status = await runner.stop();

    expect(execa).toHaveBeenCalledWith("docker", ["stop", "stop-me"]);
    // (no miner configured, so only the node is stopped)
    expect(execa).toHaveBeenCalledWith("docker", ["rm", "stop-me"]);
    expect(status.stopped).toBe(true);
  });

  // CLI-RUNTIME-CONTRACT-1: the runner never reports what Docker could not do.
  describe("CLI-RUNTIME-CONTRACT-1 · truthful stop/status/logs/reset", () => {
    const daemonDown = () =>
      vi.mocked(execa).mockImplementation(
        (() => Promise.reject(Object.assign(new Error("error during connect: Get \"http://127.0.0.1:1/v1.47/containers/json\": connection refused"), { exitCode: 1 }))) as any
      );
    const noSuchContainer = () =>
      vi.mocked(execa).mockImplementation(
        (() => Promise.reject(Object.assign(new Error("Error response from daemon: No such container: x"), { exitCode: 1, stderr: "Error: No such object: x" }))) as any
      );

    it("stop(): Docker unavailable is DOCKER_UNAVAILABLE and nothing is stopped or removed", async () => {
      daemonDown();
      await expect(new DockerKaspadRunner({ containerName: "n" }).stop()).rejects.toMatchObject({ code: "DOCKER_UNAVAILABLE" });
      expect(vi.mocked(execa).mock.calls.find((c) => c[1]?.[0] === "stop" || c[1]?.[0] === "rm")).toBeUndefined();
    });

    it("stop(): no container is `stopped: false` and no docker stop/rm is attempted", async () => {
      noSuchContainer();
      const status = await new DockerKaspadRunner({ containerName: "n" }).stop();
      expect(status.stopped).toBe(false);
      expect(status.statusText).toBe("not-found");
      expect(vi.mocked(execa).mock.calls.find((c) => c[1]?.[0] === "stop" || c[1]?.[0] === "rm")).toBeUndefined();
    });

    it("stop(): a `docker stop` that fails for a real reason is an error, never a success", async () => {
      vi.mocked(execa).mockImplementation(((file: string, args: string[]) =>
        args?.[0] === "inspect" ? Promise.resolve({ stdout: "running" } as any) : Promise.reject(Object.assign(new Error("permission denied"), { exitCode: 1 }))) as any);
      vi.mocked(checkKaspaRpcHealth).mockResolvedValue({ ready: false } as any);
      await expect(new DockerKaspadRunner({ containerName: "n" }).stop()).rejects.toThrow(/permission denied/);
    });

    it("status(): Docker unavailable is an error, not a 'not-found' container", async () => {
      daemonDown();
      await expect(new DockerKaspadRunner().status()).rejects.toMatchObject({ code: "DOCKER_UNAVAILABLE" });
    });

    it("logs(): typed codes for a missing container and for Docker unavailable", async () => {
      noSuchContainer();
      await expect(new DockerKaspadRunner({ containerName: "n" }).logs()).rejects.toMatchObject({ code: "NODE_CONTAINER_NOT_FOUND" });
      daemonDown();
      await expect(new DockerKaspadRunner({ containerName: "n" }).logs()).rejects.toMatchObject({ code: "DOCKER_UNAVAILABLE" });
    });

    it("reset(): with Docker unavailable the chain data is not removed", async () => {
      const fsSync = await import("node:fs");
      const os = await import("node:os");
      const path = await import("node:path");
      const cwd = fsSync.mkdtempSync(path.join(os.tmpdir(), "hk-node-runner-reset-"));
      try {
        const marker = path.join(cwd, ".hardkas", "kaspad", "marker.txt");
        fsSync.mkdirSync(path.dirname(marker), { recursive: true });
        fsSync.writeFileSync(marker, "chain data\n");
        daemonDown();
        await expect(new DockerKaspadRunner({ cwd, containerName: "n" }).reset({ removeData: true })).rejects.toMatchObject({ code: "DOCKER_UNAVAILABLE" });
        expect(fsSync.existsSync(marker)).toBe(true);
      } finally {
        fsSync.rmSync(cwd, { recursive: true, force: true });
      }
    });

    it("start(): the Docker check keeps the [DOCKER_UNAVAILABLE] message and carries the code", async () => {
      vi.mocked(execa).mockImplementation(((file: string, args: string[]) =>
        args?.[0] === "version" ? Promise.reject(new Error("daemon not running")) : Promise.reject(new Error("No such object"))) as any);
      await expect(new DockerKaspadRunner().start()).rejects.toMatchObject({ code: "DOCKER_UNAVAILABLE" });
    });
  });
});
