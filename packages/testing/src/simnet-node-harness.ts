import { ChildProcess, spawn, execFileSync } from "child_process";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import {
  KASPAD_REFERENCE_IMAGE,
  CANONICAL_NODE_EXPECTATION,
  assertNodeIdentityVerified,
  nodeRpcUrl,
  type NodeIdentityRecord
} from "@hardkas/core";
import { verifyNodeIdentity } from "@hardkas/node-runner";
import net from "net";
import { SimnetMiningDriver, SimnetMiningDriverImpl } from "./simnet-mining-driver.js";
import { JsonWrpcTransport } from "../../kaspa-rpc/src/transport/json-wrpc-transport.js";

export interface SimnetNodeHandle {
  readonly rpcUrl: string;
  readonly dataDir: string;
  readonly processId?: number | undefined;
  readonly mining: SimnetMiningDriver;
  readonly simulated?: boolean;
  /**
   * Name of the container backing this node, when one was started via Docker.
   *
   * Callers need this to address the node they just raised: a miner reaches
   * kaspad by joining its network namespace (`--network container:<name>`),
   * because kaspad binds gRPC to loopback inside its own container.
   */
  readonly containerName?: string | undefined;
  /**
   * Which node this handle talks to, once proven (image digest, endpoint
   * ownership, network, version). Set by attach() and by waitUntilReady() for
   * Docker nodes the harness starts.
   */
  identity?: NodeIdentityRecord | undefined;

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

// Containers started by this process. Killing the `docker run` client does not stop
// the container (notably on Windows), so they are removed explicitly on stop/kill
// and, as a safety net, when the process exits.
const startedContainers = new Set<string>();
let exitHookInstalled = false;

function removeContainerSync(name: string): void {
  try {
    execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
  } catch {
    // Already gone or Docker unavailable.
  }
  startedContainers.delete(name);
}

async function removeContainer(name: string): Promise<void> {
  await new Promise((resolve) => {
    const rm = spawn("docker", ["rm", "-f", name], { stdio: "ignore" });
    rm.on("exit", () => resolve(true));
    rm.on("error", () => resolve(true));
  });
  startedContainers.delete(name);
}

function trackContainer(name: string): void {
  startedContainers.add(name);
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.once("exit", () => {
      for (const container of [...startedContainers]) removeContainerSync(container);
    });
  }
}

