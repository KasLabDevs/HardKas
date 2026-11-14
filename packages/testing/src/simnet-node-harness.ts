import { ChildProcess, spawn, execFileSync } from "child_process";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import {
  KASPAD_REFERENCE_IMAGE,
  NODE_IMAGE_DIGEST_REQUIRED,
  isPinnedImageReference,
  CANONICAL_NODE_EXPECTATION,
  assertNodeIdentityVerified,
  assertNodeKind,
  nodeRpcUrl,
  type NodeIdentityRecord
} from "@hardkas/core";
import { verifyNodeIdentity } from "@hardkas/node-runner";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { SimnetMiningDriver, SimnetMiningDriverImpl } from "./simnet-mining-driver.js";

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
  /**
   * Keep the node's database in a host directory under this root (`<root>/hardkas-simnet-<port>-<stamp>`, bind-mounted
   * on the container's `/app/data`) instead of the container's anonymous volume. Default: HARDKAS_TEST_SIMNET_DATA_ROOT.
   * A node with host data can be restarted with its chain (restart()); the directory is left in place for inspection.
   */
  dataRoot?: string;
  /** Like dataRoot, under the OS temp directory when neither dataRoot nor HARDKAS_TEST_SIMNET_DATA_ROOT is set. */
  persistData?: boolean;
  /** Extra Docker labels for the container, besides the harness role and run id. Default: HARDKAS_TEST_SIMNET_LABELS. */
  labels?: Readonly<Record<string, string>>;
}

/** Root directory for host-side node data (see SimnetNodeHarnessOptions.dataRoot). */
export const HARDKAS_TEST_SIMNET_DATA_ROOT_ENV = "HARDKAS_TEST_SIMNET_DATA_ROOT";
/** Extra container labels, `key=value` pairs separated by commas (see SimnetNodeHarnessOptions.labels). */
export const HARDKAS_TEST_SIMNET_LABELS_ENV = "HARDKAS_TEST_SIMNET_LABELS";

/**
 * Host port range `low-high` (inclusive) for the node the harness starts (default: any free port the OS gives). Lets
 * several sessions share one machine, each inside its own range. A range touching a canonical localnet port is refused.
 */
export const HARDKAS_TEST_SIMNET_PORT_RANGE_ENV = "HARDKAS_TEST_SIMNET_PORT_RANGE";
/** The canonical localnet's host ports (gRPC and JSON wRPC of every network): never inside a harness range. */
const CANONICAL_LOCALNET_PORT_SPAN = { low: 16110, high: 18211 } as const;

/** Parses HARDKAS_TEST_SIMNET_PORT_RANGE ("low-high"). Empty: unbounded (undefined). */
export function parseSimnetPortRange(raw: string | undefined): { low: number; high: number } | undefined {
  if (!raw || raw.trim() === "") return undefined;
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(raw);
  const low = m ? Number(m[1]) : NaN;
  const high = m ? Number(m[2]) : NaN;
  if (!m || !(low >= 1024 && high <= 65535 && low <= high)) {
    throw new Error(`SIMNET_PORT_RANGE_INVALID: '${raw}' is not low-high within 1024..65535 (${HARDKAS_TEST_SIMNET_PORT_RANGE_ENV})`);
  }
  if (low <= CANONICAL_LOCALNET_PORT_SPAN.high && high >= CANONICAL_LOCALNET_PORT_SPAN.low) {
    throw new Error(`SIMNET_PORT_RANGE_CANONICAL: '${raw}' overlaps the canonical localnet ports ${CANONICAL_LOCALNET_PORT_SPAN.low}..${CANONICAL_LOCALNET_PORT_SPAN.high}`);
  }
  return { low, high };
}

/** The first port of `range`, from offset `start` and wrapping around, that `isFree` accepts. */
export async function pickSimnetHostPort(
  range: { low: number; high: number },
  isFree: (port: number) => Promise<boolean>,
  start = Math.floor(Math.random() * (range.high - range.low + 1))
): Promise<number> {
  const size = range.high - range.low + 1;
  for (let n = 0; n < size; n++) {
    const port = range.low + ((start + n) % size);
    if (await isFree(port)) return port;
  }
  throw new Error(`SIMNET_PORT_RANGE_EXHAUSTED: no free port in ${range.low}-${range.high} (${HARDKAS_TEST_SIMNET_PORT_RANGE_ENV})`);
}

