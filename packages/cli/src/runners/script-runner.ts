// SAFETY_LEVEL: SIMULATION_ONLY

import { resolve, dirname } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { loadHardkasConfig, resolveNodeEndpoint } from "@hardkas/config";
import { tmpdir } from "node:os";

export interface RunScriptOptions {
  /** A network of the workspace config; undefined: the workspace's network (HARDKAS-NETWORK-PORTABILITY-1). */
  network?: string | undefined;
  accounts: string;
  balance: string;
  harness: boolean;
  workspaceRoot?: string;
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
 * The global `hardkas` the wrapper injects: the simulator harness on a simulated network, else an RPC client to the
 * network's endpoint that must prove it serves that network before anything is read (NODE-NETWORK-IDENTITY-1).
 */
export function buildRunInjection(config: any, opts: RunScriptOptions & { network: string }): string {
  if (!opts.harness) return "";
  const netConfig = config.networks?.[opts.network] as Record<string, unknown>;
  if (netConfig?.kind === "simulated") {
    return `
import { createTestHarness } from "@hardkas/testing/harness";
const hardkas = createTestHarness({
  accounts: ${parseInt(opts.accounts)},
  initialBalance: ${opts.balance}n,
  networkId: "${opts.network}",
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

  const { config } = await loadHardkasConfig();
  let network: string;
  try {
    network = resolveRunNetwork(config, opts.network);
  } catch (e: any) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(e.code ?? "RUN_NETWORK_UNKNOWN", String(e.message).replace(/^RUN_NETWORK_UNKNOWN: /, ""), { exitCode: 2 });
  }
  opts = { ...opts, network };

  // Build a wrapper that creates the harness or RPC client and injects it as global
  const injectionCode = buildRunInjection(config, { ...opts, network });
  const wrapperCode = `
${injectionCode}
(async () => {
  try {
    await import("file://${scriptPath.replace(/\\/g, "/")}");
  } catch (err) {
    console.error(err);
    throw err;
  }
})();
`;

  // Write to a temp file inside .hardkas to allow workspace resolution
  const dotHardkas = resolve(opts.workspaceRoot || process.cwd(), ".hardkas");
  if (!existsSync(dotHardkas)) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dotHardkas, { recursive: true });
  }

  const tempWrapper = resolve(dotHardkas, `run-${Date.now()}.mts`);

  const { writeFileAtomicSync } = await import("@hardkas/core");
  writeFileAtomicSync(tempWrapper, wrapperCode);

  try {
    // Execute via tsx
    const tsxBin = resolve("node_modules/.bin/tsx");
    const actualTsx = existsSync(tsxBin) ? tsxBin : "npx tsx";

    execSync(`${actualTsx} ${tempWrapper}`, {
      stdio: "inherit",
      cwd: opts.workspaceRoot || process.cwd(),
      env: {
        ...process.env,
        HARDKAS_NETWORK: opts.network,
        HARDKAS_ACCOUNTS: opts.accounts,
        HARDKAS_BALANCE: opts.balance
      }
    });
  } finally {
    if (existsSync(tempWrapper)) {
      unlinkSync(tempWrapper);
    }
  }
}
