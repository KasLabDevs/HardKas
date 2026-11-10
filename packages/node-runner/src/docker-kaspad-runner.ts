import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import net from "node:net";
// Using relative paths to avoid resolution issues in restricted environments
import { checkKaspaRpcHealth, waitForKaspaRpcReady } from "@hardkas/kaspa-rpc";
import {
  CANONICAL_LOCALNET,
  CANONICAL_NODE_EXPECTATION,
  KASPAD_REFERENCE_VERSION,
  CPUMINER_REFERENCE_IMAGE,
  assertNodeIdentityVerified,
  type NodeIdentityExpectation,
  type NodeIdentityRecord
} from "@hardkas/core";
import { DockerKaspadOptions, KaspadNodeStatus, KaspadPorts } from "./types.js";
import { verifyNodeIdentity } from "./identity.js";

// The canonical real localnet (see CANONICAL_LOCALNET in @hardkas/core). Every
// HardKAS entry point that manages a node uses these defaults, so there is one
// node lifecycle, one container and one miner.
export const DEFAULT_IMAGE = process.env.HARDKAS_KASPAD_IMAGE ?? CANONICAL_LOCALNET.image;
export const DEFAULT_CONTAINER_NAME = CANONICAL_LOCALNET.containerName;
export const DEFAULT_NETWORK = CANONICAL_LOCALNET.network;
export const DEFAULT_PORTS: KaspadPorts = { ...CANONICAL_LOCALNET.ports };

/** The miner always runs in the node's network namespace, under one name per node. */
export function minerContainerNameFor(nodeContainerName: string): string {
  return nodeContainerName === CANONICAL_LOCALNET.containerName
    ? CANONICAL_LOCALNET.minerContainerName
    : `${nodeContainerName}-miner`;
}

// CLI-RUNTIME-CONTRACT-1 · the runner's typed errors: a `code` for programs and the same code as a
// `[CODE]` prefix for humans and older callers. The runner never reports what Docker could not do.
export const NODE_ERROR_DOCKER_UNAVAILABLE = "DOCKER_UNAVAILABLE";
export const NODE_ERROR_CONTAINER_NOT_FOUND = "NODE_CONTAINER_NOT_FOUND";
export const NODE_ERROR_LOGS_FAILED = "NODE_LOGS_FAILED";
export const NODE_ERROR_DATA_NOT_REMOVED = "NODE_DATA_NOT_REMOVED";

export function nodeRunnerError(code: string, message: string, cause?: unknown): Error & { code: string } {
  return Object.assign(new Error(`[${code}] ${message}`), { code, cause });
}

function errorText(e: unknown): string {
  const err = e as any;
  return [err?.shortMessage, err?.message, err?.stderr].filter((s) => typeof s === "string").join("\n");
}

/** Docker itself (the CLI or its daemon) cannot be used — not a container that merely does not exist. */
export function isDockerUnavailableError(e: unknown): boolean {
  if ((e as any)?.code === "ENOENT") return true;
  return /ENOENT|is not recognized as an internal or external command|cannot find the file specified|error during connect|Cannot connect to the Docker daemon|docker daemon is not running|Is the docker daemon running|pipe\/docker_engine|connection refused|actively refused/i.test(
    errorText(e)
  );
}

/** The container (or object) named does not exist; Docker itself answered. */
export function isNoSuchContainerError(e: unknown): boolean {
  return /No such (object|container)/i.test(errorText(e));
}

interface InternalDockerKaspadOptions extends Required<
  Omit<DockerKaspadOptions, "ports" | "mineTo">
> {
  readonly ports: KaspadPorts;
  readonly mineTo?: string | undefined;
}

export class DockerKaspadRunner {
  private readonly options: InternalDockerKaspadOptions;

  constructor(options?: DockerKaspadOptions) {
    const cwd = options?.cwd || process.cwd();
    this.options = {
      cwd,
      image: options?.image || DEFAULT_IMAGE,
      containerName: options?.containerName || DEFAULT_CONTAINER_NAME,
      network: options?.network || DEFAULT_NETWORK,
      dataDir: options?.dataDir || path.join(".hardkas", "kaspad"),
      ports: {
        ...DEFAULT_PORTS,
        ...(options?.ports || {})
      } as KaspadPorts,
      detach: options?.detach ?? true,
      allowFloatingImage: options?.allowFloatingImage ?? false,
      allowSimulatedFallback: options?.allowSimulatedFallback ?? process.env.HARDKAS_ALLOW_SIMULATED_NODE === "1",
      mineTo: options?.mineTo
    } as InternalDockerKaspadOptions;
  }

