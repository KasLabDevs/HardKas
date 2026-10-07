import { getOutput } from "../output.js";
import { UI, handleError } from "../ui.js";
import { loadHardkasConfig, resolveExecutionTarget } from "@hardkas/config";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { forkFromNetwork, saveLocalnetState } from "@hardkas/localnet";
import { resolve } from "node:path";
import fs from "node:fs/promises";
import { withLock, sha256hex, UtxoSetNotStableError, CPUMINER_REFERENCE_IMAGE, CANONICAL_LOCALNET, nodeRpcUrl } from "@hardkas/core";
import { DockerKaspadRunner, verifyNodeIdentity, requireNodeIdentity } from "@hardkas/node-runner";
import { resolveHardkasAccountAddress, listHardkasAccounts } from "@hardkas/accounts";
import { execa } from "execa";
import { HardkasSchemas } from "@hardkas/artifacts";

// The canonical real localnet (@hardkas/core). The container name only locates
// the node; before using it, localnet proves its identity (verifyNodeIdentity).
const TOCCATA_PROFILE = CANONICAL_LOCALNET.profile;
const TOCCATA_IMAGE = CANONICAL_LOCALNET.image;
const OFFICIAL_MINER_IMAGE = CPUMINER_REFERENCE_IMAGE;
const TOCCATA_MINER_CONTAINER = CANONICAL_LOCALNET.minerContainerName;
const TOCCATA_NODE_CONTAINER = CANONICAL_LOCALNET.containerName;
const TOCCATA_RPC_URL = nodeRpcUrl();
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
  /** Keep mining to the funded account after funding (its balance keeps growing). */
  keepMiner?: boolean;
  /** Leave the chain stopped after funding: no liveness miner, no new blocks. */
  stopMiner?: boolean;
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

  const { ensureDevAccounts } = await import("@hardkas/accounts");
  await ensureDevAccounts(opts.workspaceRoot || process.cwd());

  const existing = await detectToccataNode(!!opts.json);

  if (existing.ready && !(await isManagedNodeRunning())) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "LOCALNET_PORT_CONFLICT",
      `${TOCCATA_RPC_URL} is already served by a node HardKAS does not manage ` +
        `(container ${TOCCATA_NODE_CONTAINER} is not running). Refusing to adopt it: ` +
        `localnet fund attaches the miner by container name and would fail. ` +
        `Stop the other node, or run 'hardkas localnet stop --profile ${TOCCATA_PROFILE}' first.`,
      { exitCode: 1 }
    );
  }

  if (existing.ready) {
    // Running under the canonical name is not enough: it must prove digest,
    // endpoint ownership, network and version before it is reported READY.
    const identity = await requireNodeIdentity();
    const payload = {
      schema: HardkasSchemas.LocalnetStatusV1,
      profile,
      node: existing,
      identity,
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
    containerName: TOCCATA_NODE_CONTAINER,
    network: "simnet",
    allowFloatingImage: false
  });
  // start() verifies the identity of the node it starts or adopts.
  const status = await runner.start();
  const identity = await runner.identity();

  const payload = {
    schema: HardkasSchemas.LocalnetStatusV1,
    profile,
    status: status.rpcReady ? "TOCCATA_NODE_READY" : "TOCCATA_NODE_STARTING",
    node: status,
    identity
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

  // The only localnet HardKAS manages is the Docker toccata-v2 node. "simulated" (the alpha default) has nothing to
  // stop, and answering it with a success is how a running node used to be reported as stopped.
  if (profile !== TOCCATA_PROFILE) {
    const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "LOCALNET_PROFILE_UNSUPPORTED",
      `'${profile}' is not a localnet that can be stopped: the only localnet is the Docker ${TOCCATA_PROFILE} node ('hardkas localnet stop').`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }

  // STOP-TRUTH-1: a stop is reported only once the node is verified not running. Whatever Docker cannot confirm is an
  // error, never a success; a node that was already down is an idempotent success of its own.
  const before = await toccataContainerState(TOCCATA_NODE_CONTAINER);
  if (before.up) await stopToccataContainerVerified(TOCCATA_NODE_CONTAINER);
  // The miner shares the node's network namespace and normally dies with it; one still up is stopped and checked too.
  const miner = await toccataContainerState(TOCCATA_MINER_CONTAINER);
  if (miner.up) await stopToccataContainerVerified(TOCCATA_MINER_CONTAINER);
  const node = await toccataContainerState(TOCCATA_NODE_CONTAINER);
  const status = before.up ? "TOCCATA_NODE_STOPPED" : "TOCCATA_NODE_ALREADY_STOPPED";

  if (opts.json) {
    getOutput().writeJson({ schema: HardkasSchemas.LocalnetStatusV1, profile, status, node: { container: TOCCATA_NODE_CONTAINER, state: node.state } });
  } else if (before.up) {
    UI.success("Localnet stopped");
  } else {
    UI.info(`Localnet already stopped: ${TOCCATA_NODE_CONTAINER} is ${node.state}`);
  }
}

