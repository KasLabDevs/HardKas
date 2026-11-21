import path from "node:path";
import fs from "node:fs";
import { execa } from "execa";
import { CANONICAL_LOCALNET } from "@hardkas/core";
import { DockerKaspadRunner, DOCKER_PROBE_TIMEOUT_MS } from "@hardkas/node-runner";
import { getOutput } from "../output.js";
import { UI } from "../ui.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

/**
 * BETA-FIX · `hardkas localnet reset`: the public way to start the localnet over from an empty chain (it was only the
 * hidden `node reset`). It acts on the canonical localnet (the Docker toccata-v2 node and its miner) and on THIS
 * workspace's chain data, `<workspace>/.hardkas/kaspad` — the folder `localnet start` mounts into the node:
 *
 *   1. the node's data mount is read from Docker: a RUNNING node that keeps its chain somewhere else (another workspace
 *      started it) is refused before anything is stopped or removed (LOCALNET_RESET_OTHER_WORKSPACE), and so is a running
 *      node whose data folder Docker does not name (LOCALNET_RESET_DATA_UNVERIFIED);
 *   2. the node and its miner are stopped, each verified down (as `localnet stop`);
 *   3. this workspace's `.hardkas/kaspad` is removed (on a rootful Linux engine, files the container's root wrote are
 *      removed through the node's own pinned image, as `node reset` does).
 *
 * Nothing else is touched: the dev accounts and their keys, the workspace's artifacts, receipts and records stay (those
 * that name the old chain's transactions then describe a chain that no longer exists). `hardkas localnet start` makes a
 * fresh chain afterwards.
 */

export const LOCALNET_RESET_SCHEMA = "hardkas.localnetReset.v1";

const NODE = CANONICAL_LOCALNET.containerName;
const MINER = CANONICAL_LOCALNET.minerContainerName;

/**
 * A host path and a Docker bind-mount source, compared as the same folder: separators and a trailing slash ignored, and
 * on Windows the drive letter's case and Docker Desktop's VM spellings (/run/desktop/mnt/host/c/…, /host_mnt/c/…,
 * /mnt/c/…) read as `c:/…`.
 */
export function sameLocalnetDataPath(hostPath: string, mountSource: string, platform: NodeJS.Platform = process.platform): boolean {
  const norm = (p: string) => {
    let s = String(p).trim().replace(/\\/g, "/").replace(/\/+$/, "");
    if (platform === "win32") {
      const vm = /^\/(?:run\/desktop\/mnt\/host|host_mnt|mnt)\/([a-zA-Z])(\/.*)?$/.exec(s);
      if (vm) s = `${vm[1]}:${vm[2] ?? "/"}`;
      return s.toLowerCase();
    }
    return s;
  };
  return norm(hostPath) === norm(mountSource);
}

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/).find((l) => l.trim()) ?? "unknown error";
}

const dockerUnavailable = (name: string, detail: string) =>
  new HardkasCliError(
    "LOCALNET_DOCKER_UNAVAILABLE",
    `Docker could not report the state of ${name}, so nothing about the localnet can be confirmed: ${firstLine(detail)}. Nothing was stopped or removed.`
  );

/** A canonical container's state; "absent" when it does not exist. Docker unreachable throws. */
async function containerState(name: string): Promise<{ state: string; up: boolean }> {
  try {
    const { stdout } = await execa("docker", ["inspect", "--format", "{{.State.Status}}", name], { timeout: DOCKER_PROBE_TIMEOUT_MS });
    const state = String(stdout).trim();
    return { state, up: state === "running" || state === "paused" || state === "restarting" };
  } catch (e: any) {
    const detail = `${e?.stderr ?? ""} ${e?.message ?? ""}`;
    if (/No such (object|container)/i.test(detail)) return { state: "absent", up: false };
    throw dockerUnavailable(name, detail);
  }
}

/** Where the node keeps its chain: the host source of its /app/data mount (undefined when Docker names none). */
async function nodeDataMount(name: string): Promise<string | undefined> {
  let stdout: string;
  try {
    stdout = String((await execa("docker", ["container", "inspect", "--format", "{{json .Mounts}}", name], { timeout: DOCKER_PROBE_TIMEOUT_MS })).stdout);
  } catch (e: any) {
    const detail = `${e?.stderr ?? ""} ${e?.message ?? ""}`;
    if (/No such (object|container)/i.test(detail)) return undefined;
    throw dockerUnavailable(name, detail);
  }
  let mounts: unknown;
  try {
    mounts = JSON.parse(stdout.trim() || "[]");
  } catch {
    return undefined;
  }
  const m = (Array.isArray(mounts) ? mounts : []).find((x: any) => x?.Destination === "/app/data");
  return typeof (m as any)?.Source === "string" && (m as any).Source ? String((m as any).Source) : undefined;
}

