import { getOutput } from "../output.js";
import { UI, handleError } from "../ui.js";
import { loadHardkasConfig, resolveNetworkTarget } from "@hardkas/config";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { forkFromNetwork, saveLocalnetState } from "@hardkas/localnet";
import { resolve } from "node:path";
import fs from "node:fs/promises";
import { withLock } from "@hardkas/core";
import { DockerKaspadRunner } from "@hardkas/node-runner";
import { resolveHardkasAccountAddress, listHardkasAccounts } from "@hardkas/accounts";
import { execa } from "execa";
import { HardkasSchemas } from "@hardkas/artifacts";

const TOCCATA_PROFILE = "toccata-v2";
const TOCCATA_IMAGE = "kaspanet/rusty-kaspad:v2.0.0";
const TOCCATA_MINER_IMAGE = "hardkas/stratum-bridge:v2.0.0-local-simnet-unsynced";
const TOCCATA_MINER_CONTAINER = "hardkas-toccata-stratum-v2";
const TOCCATA_RPC_URL = "ws://127.0.0.1:18210";
const TOCCATA_KASPAD_ADDRESS = "host.docker.internal:16210";

export interface LocalnetStartOptions {
  profile?: string;
  json?: boolean;
  workspaceRoot?: string;
}

export interface LocalnetStatusOptions {
  json?: boolean;
  workspaceRoot?: string;
}

export interface LocalnetFundOptions {
  identifier: string;
  amountSompi?: bigint;
  profile?: string;
  json?: boolean;
  timeoutMs?: number;
  keepMiner?: boolean;
  workspaceRoot?: string;
}

export async function runLocalnetStart(opts: LocalnetStartOptions): Promise<void> {
  const profile = opts.profile || "simulated";

  if (profile !== TOCCATA_PROFILE) {
    UI.info("Simulated localnet state is created lazily by HardKAS commands.");
    UI.info(`Use --profile ${TOCCATA_PROFILE} for Docker Toccata v2 simnet.`);
    return;
  }

  const existing = await detectToccataNode(!!opts.json);
  if (existing.ready) {
    const payload = {
      schema: HardkasSchemas.LocalnetStatusV1,
      profile,
      node: existing,
      status: "TOCCATA_NODE_READY"
    };
    if (opts.json) {
      getOutput().writeJson(payload);
    } else {
      UI.success("TOCCATA_NODE_READY");
      UI.info(`RPC: ${TOCCATA_RPC_URL}`);
      UI.info(`Version: ${existing.serverVersion || "unknown"}`);
      UI.info(`DAA: ${existing.virtualDaaScore || "unknown"}`);
    }
    return;
  }

  const runner = new DockerKaspadRunner({
    cwd: opts.workspaceRoot || process.cwd(),
    image: TOCCATA_IMAGE,
    containerName: "hardkas-kaspad-toccata-v2",
    network: "simnet",
    allowFloatingImage: false
  });
  const status = await runner.start();

  const payload = {
    schema: HardkasSchemas.LocalnetStatusV1,
    profile,
    status: status.rpcReady ? "TOCCATA_NODE_READY" : "TOCCATA_NODE_STARTING",
    node: status
  };

  if (opts.json) {
    getOutput().writeJson(payload);
  } else {
    UI.success(payload.status);
    UI.info(`Image: ${status.image}`);
    UI.info(`Container: ${status.containerName}`);
    UI.info(`RPC: ${status.rpcUrl}`);
  }
}

export async function runLocalnetStop(opts: { json?: boolean; profile?: string; workspaceRoot?: string }): Promise<void> {
  const profile = opts.profile || TOCCATA_PROFILE;

  if (profile !== TOCCATA_PROFILE) {
    if (!opts.json) {
      UI.info("Simulated localnet state is managed in-memory.");
    }
    return;
  }

  await execa("docker", ["stop", "hardkas-kaspad-toccata-v2"]).catch(() => {});
  await stopToccataMiner();

  if (opts.json) {
    getOutput().writeJson({ schema: HardkasSchemas.LocalnetStatusV1, profile, status: "TOCCATA_NODE_STOPPED" });
  } else {
    UI.success("Localnet stopped");
  }
}

export async function runLocalnetStatus(opts: LocalnetStatusOptions): Promise<void> {
  const node = await detectToccataNode(!!opts.json);
  const miner = await inspectDockerContainer(TOCCATA_MINER_CONTAINER);

  const payload = {
    schema: HardkasSchemas.LocalnetStatusV1,
    profile: TOCCATA_PROFILE,
    node,
    miner,
    simulationLevels: {
      artifactCoherence: "READY",
      runtimeOutcome: "PARTIAL",
      vmConsensusEquivalence: "NOT_CLAIMED"
    }
  };

  if (opts.json) {
    getOutput().writeJson(payload);
    return;
  }

  UI.header("HardKAS Toccata Localnet");
  UI.info(`Node:  ${node.ready ? "TOCCATA_NODE_READY" : "TOCCATA_NODE_UNAVAILABLE"}`);
  UI.info(`Miner: ${miner.running ? "TOCCATA_MINER_RUNNING" : "TOCCATA_MINER_STOPPED"}`);
  if (node.serverVersion) UI.info(`Version: ${node.serverVersion}`);
  if (node.virtualDaaScore) UI.info(`DAA: ${node.virtualDaaScore}`);
}

