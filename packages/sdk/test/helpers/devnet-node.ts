import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { CPUMINER_REFERENCE_IMAGE, KASPAD_REFERENCE_IMAGE } from "@hardkas/core";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import {
  HARDKAS_TEST_SIMNET_DATA_ROOT_ENV,
  HARDKAS_TEST_SIMNET_LABELS_ENV,
  HARDKAS_TEST_SIMNET_PORT_RANGE_ENV,
  SIMNET_HARNESS_RUN_LABEL,
  parseSimnetExtraLabels,
  parseSimnetPortRange,
  pickSimnetHostPort,
  resolveHarnessRunId,
  simnetHostPortIsFree
} from "../../../testing/src/simnet-node-harness.js";

// -----------------------------------------------------------------------------
// A test's own rusty-kaspad --devnet node and its cpuminer, in Docker (test helper only; not part of @hardkas/testing).
//
// Devnet is not simnet: blocks need real proof of work (the harness's getBlockTemplate/submitBlock miner is a simnet
// device), so a cpuminer runs in the node's network namespace and mines to one address all the time. A coinbase is
// spendable after 1000 DAA (rusty-kaspa v2.1.0 consensus, 10 BPS; tx-builder applies the same floor on devnet). The node
// says isSynced only once it mines blocks with current timestamps, and HardKAS's send needs that. Addresses are
// `kaspadev:`.
//
// Same level variables as the harness: HARDKAS_TEST_SIMNET_LABELS (extra labels), HARDKAS_TEST_SIMNET_PORT_RANGE (the host
// port of the JSON wRPC, published on 127.0.0.1 only; gRPC and P2P stay inside the container), HARDKAS_TEST_SIMNET_DATA_ROOT
// (host data, under <root>/<name>). Own variables:
//   HARDKAS_TEST_DEVNET_NAME      the node container's name (the miner is <name>-miner); default hardkas-devnet-<port>
//   HARDKAS_TEST_DEVNET_DATA_DIR  the node's host data directory (default <data root>/<name>, if a data root is set)
//   HARDKAS_TEST_DEVNET_KEEP=1    keep both containers: stopped, never removed, at the end; a stopped pair of that name (with
//                                 these labels, this image, this mining address) is started again with its chain
// Without KEEP the containers carry the level's run label and are removed at the end (and by the level's teardown sweep).
// Only containers this helper created are ever started, stopped or removed.
// -----------------------------------------------------------------------------

/** rusty-kaspa v2.1.0 devnet coinbase maturity (DAA): COINBASE_MATURITY_SECONDS 100 at 10 BPS. */
export const DEVNET_CONSENSUS_COINBASE_MATURITY_DAA = 1_000n;

const ROLE_LABEL = "hardkas.devnet.role";
const FORBIDDEN_NAMES = new Set(["hardkas-kaspad-toccata-v2", "hardkas-toccata-miner"]);

export interface DevnetNodeOptions {
  /** The address the miner pays (a `kaspadev:` P2PK address). */
  readonly miningAddress: string;
  readonly minerThreads?: number | undefined;
  readonly startupTimeoutMs?: number | undefined;
}

export interface DevnetNode {
  readonly rpcUrl: string;
  readonly rpcPort: number;
  readonly containerName: string;
  readonly minerContainerName: string;
  readonly image: string;
  readonly minerImage: string;
  readonly rpc: JsonWrpcKaspaClient;
  /** true when an existing stopped pair was started again (its chain kept). */
  readonly reused: boolean;
  readonly keep: boolean;
  readonly dataDir: string | undefined;
  /** The containers as Docker reports them (name, id, image, digests, args, labels, ports, mounts, state). */
  describe(): Record<string, unknown>;
  /** Until `address` holds at least `minSompi` in mature coins without a covenant id (the miner keeps mining). */
  waitForMatureFunds(address: string, minSompi: bigint, timeoutMs?: number): Promise<{ matureSompi: bigint; coins: number; virtualDaaScore: bigint; waitedMs: number }>;
  stop(): Promise<void>;
}

