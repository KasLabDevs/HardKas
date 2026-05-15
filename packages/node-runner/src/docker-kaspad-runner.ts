import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import net from "node:net";
// Using relative paths to avoid resolution issues in restricted environments
import { 
  checkKaspaRpcHealth, 
  waitForKaspaRpcReady 
} from "@hardkas/kaspa-rpc";
import { 
  DockerKaspadOptions, 
  KaspadNodeStatus, 
  KaspadPorts 
} from "./types.js";

export const DEFAULT_IMAGE = "kaspanet/rusty-kaspad:v1.1.0";
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
      detach: options?.detach ?? true,
      allowFloatingImage: options?.allowFloatingImage ?? false
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

    // Floating tag warning
    if (this.options.image.endsWith(":latest") && !this.options.allowFloatingImage) {
      console.warn("\n  ⚠️  WARNING: Using a floating Docker tag (:latest) reduces reproducibility.\n");
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
      throw new Error(
        "Local Docker node for 'mainnet' is currently unsupported by HardKAS.\n" +
        "Please use a remote RPC provider or a manual kaspad setup for mainnet operations."
      );
    } else {
      throw new Error(`Unsupported network for Docker runner: ${network}`);
    }

    // Port check
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
      "--name", this.options.containerName,
      "-p", `127.0.0.1:${this.options.ports.rpc}:${this.options.ports.rpc}`,
      "-p", `127.0.0.1:${this.options.ports.borshRpc}:${this.options.ports.borshRpc}`,
      "-p", `127.0.0.1:${this.options.ports.jsonRpc}:${this.options.ports.jsonRpc}`,
      "-v", `${absoluteDataDir}:/app/data`,
      this.options.image,
      "kaspad",
      "--yes",
      "--nologfiles",
      "--disable-upnp",
      "--utxoindex",
      ...(networkFlag ? [networkFlag] : []),
      `--rpclisten=0.0.0.0:${this.options.ports.rpc}`,
      `--rpclisten-borsh=0.0.0.0:${this.options.ports.borshRpc}`,
      `--rpclisten-json=0.0.0.0:${this.options.ports.jsonRpc}`
    ];

    await execa("docker", args);

    // 4. Wait for RPC readiness
    const rpcUrl = `http://127.0.0.1:${this.options.ports.jsonRpc}`;
    const health = await waitForKaspaRpcReady({
      url: rpcUrl,
      maxWaitMs: 60000,
      intervalMs: 1000
    });

    if (!health.ready) {
      throw new Error(
        `Kaspad RPC failed to become ready within 60s.\n` +
        `  Container: ${this.options.containerName}\n` +
        `  Image: ${this.options.image}\n` +
        `  RPC: ${rpcUrl}\n` +
        `  Last Error: ${health.lastError || "Timeout"}\n\n` +
        `  Try checking logs: hardkas node logs --tail 200`
      );
    }

    return this.status();
  }

  private async ensurePortsAvailable(): Promise<void> {
    const ports = [this.options.ports.rpc, this.options.ports.borshRpc, this.options.ports.jsonRpc];
    for (const port of ports) {
      const available = await this.isPortAvailable(port);
      if (!available) {
        throw new Error(
          `Port ${port} is already in use on the host. Cannot start node.\n` +
          `  - Stop any existing process using this port.\n` +
          `  - Or change the port in hardkas.config.ts.\n` +
          `  - Or run 'hardkas node reset --yes' if it's a stale container.`
        );
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
    try {
      await execa("docker", ["stop", this.options.containerName]);
      await execa("docker", ["rm", this.options.containerName]);
    } catch (e) {
      // Ignore errors if container doesn't exist or is already stopped
    }
    return this.status();
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
    const rpcUrl = `http://127.0.0.1:${this.options.ports.jsonRpc}`;
    
    try {
      const { stdout } = await execa("docker", [
        "inspect", 
        "--format", "{{.State.Status}}", 
        this.options.containerName
      ]);
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
    } catch (e) {
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
  }

  async restart(): Promise<KaspadNodeStatus> {
    await this.stop();
    return this.start();
  }

  async reset(options: { removeData?: boolean } = { removeData: true }): Promise<KaspadNodeStatus> {
    await this.stop();
    if (options.removeData) {
      const absoluteDataDir = path.isAbsolute(this.options.dataDir) 
        ? this.options.dataDir 
        : path.resolve(this.options.cwd, this.options.dataDir);
      
      if (existsSync(absoluteDataDir)) {
        await fs.rm(absoluteDataDir, { recursive: true, force: true });
      }
    }
    return this.status();
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
      throw new Error(`Could not get logs for container ${this.options.containerName}. Is it running?`);
    }
  }
}