export class SimnetNodeHarness {
  static async start(options: SimnetNodeHarnessOptions = {}): Promise<SimnetNodeHandle> {
    if (options.rpcPort && await this.isPortInUse(options.rpcPort)) {
      // Attach only after the node on that port proves its identity (see attach()).
      console.warn(`[SimnetNodeHarness] Port ${options.rpcPort} already in use. Verifying the node's identity before attaching.`);
      return this.attach(`ws://127.0.0.1:${options.rpcPort}`);
    }
    const rpcPort = options.rpcPort ?? await this.getFreePort();
    const rpcUrl = `ws://127.0.0.1:${rpcPort}`;
    const dataDir = `/tmp/hardkas-simnet-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    // For simplicity we use KASPAD_BIN or docker
    const binaryPath = options.binaryPath || process.env.KASPAD_BIN;
    
    let child: ChildProcess | undefined;
    let containerName: string | undefined;

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
      let dockerAvailable = false;
      try {
        await new Promise((resolve, reject) => {
          const check = spawn("docker", ["version"], { stdio: "ignore" });
          check.on("error", reject);
          check.on("exit", (code) => code === 0 ? resolve(true) : reject(new Error(`exit ${code}`)));
        });
      } catch (e: any) {
        throw new Error(`ENVIRONMENT_NOT_QUALIFIED: Docker not available or command failed.`);
      }

      const dockerImage = process.env.HARDKAS_KASPAD_IMAGE ?? KASPAD_REFERENCE_IMAGE;
      // Name the container. Without a name Docker assigns a random one, which
      // leaves the node unaddressable (nothing can join its network namespace)
      // and unkillable by anything but the `docker run` client process.
      containerName = `hardkas-simnet-${rpcPort}`;
      await new Promise((resolve) => {
        const rm = spawn("docker", ["rm", "-f", containerName!], { stdio: "ignore" });
        rm.on("exit", () => resolve(true));
        rm.on("error", () => resolve(true));
      });
      const args = [
        "run", "--rm", "--name", containerName, "-p", `${rpcPort}:${rpcPort}`,
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
      trackContainer(containerName);
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
      containerName,
      mining: new SimnetMiningDriverImpl(client),
      waitUntilReady: async (waitOpts) => {
        const timeoutMs = waitOpts?.timeoutMs || options.startupTimeoutMs || 90000;
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          if (spawnError || processExited) {
            throw new Error(`ENVIRONMENT_NOT_QUALIFIED: Spawn error (${spawnError?.message}) or process exited. Node failed to start.`);
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
              // A node the harness started in Docker must also prove what it is.
              if (containerName) {
                handle.identity = assertNodeIdentityVerified(
                  await verifyNodeIdentity({
                    expected: { ...CANONICAL_NODE_EXPECTATION, containerName, rpcPort }
                  })
                );
              }
              return; // Ready
            }
            await client.close();
          } catch (e: any) {
            // Ignored, retry
          }
          await new Promise(r => setTimeout(r, 500));
        }
        throw new Error(`ENVIRONMENT_NOT_QUALIFIED: Node did not become ready within ${timeoutMs}ms.`);
      },
      restart: async () => {
        // Simple restart logic, mock for now
        handle.kill();
        // Here we would respawn with same args
      },
      stop: async () => {
        child?.kill("SIGTERM");
        if (containerName) await removeContainer(containerName);
      },
      kill: async () => {
        child?.kill("SIGKILL");
        if (containerName) await removeContainer(containerName);
      }
    };

    return handle;
  }

  /**
   * Attaches to a node HardKAS did not start. The canonical endpoint must prove
   * the canonical identity; any other endpoint is refused unless the caller
   * explicitly allows an unverified node (HARDKAS_ALLOW_UNVERIFIED_NODE=1), in
   * which case the handle carries an identity marked unverified.
   */
  static async attach(rpcUrl: string): Promise<SimnetNodeHandle> {
    let identity: NodeIdentityRecord | undefined;
    const normalized = rpcUrl.replace(/\/+$/, "").replace("://localhost:", "://127.0.0.1:");
    if (normalized === nodeRpcUrl()) {
      identity = assertNodeIdentityVerified(await verifyNodeIdentity());
    } else if (process.env.HARDKAS_ALLOW_UNVERIFIED_NODE === "1") {
      console.warn(`[SimnetNodeHarness] Attaching to ${rpcUrl} WITHOUT identity verification (HARDKAS_ALLOW_UNVERIFIED_NODE=1).`);
    } else {
      const err = new Error(
        `NODE_IDENTITY_UNVERIFIED: ${rpcUrl} is not the canonical node (${nodeRpcUrl()}), so its identity cannot be proven. ` +
          `Start the canonical localnet, or set HARDKAS_ALLOW_UNVERIFIED_NODE=1 to attach to an unverified node explicitly.`
      );
      (err as any).code = "NODE_IDENTITY_UNVERIFIED";
      throw err;
    }

    const client = new JsonWrpcKaspaClient({ rpcUrl });
    const handle: SimnetNodeHandle = {
      rpcUrl,
      identity,
      dataDir: "external",
      mining: new SimnetMiningDriverImpl(client),
      waitUntilReady: async (opts) => {
        try {
          const client = new JsonWrpcKaspaClient({ rpcUrl });
          const network = await client.getCurrentNetwork();
          await client.close();
          if (!network.network.includes("simnet")) {
            throw new Error("Attached node is not on simnet");
          }
        } catch (e: any) {
          throw new Error(`ENVIRONMENT_NOT_QUALIFIED: Could not verify attached node (${e.message}). Node is not qualified.`);
        }
      },
      restart: async () => {},
      stop: async () => {},
      kill: async () => {}
    };
    return handle;
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