  /**
   * The identity this runner's node must prove, or undefined when it is not
   * the canonical node (a custom image has no known version to verify).
   */
  expectedIdentity(): NodeIdentityExpectation | undefined {
    if (this.options.image !== CANONICAL_LOCALNET.image) return undefined;
    return {
      ...CANONICAL_NODE_EXPECTATION,
      containerName: this.options.containerName,
      rpcPort: this.options.ports.jsonRpc
    };
  }

  /** Proves the running node is the one this runner manages (see verifyNodeIdentity). */
  async identity(): Promise<NodeIdentityRecord | undefined> {
    const expected = this.expectedIdentity();
    return expected ? verifyNodeIdentity({ expected }) : undefined;
  }

  /** Runs a docker command; a Docker that cannot be used is the typed DOCKER_UNAVAILABLE, anything else is the original error. */
  private async docker(args: string[]): Promise<{ stdout: string }> {
    try {
      const r = await execa("docker", args);
      return { stdout: typeof r?.stdout === "string" ? r.stdout : "" };
    } catch (e: unknown) {
      if (isDockerUnavailableError(e)) {
        throw nodeRunnerError(
          NODE_ERROR_DOCKER_UNAVAILABLE,
          `Docker is not available (docker ${args[0]} failed). Install or start Docker to run a real Kaspa node. Details: ${(e as any)?.shortMessage ?? (e as any)?.message ?? String(e)}`,
          e
        );
      }
      throw e;
    }
  }

  private async requireIdentity(context: string): Promise<void> {
    const expected = this.expectedIdentity();
    if (!expected) return;
    const record = await verifyNodeIdentity({ expected });
    try {
      assertNodeIdentityVerified(record);
    } catch (e: any) {
      e.message = `${context}: ${e.message}`;
      throw e;
    }
  }

