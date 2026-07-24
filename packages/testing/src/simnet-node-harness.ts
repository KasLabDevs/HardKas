import { ChildProcess, spawn } from "child_process";
import { JsonWrpcKaspaClient } from "@hardkas/rpc";
import net from "net";
import { SimnetMiningDriver, SimnetMiningDriverImpl } from "./simnet-mining-driver.js";
import { JsonWrpcTransport } from "../../kaspa-rpc/src/transport/json-wrpc-transport.js";

export interface SimnetNodeHandle {
  readonly rpcUrl: string;
  readonly dataDir: string;
  readonly processId?: number;
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
  startupTimeoutMs?: number;
}

export class SimnetNodeHarness {
  static async start(options: SimnetNodeHarnessOptions = {}): Promise<SimnetNodeHandle> {
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
        "--appdir=" + dataDir
      ];
      if (options.utxoIndex) args.push("--utxoindex");
      child = spawn(binaryPath, args, { stdio: "ignore" });
    } else {
      // Fallback to docker
      const dockerImage = "kaspanet/kaspad:v2.0.1"; // Default pinned version
      const args = [
        "run", "--rm", "-p", `${rpcPort}:${rpcPort}`,
        dockerImage,
        "--simnet",
        "--rpclisten-json=0.0.0.0:" + rpcPort
      ];
      if (options.utxoIndex) args.push("--utxoindex");
      child = spawn("docker", args, { stdio: "ignore" });
    }

    if (!child) throw new Error("Failed to start Simnet Node");

    const handle: SimnetNodeHandle = {
      rpcUrl,
      dataDir,
      processId: child.pid,
      mining: new SimnetMiningDriverImpl(new JsonWrpcTransport({ url: rpcUrl.replace("ws://", "http://") })),
      waitUntilReady: async (waitOpts) => {
        const timeoutMs = waitOpts?.timeoutMs || options.startupTimeoutMs || 30000;
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          try {
            const client = new JsonWrpcKaspaClient({ rpcUrl });
            const serverInfo = await client.getServerInfo();
            const network = await client.getCurrentNetwork();
            const sync = await client.getSyncStatus();
            
            if (
              serverInfo && 
              network.network.includes("simnet") &&
              sync.isSynced
            ) {
              await client.close();
              return; // Ready
            }
            await client.close();
          } catch (e) {
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
    return {
      rpcUrl,
      dataDir: "external",
      mining: new SimnetMiningDriverImpl(new JsonWrpcTransport({ url: rpcUrl.replace("ws://", "http://") })),
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
