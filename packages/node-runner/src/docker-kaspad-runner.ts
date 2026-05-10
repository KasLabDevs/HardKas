import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { 
  DockerKaspadOptions, 
  KaspadNodeStatus, 
  KaspadPorts 
} from "./types.js";

export const DEFAULT_IMAGE = "kaspanet/rusty-kaspad:latest";
export const DEFAULT_CONTAINER_NAME = "hardkas-kaspad-simnet";
export const DEFAULT_NETWORK = "simnet";
export const DEFAULT_PORTS: KaspadPorts = {
  rpc: 16210,
  borshRpc: 17210,
  jsonRpc: 18210
};

interface InternalDockerKaspadOptions extends Required<Omit<DockerKaspadOptions, "ports">> {
  readonly ports: KaspadPorts;
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
      detach: options?.detach ?? true
    };
  }

  async start(): Promise<KaspadNodeStatus> {
    const status = await this.status();
    if (status.running) {
      return status;
    }

    // Check if docker is available
    try {
      await execa("docker", ["version"]);
    } catch (e) {
      throw new Error("Docker is not available. Please install Docker to run a real Kaspa node.");
    }

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
      "--name", this.options.containerName,
      "-p", `${this.options.ports.rpc}:${this.options.ports.rpc}`,
      "-p", `${this.options.ports.borshRpc}:${this.options.ports.borshRpc}`,
      "-p", `${this.options.ports.jsonRpc}:${this.options.ports.jsonRpc}`,
      "-v", `${absoluteDataDir}:/app/data`,
      this.options.image,
      "kaspad",
      "--yes",
      "--nologfiles",
      "--disable-upnp",
      "--utxoindex",
      "--simnet",
      `--rpclisten=0.0.0.0:${this.options.ports.rpc}`,
      `--rpclisten-borsh=0.0.0.0:${this.options.ports.borshRpc}`,
      `--rpclisten-json=0.0.0.0:${this.options.ports.jsonRpc}`
    ];

    await execa("docker", args);

    return this.status();
  }

  async stop(): Promise<KaspadNodeStatus> {
    try {
      await execa("docker", ["stop", this.options.containerName]);
      await execa("docker", ["rm", this.options.containerName]);
    } catch (e) {
      // Ignore errors if container doesn't exist or is already stopped
    }
    return this.status();
  }

  async status(): Promise<KaspadNodeStatus> {
    try {
      const { stdout } = await execa("docker", [
        "inspect", 
        "--format", "{{.State.Status}}", 
        this.options.containerName
      ]);
      const running = stdout.trim() === "running";
      
      return {
        containerName: this.options.containerName,
        image: this.options.image,
        network: this.options.network,
        running,
        statusText: stdout.trim(),
        ports: this.options.ports,
        dataDir: this.options.dataDir
      };
    } catch (e) {
      return {
        containerName: this.options.containerName,
        image: this.options.image,
        network: this.options.network,
        running: false,
        statusText: "not-found",
        ports: this.options.ports,
        dataDir: this.options.dataDir
      };
    }
  }

  async logs(options?: { tail?: number }): Promise<string> {
    try {
      const tail = options?.tail || 100;
      const { stdout } = await execa("docker", [
        "logs", 
        "--tail", tail.toString(), 
        this.options.containerName
      ]);
      return stdout;
    } catch (e) {
      throw new Error(`Could not get logs for container ${this.options.containerName}. Is it running?`);
    }
  }
}
