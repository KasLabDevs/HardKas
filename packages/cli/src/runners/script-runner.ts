// SAFETY_LEVEL: SIMULATION_ONLY

import { resolve, dirname } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { loadHardkasConfig } from "@hardkas/config";
import { tmpdir } from "node:os";

export async function runScript(
  script: string,
  opts: {
    network: string;
    accounts: string;
    balance: string;
    harness: boolean;
    workspaceRoot?: string;
  }
): Promise<void> {
  const scriptPath = resolve(script);

  if (!existsSync(scriptPath)) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("SCRIPT_NOT_FOUND", `Script not found: ${scriptPath}`, {
      exitCode: 1
    });
  }

  const { config } = await loadHardkasConfig();
  const netConfig = config.networks?.[opts.network] || { kind: "simulated" };
  const isSimulated = netConfig.kind === "simulated";

  // Build a wrapper that creates the harness or RPC client and injects it as global
  let injectionCode = "";
  if (opts.harness) {
    if (isSimulated) {
      injectionCode = `
import { createTestHarness } from "@hardkas/testing/harness";
const hardkas = createTestHarness({
  accounts: ${parseInt(opts.accounts)},
  initialBalance: ${opts.balance}n,
  networkId: "${opts.network}",
});
Object.assign(globalThis, { hardkas });
`;
    } else {
      const netConfigObj = netConfig as unknown as Record<string, unknown>;
      const rpcUrl = typeof netConfigObj.rpcUrl === "string" ? netConfigObj.rpcUrl : "";
      const networkId =
        typeof netConfigObj.network === "string" ? netConfigObj.network : opts.network;
      injectionCode = `
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
const rpc = new JsonWrpcKaspaClient({ rpcUrl: "${rpcUrl}" });
const hardkas = {
  network: "${opts.network}",
  networkId: "${networkId}",
  rpcUrl: "${rpcUrl}",
  rpc: rpc
};
Object.assign(globalThis, { hardkas });
`;
    }
  }

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