/** Whether nothing listens on 127.0.0.1:`port` and it can be bound there now. */
export async function simnetHostPortIsFree(port: number): Promise<boolean> {
  const listening = await new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(300);
    socket.once("error", () => (socket.destroy(), resolve(false)));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
    socket.connect(port, "127.0.0.1", () => (socket.destroy(), resolve(true)));
  });
  if (listening) return false;
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

/** Parses HARDKAS_TEST_SIMNET_LABELS. A pair without `=`, an empty key, or a role/run label (the harness owns them) throws. */
export function parseSimnetExtraLabels(raw: string | undefined): Record<string, string> {
  const labels: Record<string, string> = {};
  if (!raw || raw.trim() === "") return labels;
  for (const pair of raw.split(",")) {
    const at = pair.indexOf("=");
    const key = at > 0 ? pair.slice(0, at).trim() : "";
    if (!key) throw new Error(`SIMNET_LABEL_INVALID: '${pair}' is not key=value (${HARDKAS_TEST_SIMNET_LABELS_ENV})`);
    if (key === SIMNET_HARNESS_ROLE_LABEL || key === SIMNET_HARNESS_RUN_LABEL) {
      throw new Error(`SIMNET_LABEL_RESERVED: '${key}' is set by the harness itself`);
    }
    labels[key] = pair.slice(at + 1).trim();
  }
  return labels;
}

/** Environment variable carrying the run id shared by every worker of one test invocation. */
export const HARDKAS_TEST_RUN_ID_ENV = "HARDKAS_TEST_RUN_ID";
/** Docker labels stamped on every container the harness starts. */
export const SIMNET_HARNESS_ROLE_LABEL = "hardkas.role";
export const SIMNET_HARNESS_ROLE = "simnet-harness";
export const SIMNET_HARNESS_RUN_LABEL = "hardkas.run";

/**
 * Identity of the current run: the id the test level fixed in the environment
 * (vitest.simnet.config.ts global setup), else one derived from this process.
 * Every container the harness starts is labelled with it, so cleanup can
 * address exactly this run's containers and nothing else (AUD-06).
 */
export function resolveHarnessRunId(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[HARDKAS_TEST_RUN_ID_ENV];
  return fromEnv && fromEnv.trim() !== "" ? fromEnv.trim() : `pid-${process.pid}`;
}

export interface SimnetDockerRunSpec {
  readonly containerName: string;
  readonly rpcPort: number;
  readonly image: string;
  readonly runId: string;
  readonly utxoIndex?: boolean | undefined;
  readonly txIndex?: boolean | undefined;
  /** Extra labels (never the role or run label, which are always the harness's own). */
  readonly labels?: Readonly<Record<string, string>> | undefined;
  /** Host directory bind-mounted on `/app/data` (the image's data volume). */
  readonly hostDataDir?: string | undefined;
  /** `--reset-db` (default true). A restart over existing host data omits it, so the chain survives. */
  readonly resetDb?: boolean | undefined;
}

/**
 * The `docker run` invocation for a harness node. Pure, so the properties that
 * matter for hygiene are unit-testable:
 *   - the RPC port is published on 127.0.0.1 only (SEC-J: never on every interface);
 *   - the container carries the harness role and the run id as labels;
 *   - it is named and auto-removed on exit.
 * kaspad itself listens on 0.0.0.0 *inside* the container, which is what a
 * published port needs; the host side of the publication is what limits reach.
 */
export function buildSimnetDockerRunArgs(spec: SimnetDockerRunSpec): string[] {
  const args = [
    "run",
    "--rm",
    "--name",
    spec.containerName,
    "--label",
    `${SIMNET_HARNESS_ROLE_LABEL}=${SIMNET_HARNESS_ROLE}`,
    "--label",
    `${SIMNET_HARNESS_RUN_LABEL}=${spec.runId}`
  ];
  for (const [key, value] of Object.entries(spec.labels ?? {})) {
    if (key === SIMNET_HARNESS_ROLE_LABEL || key === SIMNET_HARNESS_RUN_LABEL) continue;
    args.push("--label", `${key}=${value}`);
  }
  args.push("-p", `127.0.0.1:${spec.rpcPort}:${spec.rpcPort}`);
  if (spec.hostDataDir) args.push("-v", `${spec.hostDataDir}:/app/data`);
  args.push(spec.image, "kaspad", "--simnet", `--rpclisten-json=0.0.0.0:${spec.rpcPort}`, "--enable-unsynced-mining");
  if (spec.resetDb !== false) args.push("--reset-db");
  if (spec.utxoIndex) args.push("--utxoindex");
  if (spec.txIndex) args.push("--txindex");
  return args;
}

