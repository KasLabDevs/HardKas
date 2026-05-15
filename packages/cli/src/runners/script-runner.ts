// SAFETY_LEVEL: SIMULATION_ONLY

import { resolve, dirname } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

export async function runScript(script: string, opts: {
  network: string;
  accounts: string;
  balance: string;
  harness: boolean;
}): Promise<void> {
  const scriptPath = resolve(script);

  if (!existsSync(scriptPath)) {
    console.error(`Script not found: ${scriptPath}`);
    process.exit(1);
  }

  // Build a wrapper that creates the harness and injects it as global
  const wrapperCode = `
import { createTestHarness } from "@hardkas/testing/harness";
(async () => {
  try {
    ${opts.harness ? `
    const hardkas = createTestHarness({
      accounts: ${parseInt(opts.accounts)},
      initialBalance: ${opts.balance}n,
      networkId: "${opts.network}",
    });
    (globalThis as any).hardkas = hardkas;
    ` : ""}
    await import("file://${scriptPath.replace(/\\/g, "/")}");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
`;

  // Write to a temp file inside .hardkas to allow workspace resolution
  const dotHardkas = resolve(process.cwd(), ".hardkas");
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
      cwd: process.cwd(),
      env: {
        ...process.env,
        HARDKAS_NETWORK: opts.network,
        HARDKAS_ACCOUNTS: opts.accounts,
        HARDKAS_BALANCE: opts.balance,
      },
    });
  } finally {
    if (existsSync(tempWrapper)) {
      unlinkSync(tempWrapper);
    }
  }
}