  async start(): Promise<KaspadNodeStatus> {
    const status = await this.status();
    if (status.running) {
      // A running container with the expected name is not trusted on its name:
      // it must prove digest, endpoint ownership, network and version.
      await this.requireIdentity(`Refusing to adopt the running '${this.options.containerName}'`);
      await this.startMiner();
      return status;
    }

    try {
      await execa("docker", ["version"]);
    } catch (e: any) {
      if (this.options.allowSimulatedFallback) {
        console.warn(
          `[DockerKaspadRunner] Docker unavailable (${e.message}). SIMULATED node runner explicitly allowed ` +
            `(allowSimulatedFallback / HARDKAS_ALLOW_SIMULATED_NODE=1): this is not a real node.`
        );
        (this as any)._simulated = true;
        return this.status();
      }
      throw nodeRunnerError(
        NODE_ERROR_DOCKER_UNAVAILABLE,
        `Docker is not available. Please install Docker to run a real Kaspa node. Details: ${e.message}`,
        e
      );
    }

    // Floating tag guard
    if (this.options.image.endsWith(":latest") && !this.options.allowFloatingImage) {
      throw new Error(
        `DockerKaspadRunner: The image tag ':latest' is unsafe for reproducible environments. ` +
        `Either pin a specific version (e.g., 'kaspanet/rusty-kaspad:${KASPAD_REFERENCE_VERSION}') ` +
        `or explicitly set allowFloatingImage: true.`
      );
    }

    // Network Flag Resolution - FAIL FAST
    const network = this.options.network;
    let networkFlag = "";

    if (network === "simnet") {
      networkFlag = "--simnet";
    } else if ((network as string).startsWith("testnet")) {
      networkFlag = "--testnet";
    } else if (network === "devnet") {
      networkFlag = "--devnet";
    } else if (network === "mainnet") {
      // MAINNET TOTAL LOCKDOWN: a mainnet node would sync from mainnet peers — HardKAS runs none and connects to none
      throw new Error(
        "[NODE_MANAGEMENT_MAINNET_FORBIDDEN] HardKAS does not run a mainnet node and makes no mainnet connection " +
          "(MAINNET_CONNECTION_DISABLED: mainnet is locked down, reads included; no flag or configuration enables it). " +
          "Use simnet, devnet or a testnet."
      );
    } else {
      throw new Error(`Unsupported network for Docker runner: ${network}`);
    }

    // Port check: an occupied port is never adopted (its owner is not our container).
    await this.ensurePortsAvailable();

    // Ensure data directory exists
    const absoluteDataDir = path.isAbsolute(this.options.dataDir)
      ? this.options.dataDir
      : path.resolve(this.options.cwd, this.options.dataDir);

    if (!existsSync(absoluteDataDir)) {
      await fs.mkdir(absoluteDataDir, { recursive: true });
    }

    // Clean up existing container if it exists (but not running)
    try {
      await execa("docker", ["rm", "-f", this.options.containerName]);
    } catch (e) {
      // Ignore if it doesn't exist
    }

    const args = [
      "run",
      "-d",
      "--name",
      this.options.containerName,
      // L1-CORE-1 B4: the node HardKAS starts says so (the simnet harness labels its own containers the same way); the
      // identity check stays the container + image digest + endpoint, never this label.
      "--label",
      "hardkas.role=localnet-node",
      "-p",
      `127.0.0.1:${this.options.ports.rpc}:${this.options.ports.rpc}`,
      "-p",
      `127.0.0.1:${this.options.ports.borshRpc}:${this.options.ports.borshRpc}`,
      "-p",
      `127.0.0.1:${this.options.ports.jsonRpc}:${this.options.ports.jsonRpc}`,
      "-v",
      `${absoluteDataDir}:/app/data`,
      this.options.image,
      "kaspad",
      "--yes",
      "--nologfiles",
      "--disable-upnp",
      "--utxoindex",
      ...(networkFlag ? [networkFlag] : []),
      `--rpclisten=0.0.0.0:${this.options.ports?.rpc || 16210}`,
      `--rpclisten-borsh=0.0.0.0:${this.options.ports?.borshRpc || 17210}`,
      `--rpclisten-json=0.0.0.0:${this.options.ports?.jsonRpc || 18210}`,
      `--enable-unsynced-mining`
    ];

    await execa("docker", args);

    // 4. Wait for RPC readiness
    const rpcUrl = `http://127.0.0.1:${this.options.ports.jsonRpc}`;
    const health = await waitForKaspaRpcReady({
      url: rpcUrl,
      maxWaitMs: 300000,
      intervalMs: 1000
    });

    if (!health.ready) {
      let logs = "";
      try {
        const { stdout, stderr } = await execa("docker", ["logs", "--tail", "200", this.options.containerName]);
        logs = `\nContainer Logs:\n${stdout}\n${stderr}`;
      } catch (e) {
        logs = `\nCould not fetch container logs: ${e}`;
      }
      throw new Error(
        `Kaspad RPC failed to become ready within 300s.\n` +
          `  Container: ${this.options.containerName}\n` +
          `  Image: ${this.options.image}\n` +
          `  RPC: ${rpcUrl}\n` +
          `  Last Error: ${health.lastError || "Timeout"}\n\n` +
          `  Try checking logs: hardkas node logs --tail 200${logs}`
      );
    }

    await this.requireIdentity(`The node started as '${this.options.containerName}' does not match its expected identity`);
    await this.startMiner();
    return this.status();
  }

  private async startMiner(): Promise<void> {
    if (!this.options.mineTo) return;
    const minerContainerName = minerContainerNameFor(this.options.containerName);
    try {
      await execa("docker", ["rm", "-f", minerContainerName]);
    } catch (e) {}

    try {
      await execa("docker", [
        "run", "-d", "--rm",
        "--name", minerContainerName,
        "--network", `container:${this.options.containerName}`,
        CPUMINER_REFERENCE_IMAGE,
        "-a", this.options.mineTo,
        "-s", "127.0.0.1",
        "-p", this.options.ports.rpc.toString(),
        "--mine-when-not-synced",
        "-t", "1"
      ]);
    } catch (err: any) {
      console.warn(`[DockerKaspadRunner] Could not start CPU miner: ${err.message}`);
    }
  }

