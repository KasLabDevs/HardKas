import { ChildProcess, spawn } from "child_process";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import net from "net";
import { SimnetMiningDriver, SimnetMiningDriverImpl } from "./simnet-mining-driver.js";
import { JsonWrpcTransport } from "../../kaspa-rpc/src/transport/json-wrpc-transport.js";

export interface SimnetNodeHandle {
  readonly rpcUrl: string;
  readonly dataDir: string;
  readonly processId?: number | undefined;
  readonly mining: SimnetMiningDriver;

  waitUntilReady(options?: { timeoutMs?: number }): Promise<void>;
  restart(): Promise<void>;
  stop(): Promise<void>;
  kill(): Promise<void>;
}

export interface SimnetNodeHarnessOptions {
  binaryPath?: string;
  rpcPort?: number;
  utxoIndex?: boolean;
  txIndex?: boolean;
  startupTimeoutMs?: number;
}

export class SimnetNodeHarness {
  static async start(options: SimnetNodeHarnessOptions = {}): Promise<SimnetNodeHandle> {
    if (options.rpcPort && await this.isPortInUse(options.rpcPort)) {
      console.warn(`[SimnetNodeHarness] Port ${options.rpcPort} already in use. Attaching to existing instance without starting new container.`);
      return this.attach(`ws://127.0.0.1:${options.rpcPort}`);
    }
    const rpcPort = options.rpcPort ?? await this.getFreePort();
    const rpcUrl = `ws://127.0.0.1:${rpcPort}`;
    const dataDir = `/tmp/hardkas-simnet-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    // For simplicity we use KASPAD_BIN or docker
    const binaryPath = options.binaryPath || process.env.KASPAD_BIN;
    
    let child: ChildProcess | undefined;

    if (binaryPath) {
      const args = [
        "--simnet",
        "--rpclisten-json=127.0.0.1:" + rpcPort,
        "--appdir=" + dataDir,
        "--reset-db"
      ];
      if (options.utxoIndex) args.push("--utxoindex");
      if (options.txIndex) args.push("--txindex");
      child = spawn(binaryPath, args, { stdio: "ignore" });
    } else {
      // Fallback to docker
      const dockerImage = "supertypo/rusty-kaspad:latest"; // Valid image
      const args = [
        "run", "--rm", "-p", `${rpcPort}:${rpcPort}`,
        dockerImage,
        "kaspad",
        "--simnet",
        "--rpclisten-json=0.0.0.0:" + rpcPort,
        "--enable-unsynced-mining",
        "--reset-db"
      ];
      if (options.utxoIndex) args.push("--utxoindex");
      if (options.txIndex) args.push("--txindex");
      child = spawn("docker", args, { stdio: "ignore" });
    }

    if (!child) throw new Error("Failed to start Simnet Node");

    let spawnError: Error | undefined = undefined;
    let processExited = false;
    child.on("error", (err: any) => {
      console.warn("[SimnetNodeHarness] Child process error:", err.message);
      spawnError = err;
    });
    child.on("exit", () => {
      processExited = true;
    });

    const client = new JsonWrpcKaspaClient({ rpcUrl });

    const handle: SimnetNodeHandle = {
      rpcUrl,
      dataDir,
      processId: child.pid,
      mining: new SimnetMiningDriverImpl(client),
      waitUntilReady: async (waitOpts) => {
        const timeoutMs = waitOpts?.timeoutMs || options.startupTimeoutMs || 90000;
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          if (spawnError) {
            throw new Error(`Simnet Node spawn failed: ${spawnError.message}`);
          }
          if (processExited) {
            throw new Error("Simnet Node process exited before becoming ready.");
          }
          try {
            const client = new JsonWrpcKaspaClient({ rpcUrl });
            const serverInfo = await client.getServerInfo();
            const network = await client.getCurrentNetwork();
            const info = await client.getInfo();
            
            if (
              serverInfo && 
              network.network.includes("simnet") &&
              (!options.utxoIndex || info.isUtxoIndexed)
            ) {
              await client.close();
              return; // Ready
            }
            await client.close();
          } catch (e: any) {
            // Ignored, retry
          }
          await new Promise(r => setTimeout(r, 500));
        }
        throw new Error(`Node did not become ready within ${timeoutMs}ms`);
      },
      restart: async () => {
        // Simple restart logic, mock for now
        handle.kill();
        // Here we would respawn with same args
      },
      stop: async () => {
        child?.kill("SIGTERM");
      },
      kill: async () => {
        child?.kill("SIGKILL");
      }
    };

    return handle;
  }

  static async attach(rpcUrl: string): Promise<SimnetNodeHandle> {
    const client = new JsonWrpcKaspaClient({ rpcUrl });
    return {
      rpcUrl,
      dataDir: "external",
      mining: new SimnetMiningDriverImpl(client),
      waitUntilReady: async (opts) => {
        // Just verify it's a real simnet
        const client = new JsonWrpcKaspaClient({ rpcUrl });
        const network = await client.getCurrentNetwork();
        await client.close();
        if (!network.network.includes("simnet")) {
          throw new Error("Attached node is not on simnet");
        }
      },
      restart: async () => {},
      stop: async () => {},
      kill: async () => {}
    };
  }

  private static async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.once("error", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, "127.0.0.1", () => {
        socket.destroy();
        resolve(true);
      });
    });
  }

  private static async getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on("error", reject);
      server.listen(0, () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => resolve(port));
      });
    });
  }
}
