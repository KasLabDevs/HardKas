import path from "node:path";
import type { ManagedProcessSpec } from "@hardkas/node-orchestrator";
import { HardkasCliError, HardkasExitCode, type ManagedToolchainReference } from "@hardkas/cli/extension-kit";

/**
 * L2-EXT stage 4 · the local Anvil node: what is specific to Anvil (the verified Foundry binary, its arguments, its
 * readiness) lives here; starting, watching and stopping it is the core's identity-checked process manager
 * (@hardkas/node-orchestrator). Anvil binds 127.0.0.1 only, on the local chain id 31337. Nothing is installed or
 * downloaded here: without a verified Foundry the commands refuse with the exact install command.
 */

export const ANVIL_PROCESS_ID = "l2-anvil";
export const ANVIL_CHAIN_ID = 31337;
export const DEFAULT_ANVIL_PORT = 8545;

export function anvilStateDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".hardkas", "processes", ANVIL_PROCESS_ID);
}

export function parsePort(value: string | number | undefined): number {
  const n = typeof value === "number" ? value : value === undefined ? DEFAULT_ANVIL_PORT : Number(value);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) {
    throw new HardkasCliError("L2_NODE_PORT_INVALID", `--port must be an integer from 1024 to 65535 (got ${value})`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  return n;
}

export function parseAccounts(value: string | number | undefined): number {
  const n = typeof value === "number" ? value : value === undefined ? 10 : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new HardkasCliError("L2_NODE_ACCOUNTS_INVALID", `--accounts must be an integer from 1 to 100 (got ${value})`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  return n;
}

/** eth_chainId of a loopback JSON-RPC endpoint, or undefined if nothing answers it as JSON-RPC. */
export async function loopbackChainId(port: number, signal?: AbortSignal): Promise<number | undefined> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: signal ?? AbortSignal.timeout(2000)
    });
    const body = (await res.json()) as { result?: string };
    return typeof body.result === "string" ? Number.parseInt(body.result, 16) : undefined;
  } catch {
    return undefined;
  }
}

/** The verified Foundry install for this platform, or the typed reason there is none (never installs it). */
export async function verifiedFoundry(): Promise<{ binaryPath: string; ref: ManagedToolchainReference }> {
  const { verifiedToolchain } = await import("../toolchains/verified.js");
  const t = await verifiedToolchain("foundry", "nothing was started");
  return { binaryPath: t.bin(t.ref.entry), ref: t.ref };
}

/** Anvil's arguments: loopback only, the local chain id. */
export function anvilArgs(port: number, accounts: number): string[] {
  return ["--host", "127.0.0.1", "--port", String(port), "--chain-id", String(ANVIL_CHAIN_ID), "--accounts", String(accounts)];
}

/**
 * F-03 · whether a real argument vector (argv[1..], as the OS reports it) has exactly the form anvilArgs() gives:
 * 127.0.0.1 only, chain 31337, a port and an account count. Anything else was not started by HardKAS.
 */
export function isHardkasAnvilArgs(args: readonly string[]): boolean {
  return (
    args.length === 8 &&
    args[0] === "--host" &&
    args[1] === "127.0.0.1" &&
    args[2] === "--port" &&
    /^\d+$/.test(args[3] ?? "") &&
    args[4] === "--chain-id" &&
    args[5] === String(ANVIL_CHAIN_ID) &&
    args[6] === "--accounts" &&
    /^\d+$/.test(args[7] ?? "")
  );
}

/** The managed-process spec of the local Anvil node of a workspace. */
export async function anvilSpec(workspaceRoot: string, opts: { port: number; accounts: number; readinessTimeoutMs?: number }): Promise<ManagedProcessSpec> {
  const { binaryPath, ref } = await verifiedFoundry();
  const { verifyManagedToolchainSync } = await import("@hardkas/core");
  return {
    id: ANVIL_PROCESS_ID,
    binaryPath,
    args: anvilArgs(opts.port, opts.accounts),
    stateDir: anvilStateDir(workspaceRoot),
    // the whole pinned package is re-verified right before the spawn, and again once it runs
    verifyBinary: () => {
      const v = verifyManagedToolchainSync(ref);
      return { ok: v.ok, sha256: ref.files[ref.entry]!.sha256, problems: v.problems };
    },
    port: opts.port,
    readiness: async (signal) => (await loopbackChainId(opts.port, signal)) === ANVIL_CHAIN_ID,
    readinessTimeoutMs: opts.readinessTimeoutMs ?? 30_000
  };
}