  private async ensurePortsAvailable(): Promise<void> {
    const ports = [
      this.options.ports.rpc,
      this.options.ports.borshRpc,
      this.options.ports.jsonRpc
    ];
    for (const port of ports) {
      const available = await this.isPortAvailable(port);
      if (!available) {
        // Our container is not running (start() checked), so whatever holds the
        // port is something else. It is reported, never attached to.
        const err = new Error(
          `NODE_PORT_OCCUPIED: port ${port} is already in use by something other than '${this.options.containerName}'. ` +
            `HardKAS does not attach to a node whose identity it cannot prove.\n` +
            `  - Stop the process or container using this port.\n` +
            `  - Or change the port in hardkas.config.ts.\n` +
            `  - Or run 'hardkas node reset --yes' if it's a stale container.`
        );
        (err as any).code = "NODE_PORT_OCCUPIED";
        throw err;
      }
    }
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close();
        resolve(true);
      });
      server.listen(port, "127.0.0.1");
    });
  }

  async stop(): Promise<KaspadNodeStatus> {
    if ((this as any)._simulated) {
      const stat = await this.status();
      (this as any)._simulated = false;
      return stat;
    }
    // CLI-RUNTIME-CONTRACT-1: ask Docker first (DOCKER_UNAVAILABLE propagates), stop only what exists,
    // and let a `docker stop`/`rm` that fails for a real reason fail the call. Nothing is "stopped" by
    // assumption.
    const before = await this.status();
    let stopped = false;
    if (before.statusText !== "not-found") {
      await this.docker(["stop", this.options.containerName]);
      await this.docker(["rm", this.options.containerName]);
      stopped = true;
    }

    if (this.options.mineTo) {
      const minerContainerName = minerContainerNameFor(this.options.containerName);
      try {
        await this.docker(["stop", minerContainerName]);
        await this.docker(["rm", minerContainerName]);
      } catch (e) {
        if (!isNoSuchContainerError(e)) throw e;
      }
    }
    return { ...(await this.status()), stopped };
  }

  private async checkTransportReady(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("error", () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, "127.0.0.1");
    });
  }

  async status(): Promise<KaspadNodeStatus> {
    // CANONICAL-RPC-URL: the node's JSON endpoint is a wRPC WebSocket; it is reported in that form.
    const rpcUrl = `ws://${CANONICAL_LOCALNET.host}:${this.options.ports.jsonRpc}`;

    if ((this as any)._simulated) {
      return {
        containerName: this.options.containerName,
        image: this.options.image,
        network: this.options.network,
        running: true,
        statusText: "running",
        ports: this.options.ports,
        dataDir: this.options.dataDir,
        rpcUrl,
        rpcReady: true,
        transports: {
          grpc: { port: this.options.ports.rpc, ready: true },
          borsh: { port: this.options.ports.borshRpc, ready: true },
          json: { port: this.options.ports.jsonRpc, ready: true, url: rpcUrl }
        },
        lastError: null
      };
    }

    let inspect: { stdout: string };
    try {
      inspect = await this.docker(["inspect", "--format", "{{.State.Status}}", this.options.containerName]);
    } catch (e) {
      // CLI-RUNTIME-CONTRACT-1: only a container that does not exist is "not-found"; a Docker that
      // cannot be asked (DOCKER_UNAVAILABLE), or any other real failure, is an error.
      if (!isNoSuchContainerError(e)) throw e;
      return {
        containerName: this.options.containerName,
        image: this.options.image,
        network: this.options.network,
        running: false,
        statusText: "not-found",
        ports: this.options.ports,
        dataDir: this.options.dataDir,
        rpcUrl,
        rpcReady: false,
        transports: {
          grpc: { port: this.options.ports.rpc, ready: false },
          borsh: { port: this.options.ports.borshRpc, ready: false },
          json: { port: this.options.ports.jsonRpc, ready: false, url: rpcUrl }
        },
        lastError: "Container not found"
      };
    }
    {
      const stdout = inspect.stdout;
      const running = stdout.trim() === "running";

      let jsonReady = false;
      let grpcReady = false;
      let borshReady = false;
      let lastError: string | null = null;

      if (running) {
        const health = await checkKaspaRpcHealth({ url: rpcUrl, timeoutMs: 2000 });
        jsonReady = health.ready;
        lastError = health.lastError || null;

        // Parallel check for binary transports
        [grpcReady, borshReady] = await Promise.all([
          this.checkTransportReady(this.options.ports.rpc),
          this.checkTransportReady(this.options.ports.borshRpc)
        ]);
      }

      return {
        containerName: this.options.containerName,
        image: this.options.image,
        network: this.options.network,
        running,
        statusText: stdout.trim(),
        ports: this.options.ports,
        dataDir: this.options.dataDir,
        rpcUrl,
        rpcReady: jsonReady, // Unified readiness
        transports: {
          grpc: { port: this.options.ports.rpc, ready: grpcReady },
          borsh: { port: this.options.ports.borshRpc, ready: borshReady },
          json: { port: this.options.ports.jsonRpc, ready: jsonReady, url: rpcUrl }
        },
        lastError
      };
    }
  }

  async restart(): Promise<KaspadNodeStatus> {
    await this.stop();
    return this.start();
  }

  async reset(
    options: { removeData?: boolean } = { removeData: true }
  ): Promise<KaspadNodeStatus> {
    await this.stop();
    if (options.removeData) {
      const absoluteDataDir = path.isAbsolute(this.options.dataDir)
        ? this.options.dataDir
        : path.resolve(this.options.cwd, this.options.dataDir);

      if (existsSync(absoluteDataDir)) {
        await this.removeDataDir(absoluteDataDir);
      }
    }
    return this.status();
  }

  /**
   * NODE-RESET-LINUX-1 · kaspad writes its chain data through the bind mount as the container's user. On a rootful Linux
   * engine that is root, so the host user cannot delete it (EACCES/EPERM); Docker Desktop (Windows, macOS) maps the
   * owner and a rootless engine writes as the host user, so only there does this happen. The folder's entries are then
   * removed by a short-lived container of the node's own pinned image (root there, the same mount, no network, never
   * pulled), and the emptied folder from here.
   */
  private async removeDataDir(absoluteDataDir: string): Promise<void> {
    try {
      await fs.rm(absoluteDataDir, { recursive: true, force: true });
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code !== "EACCES" && code !== "EPERM") throw e;
    }
    const notRemoved = (e: unknown) =>
      nodeRunnerError(
        NODE_ERROR_DATA_NOT_REMOVED,
        `The node's data at ${absoluteDataDir} belongs to the container's user and could not be removed through the image ${this.options.image}: ${(e as any)?.shortMessage ?? (e as any)?.message ?? String(e)}. Remove that folder as root.`,
        e
      );
    let entries: string[];
    try {
      entries = await fs.readdir(absoluteDataDir);
    } catch (e) {
      throw notRemoved(e);
    }
    if (entries.length > 0) {
      try {
        await execa("docker", [
          "run", "--rm", "--pull", "never", "--network", "none", "--user", "0:0",
          "-v", `${absoluteDataDir}:/app/data`,
          "--entrypoint", "rm",
          this.options.image,
          "-rf", ...entries.map((entry) => `/app/data/${entry}`)
        ]);
      } catch (e) {
        if (isDockerUnavailableError(e)) {
          throw nodeRunnerError(
            NODE_ERROR_DOCKER_UNAVAILABLE,
            `Docker is not available to remove the node's data at ${absoluteDataDir}, which belongs to the container's user. Details: ${(e as any)?.shortMessage ?? (e as any)?.message ?? String(e)}`,
            e
          );
        }
        throw notRemoved(e);
      }
    }
    try {
      await fs.rm(absoluteDataDir, { recursive: true, force: true });
    } catch (e) {
      throw notRemoved(e);
    }
  }

  async logs(options?: { tail?: number; follow?: boolean }): Promise<string | void> {
    try {
      const tail = options?.tail || 100;
      const args = ["logs", "--tail", tail.toString()];

      if (options?.follow) {
        args.push("-f");
        await execa("docker", [...args, this.options.containerName], {
          stdout: "inherit",
          stderr: "inherit"
        });
        return;
      }

      const { stdout } = await execa("docker", [...args, this.options.containerName]);
      return stdout;
    } catch (e) {
      // CLI-RUNTIME-CONTRACT-1: typed, with the cause kept.
      if (isDockerUnavailableError(e)) {
        throw nodeRunnerError(
          NODE_ERROR_DOCKER_UNAVAILABLE,
          `Docker is not available (docker logs failed). Install or start Docker to run a real Kaspa node. Details: ${(e as any)?.shortMessage ?? (e as any)?.message ?? String(e)}`,
          e
        );
      }
      if (isNoSuchContainerError(e)) {
        throw nodeRunnerError(
          NODE_ERROR_CONTAINER_NOT_FOUND,
          `No container '${this.options.containerName}' to read logs from. Start the node first (hardkas node start).`,
          e
        );
      }
      throw nodeRunnerError(
        NODE_ERROR_LOGS_FAILED,
        `Could not get logs for container ${this.options.containerName}: ${(e as any)?.shortMessage ?? (e as any)?.message ?? String(e)}`,
        e
      );
    }
  }
}
