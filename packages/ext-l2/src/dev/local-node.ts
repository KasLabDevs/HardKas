import path from "node:path";
import { HardkasCliError, HardkasExitCode } from "@hardkas/cli/extension-kit";
import type { ManagedProcessStatus, TcpListenerReader } from "@hardkas/node-orchestrator";
import { ANVIL_CHAIN_ID, anvilStateDir, isHardkasAnvilArgs, verifiedFoundry } from "../node/anvil.js";
import { LocalRpc } from "./rpc.js";

/**
 * L2-EXT stage 6 · the one endpoint `hardkas l2 dev` ever talks to: the local Anvil node THIS workspace's HardKAS started.
 *
 * There is no --url, --network or --chain-id: the endpoint is derived from the node record, and only after
 *   1. the pinned Foundry is installed and verified (every file, by SHA-256);
 *   2. the record's process is running and is the instance HardKAS started (PID + OS start time + executable);
 *   3. that executable is the verified anvil, with the pinned digest, bound to 127.0.0.1;
 *   4. the node answers eth_chainId = 31337 (checked again right before every write).
 * Igra, Galleon, Kasplex or any other network can therefore never be the target: a different chain id, a node HardKAS
 * did not start, or a process that is not the verified anvil are all refusals before any request that writes.
 */

export interface LocalNode {
  readonly url: string;
  readonly port: number;
  readonly pid: number;
  readonly startedAt: string;
  readonly chainId: typeof ANVIL_CHAIN_ID;
  readonly rpc: LocalRpc;
  /** Every check again, from the OS (and the chain id), right before a write (F-03/F-09). */
  revalidate(): Promise<void>;
}

export interface LocalNodeDeps {
  readonly status?: (stateDir: string) => Promise<ManagedProcessStatus>;
  readonly foundry?: () => Promise<{ binaryPath: string; sha256: string }>;
  readonly listeners?: TcpListenerReader;
}

/** The value after `flag` in an argument vector (the last occurrence wins, as for anvil's parser). */
const argAfter = (argv: readonly string[], flag: string) => {
  const i = argv.lastIndexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

const refuse = (code: string, message: string, exitCode: number = HardkasExitCode.USAGE_ERROR) => new HardkasCliError(code, message, { exitCode });
const sameExe = (a: string, b: string) => (process.platform === "win32" ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));

/** The node proven from the OS (not from the record alone), or the typed refusal. */
async function proveLocalNode(workspaceRoot: string, deps: LocalNodeDeps): Promise<{ port: number; pid: number; startedAt: string }> {
  const foundry = deps.foundry
    ? await deps.foundry()
    : await verifiedFoundry().then((f) => ({ binaryPath: f.binaryPath, sha256: f.ref.files[f.ref.entry]!.sha256 }));
  const orchestrator = await import("@hardkas/node-orchestrator");
  const status = deps.status ?? (async (dir: string) => orchestrator.getManagedProcessStatus({ stateDir: dir }));
  const st = await status(anvilStateDir(workspaceRoot));
  if (st.state === "unverifiable") throw refuse("L2_NODE_UNVERIFIABLE", `${st.detail}; nothing was sent`, HardkasExitCode.RUNTIME_FAILURE);
  if (st.state !== "running" || !st.record) {
    throw refuse("L2_NODE_NOT_RUNNING", `the local node is not running (${st.state}: ${st.detail}); start it with: hardkas l2 node start. Nothing was sent.`);
  }
  const r = st.record;
  const problems: string[] = [];
  if (!sameExe(r.binaryPath, foundry.binaryPath)) problems.push(`its binary ${r.binaryPath} is not the verified anvil ${foundry.binaryPath}`);
  const exe = st.identity?.executable ?? r.identity.executable;
  if (!sameExe(exe, foundry.binaryPath)) problems.push(`the running executable ${exe} is not the verified anvil`);
  if (r.binarySha256 !== foundry.sha256) problems.push(`its binary digest ${r.binarySha256} is not the pinned ${foundry.sha256}`);
  // F-03: host, port and chain come from the process's REAL command line, not from the record
  const argv = st.identity?.argv;
  if (!argv) problems.push("its real command line cannot be read on this system");
  else {
    // R2 (R1-OBS-1): the SAME rule `l2 node stop` applies: exactly the arguments HardKAS starts Anvil with (127.0.0.1,
    // chain 31337, a port, an account count) and nothing else; an extra flag (--fork-url, --no-mining, --gas-limit…)
    // changes the node HardKAS would be vouching for
    const real = argv.slice(1);
    if (!isHardkasAnvilArgs(real)) problems.push(`it runs ${JSON.stringify(real)}, not exactly the arguments HardKAS starts Anvil with`);
    else if (r.port === undefined || argAfter(argv, "--port") !== String(r.port)) problems.push(`it runs with --port ${argAfter(argv, "--port")}, not the recorded ${r.port}`);
  }
  if (problems.length === 0) {
    // F-03: the port is served by THIS process on 127.0.0.1 only (the OS's socket table, not the record)
    const owner = await orchestrator.loopbackOwnershipProblem(r.port!, r.pid, deps.listeners ?? orchestrator.readTcpListeners);
    if (owner) problems.push(owner);
  }
  if (problems.length > 0) {
    throw refuse("L2_NODE_NOT_VERIFIED", `the running node is not the verified local Anvil HardKAS started: ${problems.join("; ")}. Nothing was sent.`, HardkasExitCode.CORRUPTION_DETECTED);
  }
  return { port: r.port!, pid: r.pid, startedAt: r.startedAt };
}

export async function resolveLocalNode(workspaceRoot: string, deps: LocalNodeDeps = {}): Promise<LocalNode> {
  const proven = await proveLocalNode(workspaceRoot, deps);
  const url = `http://127.0.0.1:${proven.port}`;
  const rpc = new LocalRpc(url);
  await assertLocalChain(rpc);
  return {
    url,
    ...proven,
    chainId: ANVIL_CHAIN_ID,
    rpc,
    async revalidate() {
      const again = await proveLocalNode(workspaceRoot, deps);
      if (again.pid !== proven.pid || again.port !== proven.port || again.startedAt !== proven.startedAt) {
        throw refuse("L2_NODE_NOT_VERIFIED", `the local node changed (PID ${proven.pid} → ${again.pid}, port ${proven.port} → ${again.port}) since it was resolved; nothing was sent`, HardkasExitCode.CORRUPTION_DETECTED);
      }
      await assertLocalChain(rpc);
    }
  };
}

/** eth_chainId must be the local chain (31337); called on resolution and again right before every write. */
export async function assertLocalChain(rpc: LocalRpc): Promise<void> {
  const hex = await rpc.request<string>("eth_chainId", []);
  const chainId = typeof hex === "string" ? Number.parseInt(hex, 16) : NaN;
  if (chainId !== ANVIL_CHAIN_ID) {
    throw refuse("L2_WRONG_CHAIN", `${rpc.url} answers chain id ${Number.isNaN(chainId) ? String(hex) : chainId}, not the local ${ANVIL_CHAIN_ID}; nothing was sent`, HardkasExitCode.CORRUPTION_DETECTED);
  }
}