/**
 * The `docker rm` invocation that removes a harness container, its anonymous volumes included (`-v`). The kaspad image
 * declares `VOLUME /app/data`, so every container gets an anonymous volume. `--rm` removes it only when the container
 * exits by itself; the harness removes containers with `docker rm -f` first, and without `-v` that left one anonymous
 * volume behind per node started.
 */
export function buildSimnetDockerRemoveArgs(containerName: string): string[] {
  return ["rm", "-f", "-v", containerName];
}

export interface SimnetBinarySpec {
  readonly rpcPort: number;
  /** The node's own P2P port (loopback): several binary nodes share one network namespace, unlike containers. */
  readonly p2pPort: number;
  readonly appDir: string;
  readonly utxoIndex?: boolean | undefined;
  readonly txIndex?: boolean | undefined;
  /** `--reset-db` (default true); a restart omits it. */
  readonly resetDb?: boolean | undefined;
}

/**
 * The arguments for a harness node run from a kaspad binary (KASPAD_BIN), no Docker: the same simnet flags as the
 * container (buildSimnetDockerRunArgs) — unsynced mining included, which the block-template miner needs on a node with
 * no peers — with the JSON wRPC on the loopback interface only and the data in its own app directory. A container has a
 * network namespace of its own; binary nodes share the caller's, so each also gets its own P2P port on loopback, and no
 * gRPC server (whose default port two nodes would contend for) and no UPnP: with the default ports a second node, or one
 * a failed test left running, made the next node exit at its start (AddrInUse). Pure, so a test pins it.
 */
export function buildSimnetBinaryArgs(spec: SimnetBinarySpec): string[] {
  const args = [
    "--simnet",
    `--rpclisten-json=127.0.0.1:${spec.rpcPort}`,
    `--listen=127.0.0.1:${spec.p2pPort}`,
    "--nogrpc",
    "--disable-upnp",
    `--appdir=${spec.appDir}`,
    "--enable-unsynced-mining"
  ];
  if (spec.resetDb !== false) args.push("--reset-db");
  if (spec.utxoIndex) args.push("--utxoindex");
  if (spec.txIndex) args.push("--txindex");
  return args;
}

export interface HarnessSweepResult {
  /** false when the docker CLI could not be run at all (nothing was swept). */
  readonly dockerAvailable: boolean;
  readonly candidates: readonly string[];
  readonly removed: readonly string[];
  readonly failed: ReadonlyArray<{ readonly name: string; readonly error: string }>;
}

/**
 * Removes every container labelled with `runId`, whatever its state (running,
 * created, exited). Selection is by label only: containers the harness did
 * not start for this run are never matched. Results are reported, never
 * swallowed, so a container that could not be removed fails the caller.
 */
export function sweepHarnessContainers(runId: string): HarnessSweepResult {
  let listing: string;
  try {
    listing = execFileSync(
      "docker",
      ["ps", "-a", "--filter", `label=${SIMNET_HARNESS_RUN_LABEL}=${runId}`, "--format", "{{.Names}}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch {
    return { dockerAvailable: false, candidates: [], removed: [], failed: [] };
  }
  const candidates = listing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const removed: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];
  for (const name of candidates) {
    try {
      execFileSync("docker", buildSimnetDockerRemoveArgs(name), { stdio: "ignore" });
      removed.push(name);
      startedContainers.delete(name);
    } catch (error: any) {
      failed.push({ name, error: error?.message ?? String(error) });
    }
  }
  return { dockerAvailable: true, candidates, removed, failed };
}

// Containers started by this process. Killing the `docker run` client does not stop
// the container (notably on Windows), so they are removed explicitly on stop/kill
// and, as a safety net, when the process exits. The run-label sweep above is the
// deterministic cleanup; this set is only the in-process fast path.
const startedContainers = new Set<string>();
let exitHookInstalled = false;

function removeContainerSync(name: string): void {
  try {
    execFileSync("docker", buildSimnetDockerRemoveArgs(name), { stdio: "ignore" });
  } catch {
    // Already gone or Docker unavailable.
  }
  startedContainers.delete(name);
}

async function removeContainer(name: string): Promise<void> {
  await new Promise((resolve) => {
    const rm = spawn("docker", buildSimnetDockerRemoveArgs(name), { stdio: "ignore" });
    rm.on("exit", () => resolve(true));
    rm.on("error", () => resolve(true));
  });
  startedContainers.delete(name);
}

/**
 * A node run from a binary (KASPAD_BIN) keeps its database in its own app directory: once the process is gone (at most
 * 10 s after the signal) that directory is removed, as `docker run --rm` removes a container's. They used to stay: on a
 * small or memory-backed temp (a tmpfs) the later nodes of a run then failed to start.
 */
async function removeBinaryNodeData(child: ChildProcess | undefined, dataDir: string): Promise<void> {
  if (child) startedBinaries.delete(child);
  if (child && child.exitCode === null && child.signalCode === null) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // best effort: a directory left behind is only disk space
  }
}