export async function runLocalnetFund(opts: LocalnetFundOptions): Promise<void> {
  const profile = opts.profile || TOCCATA_PROFILE;
  if (profile !== TOCCATA_PROFILE) {
    throw new Error(`Unsupported localnet funding profile: ${profile}`);
  }

  const { config } = await loadHardkasConfig({});
  let address: string | undefined;

  const allAccounts = listHardkasAccounts(config);

  // 1. Keychain profiles
  const keychain = allAccounts.find((a: any) => a.name === opts.identifier && a.keystorePath?.includes("keystore"));
  if (keychain?.address) address = keychain.address;

  // 2. Fixture accounts
  if (!address) {
    const fixture = allAccounts.find((a: any) => a.name === opts.identifier && a.kind === "simulated");
    if (fixture?.address) address = fixture.address;
  }

  // 3. Simnet dev accounts
  if (!address) {
    const devAccount = allAccounts.find((a: any) => a.name === opts.identifier && a.keystorePath?.includes("dev-accounts"));
    if (devAccount?.address) address = devAccount.address;
  }

  // 4. Literal Kaspa address
  if (!address) {
    address = await resolveHardkasAccountAddress(opts.identifier, config);
  }

  if (!address.startsWith("kaspasim:")) {
    throw new Error("TOCCATA_FUNDING_REQUIRES_SIMNET_ADDRESS");
  }

  const before = await getAddressFundingState(address, !!opts.json);
  await ensureToccataMinerImage();
  await restartToccataMiner(address);

  const timeoutMs = opts.timeoutMs ?? 300000;
  const deadline = Date.now() + timeoutMs;
  let current = before;
  while (Date.now() < deadline) {
    await sleep(5000);
    current = await getAddressFundingState(address, !!opts.json);
    if (
      current.matureUtxoCount > before.matureUtxoCount ||
      current.matureBalanceSompi > before.matureBalanceSompi
    ) {
      break;
    }
  }

  if (!opts.keepMiner) {
    await stopToccataMiner();
  }

  const status =
    current.matureBalanceSompi > before.matureBalanceSompi
      ? "TOCCATA_ACCOUNT_FUNDED"
      : "TOCCATA_FUNDING_PENDING_MATURITY";

  const payload = {
    schema: HardkasSchemas.LocalnetFundingV1,
    profile,
    status,
    address,
    before,
    after: current,
    miner: await inspectDockerContainer(TOCCATA_MINER_CONTAINER)
  };

  if (opts.json) {
    getOutput().writeLine(JSON.stringify(payload, bigintReplacer, 2));
    return;
  }

  if (status === "TOCCATA_ACCOUNT_FUNDED") {
    UI.success(status);
  } else {
    UI.warning(status);
  }
  UI.info(`Address: ${address}`);
  UI.info(`Mature balance: ${current.matureBalanceSompi.toString()} sompi`);
}

export async function runLocalnetFork(opts: {
  network: string;
  addresses: string[];
  atDaaScore?: string;
  outputPath?: string;
  workspaceRoot?: string;
}): Promise<void> {
  const wsRoot = opts.workspaceRoot || process.cwd();
  UI.header(`HardKAS Localnet Fork`);

  const { config } = await loadHardkasConfig();
  const { target } = resolveNetworkTarget({ config, network: opts.network });

  if (target.kind === "simulated") {
    throw new Error("Cannot fork from a simulated network.");
  }

  const targetObj = target as unknown as Record<string, unknown>;
  const rpcUrl = typeof targetObj.rpcUrl === "string" ? targetObj.rpcUrl : undefined;
  if (!rpcUrl) throw new Error(`No RPC URL configured for network '${opts.network}'.`);

  UI.info(`Forking from: ${opts.network} (${rpcUrl})`);
  if (opts.addresses.length > 0) {
    UI.info(`Addresses: ${opts.addresses.join(", ")}`);
  } else {
    UI.warning("No addresses specified. Forked state will be empty.");
  }

  const client = new JsonWrpcKaspaClient({ rpcUrl });
  try {
    await withLock(
      {
        rootDir: wsRoot,
        name: "workspace",
        command: "hardkas localnet fork"
      },
      async () => {
        const state = await forkFromNetwork(client, {
          network: opts.network,
          rpcUrl,
          addresses: opts.addresses,
          ...(opts.atDaaScore ? { atDaaScore: opts.atDaaScore } : {})
        });

        const outputPath = opts.outputPath
          ? resolve(opts.outputPath)
          : resolve(wsRoot, ".hardkas", "localnet.json");

        await saveLocalnetState(state, outputPath);

        UI.success(`Forked state saved to: ${outputPath}`);
        UI.info(`DAA Score: ${state.daaScore}`);
        UI.info(`UTXOs: ${state.utxos.length}`);
      }
    );
  } catch (e: unknown) {
    if (((e as any).name) === "HardkasCliError") throw e;
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("FORKING_FAILED", `Forking failed: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`, {
      exitCode: 1,
      cause: e
    });
  } finally {
    await client.close();
  }
}

