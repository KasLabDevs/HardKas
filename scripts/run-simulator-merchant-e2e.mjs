// scripts/run-simulator-merchant-e2e.mjs — runs a merchant workspace's golden-core test against the HardKAS simulator.
//
// Usage: node scripts/run-simulator-merchant-e2e.mjs --workspace <merchant hardkas workspace> [--port <port>]
//   (or HARDKAS_SIMULATOR_WORKSPACE / HARDKAS_SIMULATOR_PORT)
//
// HK-01 / HK-05 migration (audit 6-nov-2026): no fixed D:/proyectos path, no canonical port 18210, no
// HARDKAS_SIMULATOR=1 (it no longer has any effect). The simulator listens on its own port and reports
// `2.1.0-kaspa-simulator`; the test process gets its URL in HARDKAS_SIMULATOR_WS_URL / HARDKAS_SIMULATOR_HTTP_URL and must
// use it. Flows that require the canonical rusty-kaspad (localnet, silver, capabilities) refuse the simulator. A PASS
// here is a simulator result: never evidence of node behaviour.
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import { createKaspaSimulator, SimulatorRpcServer, SIMULATOR_SERVER_VERSION } from "../packages/simulator/dist/index.js";
import { CANONICAL_LOCALNET, KASPA_SIMULATOR_DEFAULT_PORT } from "../packages/core/dist/index.js";

async function main() {
  const { values } = parseArgs({ options: { workspace: { type: "string" }, port: { type: "string" } } });
  const workspacePath = values.workspace ?? process.env.HARDKAS_SIMULATOR_WORKSPACE;
  if (!workspacePath) throw new Error("SIMULATOR_WORKSPACE_REQUIRED: pass --workspace <path> (or HARDKAS_SIMULATOR_WORKSPACE)");
  const port = Number(values.port ?? process.env.HARDKAS_SIMULATOR_PORT ?? KASPA_SIMULATOR_DEFAULT_PORT);
  if (Object.values(CANONICAL_LOCALNET.ports).includes(port)) {
    throw new Error(`SIMULATOR_PORT_CANONICAL: ${port} is a canonical localnet port; the simulator never serves on it`);
  }

  console.log("=== HARDKAS SIMULATOR (EXPERIMENTAL) x MERCHANT GOLDEN-CORE ===");
  const accountsFile = path.join(workspacePath, ".hardkas", "accounts.real.json");
  if (!existsSync(accountsFile)) throw new Error(`SIMULATOR_WORKSPACE_ACCOUNTS_MISSING: ${accountsFile}`);
  const accounts = JSON.parse(readFileSync(accountsFile, "utf8")).accounts ?? [];
  const minerAddress = accounts.find((a) => a.name === "miner")?.address;
  if (!minerAddress) throw new Error("miner address not found in accounts.real.json");

  const node = createKaspaSimulator({ networkId: "simnet" });
  const SOMPI = 100_000_000n;
  for (let i = 0; i < 5; i++) node.fund(minerAddress, 1_000n * SOMPI);
  node.mine(10);
  console.log(`Funded miner (${minerAddress}) with 5,000 KAS across 5 UTXOs. Virtual DAA: ${node.dag.getVirtualDaaScore()}`);

  const server = new SimulatorRpcServer(node);
  const started = await server.start({ host: "127.0.0.1", port });
  console.log(`Simulator (${SIMULATOR_SERVER_VERSION}) on ${started.wsUrl} (HTTP ${started.httpUrl})`);
  node.startMiner(40);

  const vitestBin = path.join(workspacePath, "node_modules", "vitest", "vitest.mjs");
  const testProc = spawn(process.execPath, [vitestBin, "run", "test/golden-core.test.ts"], {
    cwd: workspacePath,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      HARDKAS_SIMULATOR_WS_URL: started.wsUrl,
      HARDKAS_SIMULATOR_HTTP_URL: started.httpUrl
    },
    stdio: ["ignore", "inherit", "inherit"]
  });
  const exitCode = await new Promise((resolve) => testProc.on("close", resolve));

  node.stopMiner();
  await server.close();
  node.close();

  if (exitCode === 0) {
    console.log("=== golden-core passed against the HardKAS simulator (simulator result, not node evidence) ===");
  } else {
    console.error(`=== golden-core FAILED against the simulator (exit ${exitCode}) ===`);
    process.exit(exitCode || 1);
  }
}

main().catch((err) => {
  console.error("FATAL ERROR:", err?.message ?? err);
  process.exit(1);
});