/** Binary nodes still running when the process exits (a test that failed before its cleanup) are killed then. */
const startedBinaries = new Map<ChildProcess, string>();
let binaryExitHookInstalled = false;

function trackBinaryNode(child: ChildProcess, dataDir: string): void {
  startedBinaries.set(child, dataDir);
  if (!binaryExitHookInstalled) {
    binaryExitHookInstalled = true;
    process.once("exit", () => {
      for (const [proc, dir] of startedBinaries) {
        try {
          proc.kill("SIGKILL");
        } catch {}
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {}
      }
    });
  }
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
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // For simplicity we use KASPAD_BIN or docker
    const binaryPath = options.binaryPath || process.env.KASPAD_BIN;

    // A Docker node's image taken from HARDKAS_KASPAD_IMAGE must be pinned by digest (the rule of `hardkas node start`
    // and the node runner), decided before any directory is made or Docker is asked anything: NODE_IMAGE_DIGEST_REQUIRED.
    const envImage = process.env.HARDKAS_KASPAD_IMAGE;
    if (!binaryPath && envImage !== undefined && !isPinnedImageReference(envImage)) {
      throw Object.assign(
        new Error(
          `[${NODE_IMAGE_DIGEST_REQUIRED}] HARDKAS_KASPAD_IMAGE '${envImage}' is not pinned by digest. The simnet harness runs only ` +
            `an image pinned as <repository>[:tag]@sha256:<64 hex digits> (a tag can move to other bytes). Nothing was started.`
        ),
        { code: NODE_IMAGE_DIGEST_REQUIRED }
      );
    }

    // Host-side data for a container (bind-mounted on /app/data): an explicit root, the level's variable, or the OS temp
    // directory when the caller asks for persistent data. Without it the container keeps its data in an anonymous volume
    // and cannot be restarted with its chain.
    const dataRoot =
      options.dataRoot ??
      (process.env[HARDKAS_TEST_SIMNET_DATA_ROOT_ENV]?.trim() || undefined) ??
      (options.persistData ? os.tmpdir() : undefined);
    const hostDataDir = !binaryPath && dataRoot ? path.join(dataRoot, `hardkas-simnet-${rpcPort}-${stamp}`) : undefined;
    if (hostDataDir) fs.mkdirSync(hostDataDir, { recursive: true });
    const dataDir = hostDataDir ?? path.join(os.tmpdir(), `hardkas-simnet-${stamp}`);
    const labels = options.labels ?? parseSimnetExtraLabels(process.env[HARDKAS_TEST_SIMNET_LABELS_ENV]);

    let child: ChildProcess | undefined;
    let containerName: string | undefined;
    let p2pPort: number | undefined;
    let dockerImage = "";

    if (binaryPath) {
      p2pPort = await this.getFreePort();
      const args = buildSimnetBinaryArgs({ rpcPort, p2pPort, appDir: dataDir, utxoIndex: options.utxoIndex, txIndex: options.txIndex });
      child = spawn(binaryPath, args, { stdio: "ignore" });
      trackBinaryNode(child, dataDir);
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

      dockerImage = envImage ?? KASPAD_REFERENCE_IMAGE;
      // Name the container. Without a name Docker assigns a random one, which
      // leaves the node unaddressable (nothing can join its network namespace)
      // and unkillable by anything but the `docker run` client process.
      containerName = `hardkas-simnet-${rpcPort}`;
      await new Promise((resolve) => {
        const rm = spawn("docker", buildSimnetDockerRemoveArgs(containerName!), { stdio: "ignore" });
        rm.on("exit", () => resolve(true));
        rm.on("error", () => resolve(true));
      });
      const args = buildSimnetDockerRunArgs({
        containerName,
        rpcPort,
        image: dockerImage,
        runId: resolveHarnessRunId(),
        utxoIndex: options.utxoIndex,
        txIndex: options.txIndex,
        labels,
        hostDataDir
      });
      child = spawn("docker", args, { stdio: "ignore" });
      trackContainer(containerName);
    }

    if (!child) throw new Error("Failed to start Simnet Node");

    let spawnError: Error | undefined = undefined;
    let processExited = false;
    let exitedWith = "";
    const watch = (proc: ChildProcess) => {
      spawnError = undefined;
      processExited = false;
      exitedWith = "";
      proc.on("error", (err: any) => {
        console.warn("[SimnetNodeHarness] Child process error:", err.message);
        spawnError = err;
      });
      proc.on("exit", (code, signal) => {
        processExited = true;
        exitedWith = signal ? `signal ${signal}` : `code ${code}`;
      });
    };
    watch(child);

    // Stops the node and waits for it to be gone, leaving its data: a container is stopped gracefully (`docker stop`,
    // kaspad flushes its database) and removed (with --rm it already is); a binary gets SIGTERM and up to 20 s.
    const stopKeepingData = async (): Promise<void> => {
      const proc = child;
      const exited = new Promise<void>((resolve) => {
        if (!proc || proc.exitCode !== null || proc.signalCode !== null) return resolve();
        const timer = setTimeout(resolve, 30_000);
        proc.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      if (containerName) {
        await new Promise((resolve) => {
          const stop = spawn("docker", ["stop", "-t", "20", containerName!], { stdio: "ignore" });
          stop.on("exit", () => resolve(true));
          stop.on("error", () => resolve(true));
        });
        await exited;
        await new Promise((resolve) => {
          const rm = spawn("docker", ["rm", "-f", containerName!], { stdio: "ignore" });
          rm.on("exit", () => resolve(true));
          rm.on("error", () => resolve(true));
        });
      } else {
        proc?.kill("SIGTERM");
        await exited;
      }
    };

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
            throw new Error(
              `ENVIRONMENT_NOT_QUALIFIED: Spawn error (${spawnError?.message}) or process exited${exitedWith ? ` (${exitedWith})` : ""}. Node failed to start.`
            );
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
        // The same node again: same endpoint, same container name, same data, without --reset-db, so the chain (and the
        // UTXO index) survive and only the process is new. The mempool is not persisted by kaspad: a transaction that
        // was only there is gone after the restart, as on any real node.
        if (!binaryPath && !hostDataDir) {
          const err = new Error(
            `SIMNET_RESTART_NEEDS_HOST_DATA: a container restart keeps its chain only with host-side data ` +
              `(start with dataRoot or persistData, or set ${HARDKAS_TEST_SIMNET_DATA_ROOT_ENV}).`
          );
          (err as any).code = "SIMNET_RESTART_NEEDS_HOST_DATA";
          throw err;
        }
        await stopKeepingData();
        if (binaryPath) {
          const args = buildSimnetBinaryArgs({
            rpcPort,
            p2pPort: p2pPort!,
            appDir: dataDir,
            utxoIndex: options.utxoIndex,
            txIndex: options.txIndex,
            resetDb: false
          });
          if (child) startedBinaries.delete(child);
          child = spawn(binaryPath, args, { stdio: "ignore" });
          trackBinaryNode(child, dataDir);
        } else {
          const args = buildSimnetDockerRunArgs({
            containerName: containerName!,
            rpcPort,
            image: dockerImage,
            runId: resolveHarnessRunId(),
            utxoIndex: options.utxoIndex,
            txIndex: options.txIndex,
            labels,
            hostDataDir,
            resetDb: false
          });
          child = spawn("docker", args, { stdio: "ignore" });
          trackContainer(containerName!);
        }
        watch(child);
        (handle as { processId?: number | undefined }).processId = child.pid;
        await handle.waitUntilReady({ timeoutMs: options.startupTimeoutMs ?? 90_000 });
      },
      stop: async () => {
        child?.kill("SIGTERM");
        if (containerName) await removeContainer(containerName);
        else await removeBinaryNodeData(child, dataDir);
      },
      kill: async () => {
        child?.kill("SIGKILL");
        if (containerName) await removeContainer(containerName);
        else await removeBinaryNodeData(child, dataDir);
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
      // HK-01: the canonical endpoint must be a verified rusty-kaspad (container + digest + endpoint): never a simulator
      // that happens to listen there, whatever the environment says.
      identity = assertNodeKind(await verifyNodeIdentity(), "rusty-kaspad");
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
    // INT9-C: inside HARDKAS_TEST_SIMNET_PORT_RANGE when it is set
    const range = parseSimnetPortRange(process.env[HARDKAS_TEST_SIMNET_PORT_RANGE_ENV]);
    if (range) return pickSimnetHostPort(range, simnetHostPortIsFree);
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