/** A canonical container's state as Docker reports it; "absent" when it does not exist. Docker unreachable throws. */
async function toccataContainerState(name: string): Promise<{ state: string; up: boolean }> {
  try {
    const { stdout } = await execa("docker", ["inspect", "--format", "{{.State.Status}}", name]);
    const state = stdout.trim();
    return { state, up: state === "running" || state === "paused" || state === "restarting" };
  } catch (e: any) {
    const detail = `${e?.stderr ?? ""} ${e?.message ?? ""}`;
    if (/No such (object|container)/i.test(detail)) return { state: "absent", up: false };
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "LOCALNET_DOCKER_UNAVAILABLE",
      `Docker could not report the state of ${name}, so nothing about the localnet can be confirmed: ${firstLine(detail)}`
    );
  }
}

/** `docker stop`, then the postcondition: the container must no longer be up. */
async function stopToccataContainerVerified(name: string): Promise<void> {
  try {
    await execa("docker", ["stop", name]);
  } catch (e: any) {
    const detail = `${e?.stderr ?? ""} ${e?.message ?? ""}`;
    // gone in the meantime satisfies the postcondition; any other failure is the stop failing
    if (!/No such (object|container)/i.test(detail)) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("LOCALNET_STOP_FAILED", `docker stop ${name} failed: ${firstLine(detail)}`);
    }
  }
  const after = await toccataContainerState(name);
  if (after.up) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("LOCALNET_STOP_FAILED", `${name} is still ${after.state} after docker stop`);
  }
}

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/).find((l) => l.trim()) ?? "unknown error";
}