function docker(args: string[], allowFail = false): string {
  const r = spawnSync("docker", args, { encoding: "utf8", timeout: 120_000 });
  if (r.status !== 0 && !allowFail) throw new Error(`DEVNET_DOCKER_FAILED: docker ${args.join(" ")}: ${(r.stderr || r.stdout || String(r.error ?? "")).trim()}`);
  return String(r.stdout ?? "").trim();
}

function inspect(name: string): any | undefined {
  const r = spawnSync("docker", ["container", "inspect", name], { encoding: "utf8", timeout: 60_000 });
  if (r.status !== 0) return undefined;
  return JSON.parse(r.stdout)[0];
}

function containerFacts(name: string): Record<string, unknown> | undefined {
  const c = inspect(name);
  if (!c) return undefined;
  const img = JSON.parse(docker(["image", "inspect", c.Image], true) || "[{}]")[0] ?? {};
  return {
    name: String(c.Name).replace(/^\//, ""),
    id: c.Id,
    configImage: c.Config?.Image,
    imageId: c.Image,
    repoDigests: img.RepoDigests,
    path: c.Path,
    args: c.Args,
    labels: c.Config?.Labels,
    networkMode: c.HostConfig?.NetworkMode,
    portBindings: c.HostConfig?.PortBindings,
    mounts: (c.Mounts ?? []).map((m: any) => `${m.Source} -> ${m.Destination}`),
    state: { status: c.State?.Status, running: c.State?.Running, startedAt: c.State?.StartedAt }
  };
}

async function freeLoopbackPort(): Promise<number> {
  const range = parseSimnetPortRange(process.env[HARDKAS_TEST_SIMNET_PORT_RANGE_ENV]);
  if (range) return pickSimnetHostPort(range, simnetHostPortIsFree);
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function serverInfoOf(rpcUrl: string): Promise<any | undefined> {
  const client = new JsonWrpcKaspaClient({ rpcUrl, timeoutMs: 5_000 });
  try {
    return await client.getServerInfo();
  } catch {
    return undefined;
  } finally {
    await client.close().catch(() => {});
  }
}

/** The labels a container of this helper must carry to be started again (never one it did not create). */
function assertOwn(c: any, role: "node" | "miner", image: string, extra: Record<string, string>, more: Record<string, string>): void {
  const labels: Record<string, string> = c?.Config?.Labels ?? {};
  const want: Record<string, string> = { [ROLE_LABEL]: role, ...extra, ...more };
  for (const [key, value] of Object.entries(want)) {
    if (labels[key] !== value) {
      throw new Error(`DEVNET_CONTAINER_NOT_OURS: ${String(c?.Name)} has ${key}=${labels[key] ?? "(none)"}, expected ${value}; it is left as it is`);
    }
  }
  if (c?.Config?.Image !== image) throw new Error(`DEVNET_CONTAINER_IMAGE_MISMATCH: ${String(c?.Name)} runs ${c?.Config?.Image}, expected ${image}; it is left as it is`);
}

/** Starts (or, with KEEP, starts again) an own devnet node and its miner; resolves once the node is synced and mining. */
export async function startDevnetNode(options: DevnetNodeOptions): Promise<DevnetNode> {
  if (!/^kaspadev:[a-z0-9]+$/.test(options.miningAddress)) throw new Error(`DEVNET_MINING_ADDRESS_INVALID: ${options.miningAddress} is not a kaspadev: address`);
  const image = process.env.HARDKAS_KASPAD_IMAGE ?? KASPAD_REFERENCE_IMAGE;
  const minerImage = CPUMINER_REFERENCE_IMAGE;
  const keep = process.env.HARDKAS_TEST_DEVNET_KEEP === "1";
  const extra = parseSimnetExtraLabels(process.env[HARDKAS_TEST_SIMNET_LABELS_ENV]);
  const startupTimeoutMs = options.startupTimeoutMs ?? 600_000;
  const threads = options.minerThreads ?? 2;

  const named = process.env.HARDKAS_TEST_DEVNET_NAME?.trim() || undefined;
  if (named !== undefined && (!/^[a-z0-9][a-z0-9_.-]*$/.test(named) || FORBIDDEN_NAMES.has(named) || FORBIDDEN_NAMES.has(`${named}-miner`) || named.startsWith("hardkas-simnet-"))) {
    throw new Error(`DEVNET_NAME_INVALID: '${named}' (HARDKAS_TEST_DEVNET_NAME) is not a name this helper may use`);
  }

  let rpcPort: number;
  let reused = false;
  let name: string;
  const existing = named ? inspect(named) : undefined;
  if (existing) {
    if (!keep) throw new Error(`DEVNET_CONTAINER_EXISTS: ${named} exists; set HARDKAS_TEST_DEVNET_KEEP=1 to start it again, or choose another HARDKAS_TEST_DEVNET_NAME`);
    assertOwn(existing, "node", image, extra, {});
    rpcPort = Number(existing.Config.Labels["hardkas.devnet.rpcPort"]);
    if (!Number.isInteger(rpcPort)) throw new Error(`DEVNET_CONTAINER_NOT_OURS: ${named} names no hardkas.devnet.rpcPort`);
    name = named!;
    reused = true;
  } else {
    rpcPort = await freeLoopbackPort();
    name = named ?? `hardkas-devnet-${rpcPort}`;
  }
  const minerName = `${name}-miner`;
  const grpcPort = rpcPort + 1; // inside the container's network namespace only
  const p2pPort = rpcPort + 2; // idem
  const rpcUrl = `ws://127.0.0.1:${rpcPort}`;
  const dataRoot = process.env[HARDKAS_TEST_SIMNET_DATA_ROOT_ENV]?.trim() || undefined;
  const dataDir = process.env.HARDKAS_TEST_DEVNET_DATA_DIR?.trim() || (dataRoot ? path.join(dataRoot, name) : undefined);

  const runLabel = keep ? [] : ["--label", `${SIMNET_HARNESS_RUN_LABEL}=${resolveHarnessRunId()}`];
  const extraLabels = Object.entries(extra).flatMap(([key, value]) => ["--label", `${key}=${value}`]);
  const lifecycle = keep ? [] : ["--rm"];
  const logs = ["--log-opt", "max-size=10m", "--log-opt", "max-file=2"];

  if (reused) {
    if (!existing.State?.Running) docker(["start", name]);
  } else {
    if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
    docker([
      "run", "-d", ...lifecycle, "--name", name,
      "--label", `${ROLE_LABEL}=node`, "--label", `hardkas.devnet.rpcPort=${rpcPort}`, "--label", `hardkas.devnet.grpcPort=${grpcPort}`,
      ...runLabel, ...extraLabels, ...logs,
      "-p", `127.0.0.1:${rpcPort}:${rpcPort}`,
      ...(dataDir ? ["-v", `${dataDir}:/app/data`] : []),
      image,
      "kaspad", "--yes", "--nologfiles", "--disable-upnp", "--devnet", "--utxoindex", "--appdir=/app/data",
      `--rpclisten=127.0.0.1:${grpcPort}`, `--rpclisten-json=0.0.0.0:${rpcPort}`, `--listen=127.0.0.1:${p2pPort}`,
      "--enable-unsynced-mining", "--externalip=127.0.0.1", "--nodnsseed"
    ]);
  }

  // the node first: a miner started before the node opens gRPC exits with an error
  const deadline = Date.now() + startupTimeoutMs;
  for (;;) {
    const info = await serverInfoOf(rpcUrl);
    if (info && info.networkId === "devnet" && info.hasUtxoIndex !== false) break;
    if (info && info.networkId !== "devnet" && info.networkId !== "unknown") throw new Error(`DEVNET_NODE_WRONG_NETWORK: ${rpcUrl} says ${info.networkId}`);
    const c = inspect(name);
    if (!c || !c.State?.Running) throw new Error(`DEVNET_NODE_EXITED: ${name} is ${c ? c.State?.Status : "gone"}`);
    if (Date.now() > deadline) throw new Error(`DEVNET_NODE_TIMEOUT: ${rpcUrl} did not answer as a devnet node in ${startupTimeoutMs} ms`);
    await sleep(1_000);
  }

  const minerMore = { "hardkas.devnet.node": name, "hardkas.devnet.miningAddress": options.miningAddress };
  const ensureMiner = () => {
    const m = inspect(minerName);
    if (m) {
      assertOwn(m, "miner", minerImage, extra, minerMore);
      if (!m.State?.Running) docker(["start", minerName]);
      return;
    }
    docker([
      "run", "-d", ...lifecycle, "--name", minerName,
      "--label", `${ROLE_LABEL}=miner`, "--label", `hardkas.devnet.node=${name}`, "--label", `hardkas.devnet.miningAddress=${options.miningAddress}`,
      ...runLabel, ...extraLabels, ...logs,
      "--network", `container:${name}`,
      minerImage,
      "--mining-address", options.miningAddress, "--kaspad-address", "127.0.0.1", "--port", String(grpcPort), "--threads", String(threads), "--mine-when-not-synced"
    ]);
  };
  ensureMiner();

  // synced and mining: the node says isSynced and its DAA score moves
  const rpc = new JsonWrpcKaspaClient({ rpcUrl, expectedNetworkId: "devnet" });
  let firstDaa: bigint | undefined;
  for (;;) {
    const info = await serverInfoOf(rpcUrl);
    const daa = info?.virtualDaaScore !== undefined ? BigInt(info.virtualDaaScore) : undefined;
    if (daa !== undefined && firstDaa === undefined) firstDaa = daa;
    if (info?.isSynced === true && daa !== undefined && firstDaa !== undefined && daa >= firstDaa + 5n) break;
    if (Date.now() > deadline) throw new Error(`DEVNET_NODE_NOT_MINING: ${rpcUrl} isSynced=${String(info?.isSynced)} DAA ${String(daa)} (from ${String(firstDaa)}) in ${startupTimeoutMs} ms`);
    ensureMiner();
    await sleep(2_000);
  }

  return {
    rpcUrl,
    rpcPort,
    containerName: name,
    minerContainerName: minerName,
    image,
    minerImage,
    rpc,
    reused,
    keep,
    dataDir,
    describe: () => ({
      keep,
      reused,
      rpcUrl,
      grpcPortInsideContainer: grpcPort,
      p2pPortInsideContainer: p2pPort,
      dataDir,
      miningAddress: options.miningAddress,
      minerThreads: threads,
      node: containerFacts(name),
      miner: containerFacts(minerName)
    }),
    async waitForMatureFunds(address, minSompi, timeoutMs = 2_400_000) {
      const t0 = Date.now();
      let lastLog = 0;
      for (;;) {
        const dag = await rpc.getBlockDagInfo();
        const daa = BigInt(dag.virtualDaaScore ?? 0);
        const utxos = await rpc.getUtxosByAddress(address);
        let mature = 0n;
        let coins = 0;
        for (const u of utxos as any[]) {
          if (u.covenantId) continue;
          // a margin of 10 DAA over the consensus rule, so that the planner (the same 1000) agrees a moment later
          if (u.isCoinbase && daa < BigInt(u.blockDaaScore) + DEVNET_CONSENSUS_COINBASE_MATURITY_DAA + 10n) continue;
          mature += BigInt(u.amountSompi);
          coins++;
        }
        if (mature >= minSompi) return { matureSompi: mature, coins, virtualDaaScore: daa, waitedMs: Date.now() - t0 };
        if (Date.now() - t0 > timeoutMs) throw new Error(`DEVNET_FUNDING_TIMEOUT: ${address} holds ${mature} mature sompi (${utxos.length} UTXOs) at DAA ${daa}, needs ${minSompi}`);
        if (Date.now() - lastLog > 60_000) {
          lastLog = Date.now();
          console.log(`[devnet-node] waiting for mature coins at ${address}: ${mature}/${minSompi} sompi, ${utxos.length} UTXOs, DAA ${daa}`);
        }
        ensureMiner();
        await sleep(10_000);
      }
    },
    async stop() {
      await rpc.close().catch(() => {});
      if (keep) {
        docker(["stop", "-t", "30", minerName], true);
        docker(["stop", "-t", "30", name], true);
      } else {
        docker(["rm", "-f", "-v", minerName], true);
        docker(["rm", "-f", "-v", name], true);
      }
    }
  };
}