async function detectToccataNode(quiet = false) {
  const client = new JsonWrpcKaspaClient({ rpcUrl: TOCCATA_RPC_URL, timeoutMs: 3000 });
  try {
    const { server, info } = await withOptionalSilentConsole(quiet, async () => ({
      server: await client.getServerInfo(),
      info: await client.getInfo()
    }));
    await client.close();
    const serverNetworkId = String(server.networkId || "");
    return {
      ready: true,
      rpcUrl: TOCCATA_RPC_URL,
      networkId:
        serverNetworkId === "unknown"
          ? "simnet"
          : server.networkId || info.networkId || "simnet",
      serverVersion: server.serverVersion || info.serverVersion,
      isSynced: server.isSynced ?? info.isSynced,
      virtualDaaScore: info.virtualDaaScore?.toString()
    };
  } catch (error: unknown) {
    await client.close().catch(() => {});
    return {
      ready: false,
      rpcUrl: TOCCATA_RPC_URL,
      lastError: (error instanceof Error ? error.message : String(error))
    };
  }
}

async function ensureToccataMinerImage() {
  try {
    await execa("docker", ["image", "inspect", TOCCATA_MINER_IMAGE]);
  } catch {
    throw new Error(
      `TOCCATA_MINER_COMPANION_UNAVAILABLE: Docker image '${TOCCATA_MINER_IMAGE}' was not found.\n` +
        "Build the v2 stratum companion from kaspanet/rusty-kaspa v2.0.0 before running localnet fund."
    );
  }
}

async function restartToccataMiner(address: string) {
  await execa("docker", ["rm", "-f", TOCCATA_MINER_CONTAINER]).catch(() => {});
  await execa("docker", [
    "run",
    "-d",
    "--name",
    TOCCATA_MINER_CONTAINER,
    "--add-host=host.docker.internal:host-gateway",
    TOCCATA_MINER_IMAGE,
    "/app/stratum-bridge",
    "--node-mode",
    "external",
    "--kaspad-address",
    TOCCATA_KASPAD_ADDRESS,
    "--web-dashboard-port",
    ":3031",
    "--instance",
    "port=:16120,diff=1",
    "--internal-cpu-miner",
    "--internal-cpu-miner-address",
    address,
    "--internal-cpu-miner-threads",
    "1",
    "--internal-cpu-miner-template-poll-ms",
    "250",
    "--print-stats",
    "true",
    "--log-to-file",
    "false"
  ]);
}

async function stopToccataMiner() {
  await execa("docker", ["stop", TOCCATA_MINER_CONTAINER]).catch(() => {});
}

async function inspectDockerContainer(name: string) {
  try {
    const { stdout } = await execa("docker", [
      "inspect",
      "--format",
      "{{.State.Status}}|{{.Config.Image}}|{{.Name}}",
      name
    ]);
    const [status, image, rawName] = stdout.trim().split("|");
    return {
      exists: true,
      running: status === "running",
      status,
      image,
      name: rawName?.replace(/^\//, "") || name
    };
  } catch {
    return {
      exists: false,
      running: false,
      status: "not-found",
      image: TOCCATA_MINER_IMAGE,
      name
    };
  }
}

async function getAddressFundingState(address: string, quiet = false) {
  const client = new JsonWrpcKaspaClient({ rpcUrl: TOCCATA_RPC_URL, timeoutMs: 10000 });
  try {
    const { info, utxos } = await withOptionalSilentConsole(quiet, async () => ({
      info: await client.getInfo(),
      utxos: await client.getUtxosByAddress(address)
    }));
    const virtualDaaScore = info.virtualDaaScore ?? 0n;
    const matureUtxos = utxos.filter((utxo) => {
      if (!utxo.isCoinbase) return true;
      if (utxo.blockDaaScore === undefined) return false;
      return virtualDaaScore - BigInt(utxo.blockDaaScore) >= 1000n;
    });
    await client.close();
    return {
      balanceSompi: utxos.reduce((sum, utxo) => sum + utxo.amountSompi, 0n),
      matureBalanceSompi: matureUtxos.reduce((sum, utxo) => sum + utxo.amountSompi, 0n),
      utxoCount: utxos.length,
      matureUtxoCount: matureUtxos.length,
      virtualDaaScore: virtualDaaScore.toString()
    };
  } finally {
    await client.close().catch(() => {});
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

async function withOptionalSilentConsole<T>(
  quiet: boolean,
  fn: () => Promise<T>
): Promise<T> {
  if (!quiet) return fn();
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = originalLog;
  }
}