export async function runLocalnetStatus(opts: LocalnetStatusOptions): Promise<void> {
  const node = await detectToccataNode(!!opts.json);
  const miner = await inspectDockerContainer(TOCCATA_MINER_CONTAINER);
  const identity = await verifyNodeIdentity();

  const payload = {
    schema: HardkasSchemas.LocalnetStatusV1,
    profile: TOCCATA_PROFILE,
    node,
    identity,
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
  UI.info(`Identity: ${identity.verified ? "VERIFIED" : "UNVERIFIED"} (${TOCCATA_NODE_CONTAINER}, ${identity.expected.imageDigest.slice(0, 19)}…)`);
  for (const problem of identity.problems) UI.info(`  - ${problem}`);
  if (node.serverVersion) UI.info(`Version: ${node.serverVersion}`);
  if (node.virtualDaaScore) UI.info(`DAA: ${node.virtualDaaScore}`);
}

export async function runLocalnetFund(opts: LocalnetFundOptions): Promise<void> {
  const profile = opts.profile || TOCCATA_PROFILE;
  if (profile !== TOCCATA_PROFILE) {
    throw new Error(`Unsupported localnet funding profile: ${profile}`);
  }
  if (opts.keepMiner && opts.stopMiner) {
    const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "LOCALNET_FUND_MINER_FLAGS_CONFLICT",
      "--keep-miner and --stop-miner are mutually exclusive: keep mining to the funded account, or leave the chain stopped.",
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }

  const { config } = await loadHardkasConfig({});
  let address: string;

  // ENFORCE EXECUTION GUARD FOR FUNDING
  const { assertExecutionCompatibility } = await import("@hardkas/core");
  const target = {
    mode: "localnet",
    domain: "kaspa-l1",
    network: "simnet"
  } as const;

  const { resolveHardkasAccount } = await import("@hardkas/accounts");
  let account;
  try {
    account = resolveHardkasAccount({ nameOrAddress: opts.identifier, config, executionTarget: target });
    address = account.address || opts.identifier;
  } catch {
    address = opts.identifier;
  }

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

  // The miner joins the node's namespace by container name, so the node must
  // first prove it is the canonical one.
  await requireNodeIdentity();
  const before = await getAddressFundingState(address, !!opts.json);
  await restartToccataMiner(address);

  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.create({
    cwd: opts.workspaceRoot || process.cwd(),
    network: "simnet"
  });

  const timeoutMs = opts.timeoutMs ?? 300000;
  const targetAmount = opts.amountSompi
    ? before.matureBalanceSompi + opts.amountSompi
    : before.matureBalanceSompi + 1n; // wait for any increase

  // RESOURCE-LIFECYCLE-1 (RL-I1/RL-I3): the SDK opened above is released once the wait and the settling are done,
  // whatever they end with.
  try {
    try {
      await sdk.utxos.waitForSpendableFunding({
        address,
        minSpendableSompi: targetAmount,
        timeoutMs
      });
    } catch (e: any) {
      if (e.code !== "LOCALNET_FUND_MATURITY_TIMEOUT") {
        if (!opts.keepMiner) {
          await stopToccataMiner();
          await waitForFundingSpendability(sdk.rpc, { address, minSpendableSompi: targetAmount });
        }
        throw e;
      }
    } finally {
      if (!opts.keepMiner) {
        await stopToccataMiner();
        await waitForFundingSpendability(sdk.rpc, { address, minSpendableSompi: targetAmount });
      }
    }
  } finally {
    await sdk.close();
  }

  const current = await getAddressFundingState(address, !!opts.json);

  const status =
    current.matureBalanceSompi > before.matureBalanceSompi
      ? "TOCCATA_ACCOUNT_FUNDED"
      : "TOCCATA_FUNDING_PENDING_MATURITY";

  // FUND-LIVENESS-1 (AUD-16): after fund the localnet keeps producing blocks unless --stop-miner. The result above
  // was measured on the stopped, settled chain; only now does a miner start again, and it never rewards the funded
  // account: its coinbase goes to an address nobody controls.
  let minerRewardAddress: string | undefined = opts.keepMiner ? address : undefined;
  if (!opts.keepMiner && !opts.stopMiner) {
    minerRewardAddress = await livenessMinerRewardAddress();
    await restartToccataMiner(minerRewardAddress);
  }

  const payload = {
    schema: HardkasSchemas.LocalnetFundingV1,
    profile,
    status,
    address,
    before,
    after: current,
    miner: await inspectDockerContainer(TOCCATA_MINER_CONTAINER),
    ...(minerRewardAddress ? { minerRewardAddress } : {})
  };

  if (opts.json) {
    getOutput().writeJson(payload);
    return;
  }

  if (status === "TOCCATA_ACCOUNT_FUNDED") {
    UI.success(status);
  } else {
    UI.warning(status);
  }
  UI.info(`Address: ${address}`);
  UI.info(`Mature balance: ${current.matureBalanceSompi.toString()} sompi`);
  UI.info(
    opts.stopMiner
      ? "Miner: stopped (--stop-miner): no new blocks until you mine again"
      : opts.keepMiner
        ? "Miner: still mining to this account (--keep-miner)"
        : "Miner: running for block production; its rewards go to an unspendable address"
  );
}

/**
 * Reward address of the liveness miner `localnet fund` leaves running (FUND-LIVENESS-1): P2SH of the one-byte script
 * OP_RETURN. Spending it means revealing that script, whose execution always fails, so its coinbase is spendable by
 * nobody: no account, key or secret exists. Built from the pinned SDK, never hard-coded.
 */
async function livenessMinerRewardAddress(): Promise<string> {
  const { loadKaspaWasm } = await import("@hardkas/accounts");
  const k = await loadKaspaWasm();
  const redeemScript = new k.ScriptBuilder().addOp(k.Opcodes.OpReturn).toString();
  return k.addressFromScriptPublicKey(k.payToScriptHashScript(redeemScript), "simnet").toString();
}

interface VirtualFingerprint {
  virtualDaaScore: bigint;
  virtualParentHashes: string[];
  sink: string;
  hash: string;
}

async function getVirtualFingerprint(rpc: any): Promise<VirtualFingerprint> {
  const dagInfo = await rpc.getBlockDagInfo();
  const virtualDaaScore = BigInt(dagInfo.virtualDaaScore || 0);
  const virtualParentHashes = [...(dagInfo.virtualParentHashes || [])].sort();
  const sink = dagInfo.sink || dagInfo.sinkHash || "";

  const canonical = JSON.stringify({
    virtualDaaScore: virtualDaaScore.toString(),
    virtualParentHashes,
    sink
  });
  const hash = sha256hex(canonical);

  return { virtualDaaScore, virtualParentHashes, sink, hash };
}

function computeUtxoSetHash(utxos: any[]): string {
  const keys = utxos
    .map(u => [
      u.outpoint.transactionId,
      u.outpoint.index,
      u.amountSompi.toString(),
      u.blockDaaScore?.toString() ?? "",
      u.isCoinbase ? "1" : "0"
    ].join(":"))
    .sort();

  return sha256hex(keys.join("|"));
}

async function waitForVirtualDagSettle(
  rpc: any,
  opts?: { stablePolls?: number; pollIntervalMs?: number }
): Promise<VirtualFingerprint> {
  const REQUIRED = opts?.stablePolls ?? 3;
  const INTERVAL = opts?.pollIntervalMs ?? 300;

  let lastHash = "";
  let stableCount = 0;
  let lastFingerprint: VirtualFingerprint | null = null;

  while (stableCount < REQUIRED) {
    const fp = await getVirtualFingerprint(rpc);
    if (fp.hash === lastHash && fp.virtualDaaScore > 0n) {
      stableCount++;
    } else {
      lastHash = fp.hash;
      stableCount = 0;
    }
    lastFingerprint = fp;
    await new Promise(r => setTimeout(r, INTERVAL));
  }

  return lastFingerprint!;
}

async function waitForFundingSpendability(
  rpc: any,
  opts: {
    address: string;
    minSpendableSompi?: bigint;
    stablePolls?: number;
    pollIntervalMs?: number;
  }
): Promise<{ virtualFingerprint: VirtualFingerprint; spendableCount: number; spendableSompi: bigint }> {
  const REQUIRED = opts.stablePolls ?? 3;
  const INTERVAL = opts.pollIntervalMs ?? 500;

  let utxoStableCount = 0;
  let lastUtxoHash = "";
  let lastUtxos: any[] = [];

  // Phase 1: Virtual DAG convergence (initial)
  let vfp = await waitForVirtualDagSettle(rpc);

  // Phase 2: UTXO set convergence for this address
  while (utxoStableCount < REQUIRED) {
    lastUtxos = await rpc.getUtxosByAddress(opts.address);
    const hash = computeUtxoSetHash(lastUtxos);

    if (hash === lastUtxoHash && lastUtxos.length > 0) {
      utxoStableCount++;
    } else {
      lastUtxoHash = hash;
      utxoStableCount = 0;
    }

    // Check if virtual state shifted during UTXO convergence
    const currentVfp = await waitForVirtualDagSettle(rpc);
    if (currentVfp.hash !== vfp.hash) {
      // Restart convergence cycle
      vfp = currentVfp;
      lastUtxoHash = "";
      utxoStableCount = 0;
    }

    if (utxoStableCount < REQUIRED) {
      await new Promise(r => setTimeout(r, INTERVAL));
    }
  }

  // Phase 3: Maturity check on converged set using the stable virtualDaaScore
  const { getCoinbaseMaturity } = await import("@hardkas/core");
  const maturityThreshold = getCoinbaseMaturity("simnet");

  const spendable = lastUtxos.filter(u => {
    if (!u.isCoinbase) return true;
    if (u.blockDaaScore === undefined) return false;
    return vfp.virtualDaaScore - BigInt(u.blockDaaScore) >= maturityThreshold;
  });

  const spendableSompi = spendable.reduce((sum, u) => sum + BigInt(u.amountSompi), 0n);

  if (opts.minSpendableSompi && spendableSompi < opts.minSpendableSompi) {
    throw new UtxoSetNotStableError({
      address: opts.address,
      utxoCount: lastUtxos.length,
      spendableCount: spendable.length,
      spendableSompi: spendableSompi.toString(),
      required: opts.minSpendableSompi.toString(),
      virtualDaaScore: vfp.virtualDaaScore.toString()
    });
  }

  return {
    virtualFingerprint: vfp,
    spendableCount: spendable.length,
    spendableSompi
  };
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

/**
 * True only when the Toccata node container HardKAS manages is actually running.
 *
 * A live RPC on the Toccata port is not proof of ownership: any kaspad bound to it
 * answers identically. Ownership must be asserted against Docker, otherwise
 * `localnet start` reports READY for a node it did not start and cannot fund,
 * since `localnet fund` attaches the miner by container name.
 */
async function isManagedNodeRunning(): Promise<boolean> {
  try {
    const { stdout } = await execa("docker", [
      "inspect",
      "-f",
      "{{.State.Running}}",
      TOCCATA_NODE_CONTAINER
    ]);
    return stdout.trim() === "true";
  } catch {
    return false;
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



/**
 * `docker run` arguments of the companion miner.
 *
 * Demo-ready: the miner is rate-limited with the upstream cpuminer's own `--throttle` ("for
 * development testing"), exactly as the repo's real-node harnesses already run it
 * (scripts/toccata-gauntlet.mjs, test-gauntlet/real-node/silver-e2e.mjs). Unthrottled, one
 * CPU thread on simnet outruns the node: consecutive reads of the mining address return
 * different coinbase outpoints, and a plan built on one of them can be refused as an orphan
 * seconds later (seen with `localnet fund --keep-miner`). HARNESS-LOCAL knob
 * (`HARDKAS_TOCCATA_MINER_THROTTLE_MS`, default 5 ms, "0" disables): not a Kaspa or Toccata
 * parameter, not evidence of anything about consensus, and not part of any capability claim.
 */
export function toccataMinerArgs(address: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const requested = env.HARDKAS_TOCCATA_MINER_THROTTLE_MS;
  const throttle = requested !== undefined && /^\d+$/.test(requested) ? requested : "5";
  return [
    "run",
    "-d",
    "--name",
    TOCCATA_MINER_CONTAINER,
    "--network",
    `container:${TOCCATA_NODE_CONTAINER}`,
    OFFICIAL_MINER_IMAGE,
    "-a",
    address,
    "-s",
    "127.0.0.1",
    "-p",
    String(CANONICAL_LOCALNET.ports.rpc),
    "--mine-when-not-synced",
    "-t",
    "1",
    ...(throttle !== "0" ? ["--throttle", throttle] : [])
  ];
}

async function restartToccataMiner(address: string) {
  await execa("docker", ["rm", "-f", TOCCATA_MINER_CONTAINER]).catch(() => {});
  await execa("docker", toccataMinerArgs(address));
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
  const { getCoinbaseMaturity } = await import("@hardkas/core");
  const maturityThreshold = getCoinbaseMaturity("simnet");

  try {
    const { info, utxos } = await withOptionalSilentConsole(quiet, async () => ({
      info: await client.getInfo(),
      utxos: await client.getUtxosByAddress(address)
    }));
    const virtualDaaScore = info.virtualDaaScore ?? 0n;
    const matureUtxos = utxos.filter((utxo) => {
      if (!utxo.isCoinbase) return true;
      if (utxo.blockDaaScore === undefined) return false;
      return virtualDaaScore - BigInt(utxo.blockDaaScore) >= maturityThreshold;
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