/** `docker stop`, then the postcondition: the container is no longer up. */
async function stopVerified(name: string): Promise<void> {
  try {
    await execa("docker", ["stop", name]);
  } catch (e: any) {
    const detail = `${e?.stderr ?? ""} ${e?.message ?? ""}`;
    if (!/No such (object|container)/i.test(detail)) {
      throw new HardkasCliError("LOCALNET_STOP_FAILED", `docker stop ${name} failed: ${firstLine(detail)}. The chain data was not removed.`);
    }
  }
  const after = await containerState(name);
  if (after.up) throw new HardkasCliError("LOCALNET_STOP_FAILED", `${name} is still ${after.state} after docker stop. The chain data was not removed.`);
}

export interface LocalnetResetResult {
  readonly schema: typeof LOCALNET_RESET_SCHEMA;
  readonly ok: true;
  readonly status: "LOCALNET_RESET";
  readonly profile: string;
  readonly workspace: string;
  readonly dataDir: string;
  readonly dataRemoved: boolean;
  readonly node: { readonly container: string; readonly wasRunning: boolean; readonly state: string };
  readonly miner: { readonly container: string; readonly wasRunning: boolean; readonly state: string };
  readonly nextSteps: readonly string[];
}

/** The reset itself (the command has already taken the workspace lock and the user's confirmation). */
export async function runLocalnetReset(opts: { workspaceRoot: string; json?: boolean }): Promise<LocalnetResetResult> {
  const root = path.resolve(opts.workspaceRoot);
  const dataDir = path.join(root, ".hardkas", "kaspad");

  // 1 · whose chain is the running node's: decided before anything is stopped or removed
  const nodeBefore = await containerState(NODE);
  const minerBefore = await containerState(MINER);
  if (nodeBefore.up) {
    const source = await nodeDataMount(NODE);
    if (source === undefined) {
      throw new HardkasCliError(
        "LOCALNET_RESET_DATA_UNVERIFIED",
        `The localnet node (${NODE}) is ${nodeBefore.state}, but Docker names no folder for its chain data (/app/data), so HardKAS cannot tell whose chain it is. Stop it first ('hardkas localnet stop'), then reset. Nothing was stopped or removed.`,
        { exitCode: HardkasExitCode.USAGE_ERROR }
      );
    }
    if (!sameLocalnetDataPath(dataDir, source)) {
      throw new HardkasCliError(
        "LOCALNET_RESET_OTHER_WORKSPACE",
        `The running localnet node (${NODE}) keeps its chain data at ${source}, not in this workspace (${dataDir}): another workspace started it. Run 'hardkas localnet reset' in that workspace, or stop the localnet first ('hardkas localnet stop') to reset only this workspace's data. Nothing was stopped or removed.`,
        { exitCode: HardkasExitCode.USAGE_ERROR, context: { mountSource: source, dataDir } }
      );
    }
  }

  // 2 · node and miner stopped, each verified down (the miner shares the node's network and normally dies with it)
  if (nodeBefore.up) await stopVerified(NODE);
  if ((await containerState(MINER)).up) await stopVerified(MINER);

  // 3 · this workspace's chain data removed
  const existed = fs.existsSync(dataDir);
  if (existed) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code !== "EACCES" && code !== "EPERM") throw e;
      // a rootful Linux engine wrote the files as root: removed through the node's own pinned image (NODE-RESET-LINUX-1)
      await new DockerKaspadRunner({ cwd: root, image: CANONICAL_LOCALNET.image, containerName: NODE, network: "simnet" }).reset({ removeData: true });
    }
  }
  const nodeAfter = await containerState(NODE);
  const minerAfter = await containerState(MINER);
  const nextSteps = ["hardkas localnet start --toccata   # a fresh chain; the dev accounts and their keys are kept"];
  const result: LocalnetResetResult = {
    schema: LOCALNET_RESET_SCHEMA,
    ok: true,
    status: "LOCALNET_RESET",
    profile: CANONICAL_LOCALNET.profile,
    workspace: root,
    dataDir,
    dataRemoved: existed,
    node: { container: NODE, wasRunning: nodeBefore.up, state: nodeAfter.state },
    miner: { container: MINER, wasRunning: minerBefore.up, state: minerAfter.state },
    nextSteps
  };
  if (opts.json) {
    getOutput().writeJson(result);
  } else {
    UI.success(
      `Localnet reset: ${nodeBefore.up ? "node stopped, " : ""}${existed ? `chain data removed (${dataDir})` : `no chain data to remove at ${dataDir}`}`
    );
    UI.info("Kept: the dev accounts and their keys, and this workspace's artifacts and records (those of the old chain now describe a chain that is gone).");
    UI.printNextSteps(nextSteps);
  }
  return result;
}
