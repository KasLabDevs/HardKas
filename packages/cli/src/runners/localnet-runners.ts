import { getOutput } from "../output.js";
import { UI, handleError } from "../ui.js";
import { loadHardkasConfig, resolveExecutionTarget } from "@hardkas/config";
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
const OFFICIAL_MINER_IMAGE = "kaspanet/cpuminer@sha256:60f78ab2828ab24b249c99210eee5a2825303a5226154260dd021ff26d46748b";
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
  const profile = opts.profile;

  if (!profile || profile === "simulated") {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("LOCALNET_PROFILE_REQUIRED", "A profile is required to start localnet. Use --profile toccata-v2 for Docker Toccata v2 simnet.", { exitCode: 1 });
  }

  if (profile !== TOCCATA_PROFILE) {
    throw new Error(`Unsupported localnet profile: ${profile}`);
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
  let address: string;

  const { resolveHardkasAccount } = await import("@hardkas/accounts");
  let account;
  try {
    account = resolveHardkasAccount({ nameOrAddress: opts.identifier, config });
    address = account.address || opts.identifier;
  } catch {
    address = opts.identifier;
  }

  // ENFORCE EXECUTION GUARD FOR FUNDING
  const { assertExecutionCompatibility } = await import("@hardkas/core");
  const target = {
    mode: "localnet",
    domain: "kaspa-l1",
    network: "simnet"
  } as const;

  if (account) {
    assertExecutionCompatibility({
      operation: "fund",
      target,
      account: {
        kind: account.kind,
        network: (account as any).network,
        executionMode: (account as any).executionMode
      }
    });
  } else {
    // If it was just a string literal that wasn't resolved to a HardkasAccount
    if (!address.startsWith("kaspasim:")) {
      throw new Error("TOCCATA_FUNDING_REQUIRES_SIMNET_ADDRESS: " + address);
    }
  }

  const before = await getAddressFundingState(address, !!opts.json);
  await restartToccataMiner(address);

  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.create({ cwd: opts.workspaceRoot || process.cwd() });
  
  const timeoutMs = opts.timeoutMs ?? 300000;
  const targetAmount = opts.amountSompi 
    ? before.matureBalanceSompi + opts.amountSompi 
    : before.matureBalanceSompi + 1n; // wait for any increase
    
  try {
    await sdk.utxos.waitForCoinbaseSpendable({
      address,
      minAmount: targetAmount,
      timeoutMs
    });
  } catch (e: any) {
    if (e.code !== "COINBASE_MATURITY_TIMEOUT") {
      throw e;
    }
    // if it timed out, it will be caught below by the status check
  }

  const current = await getAddressFundingState(address, !!opts.json);

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
  const { target } = resolveExecutionTarget({ config, network: opts.network });

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



async function restartToccataMiner(address: string) {
  await execa("docker", ["rm", "-f", TOCCATA_MINER_CONTAINER]).catch(() => {});
  await execa("docker", [
    "run",
    "-d",
    "--name",
    TOCCATA_MINER_CONTAINER,
    "--network",
    "container:hardkas-kaspad-toccata-v2",
    OFFICIAL_MINER_IMAGE,
    "-a",
    address,
    "-s",
    "127.0.0.1",
    "-p",
    "16210",
    "--mine-when-not-synced",
    "-t",
    "1"
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
      image: OFFICIAL_MINER_IMAGE,
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
