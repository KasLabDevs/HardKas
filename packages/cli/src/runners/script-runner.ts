// SAFETY_LEVEL: SIMULATION_ONLY

import { resolve, dirname } from "node:path";
import { existsSync, unlinkSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { loadHardkasConfig, resolveNodeEndpoint } from "@hardkas/config";

export interface RunScriptOptions {
  /** A network of the workspace config; undefined: the workspace's network (HARDKAS-NETWORK-PORTABILITY-1). */
  network?: string | undefined;
  accounts: string;
  balance: string;
  harness: boolean;
  workspaceRoot?: string;
}

/**
 * Validates user-controlled accounts and balance parameters before code generation.
 */
export function validateRunScriptOptions(opts: RunScriptOptions): { accounts: number; balance: bigint } {
  const accountsNum = Number(opts.accounts);
  if (!Number.isInteger(accountsNum) || accountsNum <= 0) {
    const err = new Error(`INVALID_ACCOUNTS: accounts must be a positive integer, got '${opts.accounts}'`);
    (err as any).code = "INVALID_ACCOUNTS";
    throw err;
  }
  const balanceStr = String(opts.balance).trim();
  if (!/^\d+$/.test(balanceStr)) {
    const err = new Error(`INVALID_BALANCE: balance must be a non-negative integer string, got '${opts.balance}'`);
    (err as any).code = "INVALID_BALANCE";
    throw err;
  }
  return { accounts: accountsNum, balance: BigInt(balanceStr) };
}

/**
 * HARDKAS-NETWORK-PORTABILITY-1: the network a script runs on — the one asked for, else the workspace's network (its
 * execution default, else the legacy `defaultNetwork` mirror), else simnet when there is no config. A name the
 * workspace config does not know is refused (RUN_NETWORK_UNKNOWN): it used to fall back to the simulator silently.
 */
export function resolveRunNetwork(config: any, requested: string | undefined): string {
  let name = requested;
  if (name === undefined) {
    const exec: any = config?.execution;
    const target = exec?.default ? exec.targets?.[exec.default] : undefined;
    name = typeof target?.network === "string" ? target.network : typeof config?.defaultNetwork === "string" ? config.defaultNetwork : "simnet";
  }
  if (!config?.networks?.[name as string]) {
    const known = Object.keys(config?.networks ?? {}).join(", ") || "none";
    const err = new Error(`RUN_NETWORK_UNKNOWN: network '${name}' is not in the workspace config (known: ${known}). Nothing ran.`);
    (err as any).code = "RUN_NETWORK_UNKNOWN";
    throw err;
  }
  return name as string;
}

/**
 * Resolves the tsx entrypoint from @hardkas/cli dependencies without relying on a global installation.
 */
export function resolveTsxCli(): string {
  try {
    const req = createRequire(import.meta.url);
    const tsxPkg = req.resolve("tsx/package.json");
    const tsxDir = dirname(tsxPkg);
    const distCli = resolve(tsxDir, "dist", "cli.mjs");
    if (existsSync(distCli)) {
      return distCli;
    }
    const pkg = JSON.parse(readFileSync(tsxPkg, "utf8"));
    const binRel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.tsx || "./dist/cli.mjs";
    const resolvedBin = resolve(tsxDir, binRel);
    if (existsSync(resolvedBin)) {
      return resolvedBin;
    }
  } catch (err: any) {
    const error = new Error(`TSX_NOT_FOUND: could not resolve 'tsx' from @hardkas/cli dependencies: ${err?.message || err}`);
    (error as any).code = "TSX_NOT_FOUND";
    throw error;
  }
  const error = new Error("TSX_NOT_FOUND: 'tsx' CLI binary file does not exist in installed package");
  (error as any).code = "TSX_NOT_FOUND";
  throw error;
}

/**
 * The global `hardkas` the wrapper injects: the simulator harness on a simulated network, else an RPC client to the
 * network's endpoint that must prove it serves that network before anything is read (NODE-NETWORK-IDENTITY-1).
 */
export function buildRunInjection(config: any, opts: RunScriptOptions & { network: string }): string {
  if (!opts.harness) return "";
  const netConfig = config?.networks?.[opts.network] as Record<string, unknown> | undefined;
  if (netConfig?.kind === "simulated") {
    const validated = validateRunScriptOptions(opts);
    return `
import { createTestHarness } from "@hardkas/testing/harness";
const hardkas = createTestHarness({
  accounts: ${validated.accounts},
  initialBalance: ${validated.balance}n,
  networkId: ${JSON.stringify(opts.network)},
});
Object.assign(globalThis, { hardkas });
`;
  }
  // TESTNET-PORT-COLLISION-1: the shared endpoint authority (a public network with no endpoint the user chose refuses
  // NETWORK_ENDPOINT_REQUIRED before the script runs)
  const rpcUrl = resolveNodeEndpoint({ config, networkId: opts.network }).url;
  const networkId = typeof netConfig?.network === "string" ? netConfig.network : opts.network;
  return `
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
const rpc = new JsonWrpcKaspaClient({ rpcUrl: ${JSON.stringify(rpcUrl)}, expectedNetworkId: ${JSON.stringify(networkId)} });
const hardkas = {
  network: ${JSON.stringify(opts.network)},
  networkId: ${JSON.stringify(networkId)},
  rpcUrl: ${JSON.stringify(rpcUrl)},
  rpc: rpc
};
Object.assign(globalThis, { hardkas });
`;
}

export async function runScript(script: string, opts: RunScriptOptions): Promise<void> {
  const scriptPath = resolve(script);

  if (!existsSync(scriptPath)) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("SCRIPT_NOT_FOUND", `Script not found: ${scriptPath}`, {
      exitCode: 1
    });
  }

  // Validate parameters upfront
  try {
    validateRunScriptOptions(opts);
  } catch (e: any) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(e.code ?? "INVALID_ARGUMENT", e.message, { exitCode: 2 });
  }

  const { config } = await loadHardkasConfig();
  let network: string;
  try {
    network = resolveRunNetwork(config, opts.network);
  } catch (e: any) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(e.code ?? "RUN_NETWORK_UNKNOWN", String(e.message).replace(/^RUN_NETWORK_UNKNOWN: /, ""), { exitCode: 2 });
  }
  opts = { ...opts, network };

  let tsxCli: string;
  try {
    tsxCli = resolveTsxCli();
  } catch (e: any) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("MISSING_DEPENDENCY", e.message, { exitCode: 1 });
  }

  // Build a wrapper that creates the harness or RPC client and injects it as global
  const injectionCode = buildRunInjection(config, { ...opts, network });
  const scriptFileUrl = pathToFileURL(scriptPath).href;
  const wrapperCode = `
${injectionCode}
(async () => {
  try {
    await import(${JSON.stringify(scriptFileUrl)});
  } catch (err) {
    console.error(err);
    throw err;
  }
})();
`;

  // Write to a temp file inside .hardkas to allow workspace resolution
  const workspaceRoot = opts.workspaceRoot || process.cwd();
  const dotHardkas = resolve(workspaceRoot, ".hardkas");
  if (!existsSync(dotHardkas)) {
    mkdirSync(dotHardkas, { recursive: true });
  }

  const tempWrapper = resolve(dotHardkas, `run-${Date.now()}-${Math.random().toString(36).slice(2)}.mts`);

  const { writeFileAtomicSync } = await import("@hardkas/core");
  writeFileAtomicSync(tempWrapper, wrapperCode);

  try {
    // Execute safely without a shell using process.execPath and the resolved tsx cli
    const result = spawnSync(process.execPath, [tsxCli, tempWrapper], {
      stdio: "inherit",
      cwd: workspaceRoot,
      shell: false,
      env: {
        ...process.env,
        HARDKAS_NETWORK: opts.network,
        HARDKAS_ACCOUNTS: opts.accounts,
        HARDKAS_BALANCE: opts.balance
      }
    });

    if (result.error) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("SCRIPT_EXECUTION_FAILED", `Failed to execute script: ${result.error.message}`, {
        exitCode: 1,
        cause: result.error
      });
    }

    if (result.status !== 0) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("SCRIPT_EXECUTION_FAILED", `Script exited with non-zero code ${result.status ?? "unknown"}`, {
        exitCode: result.status ?? 1
      });
    }
  } finally {
    if (existsSync(tempWrapper)) {
      unlinkSync(tempWrapper);
    }
  }
}
