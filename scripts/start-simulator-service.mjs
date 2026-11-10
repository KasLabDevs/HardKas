// scripts/start-simulator-service.mjs — runs the HardKAS simulator (EXPERIMENTAL) as a local service for a workspace.
//
// Usage: node scripts/start-simulator-service.mjs --workspace <hardkas workspace> [--port <port>] [--host 127.0.0.1]
//   (or HARDKAS_SIMULATOR_WORKSPACE / HARDKAS_SIMULATOR_PORT)
//
// HK-01 / HK-05 migration (audit 6-nov-2026): this script used to read the accounts of one machine's workspace
// (D:/proyectos/...) and to serve the simulator on 127.0.0.1:18210, the canonical localnet's endpoint, where (with
// HARDKAS_SIMULATOR=1) HardKAS took it for the verified rusty-kaspad. Now: the workspace is an argument, the port is the
// simulator's own (19110 by default; a canonical localnet port is refused), and the simulator reports
// `2.1.0-kaspa-simulator`. Point the workspace's RPC URL at the printed ws URL; the commands that need the canonical
// node (localnet, silver deploy/spend/covenant, capabilities) refuse the simulator by design.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createKaspaSimulator, SimulatorRpcServer, SIMULATOR_SERVER_VERSION } from "../packages/simulator/dist/index.js";
import { CANONICAL_LOCALNET, KASPA_SIMULATOR_DEFAULT_PORT } from "../packages/core/dist/index.js";

const { values } = parseArgs({
  options: {
    workspace: { type: "string" },
    port: { type: "string" },
    host: { type: "string", default: "127.0.0.1" }
  }
});

const workspacePath = values.workspace ?? process.env.HARDKAS_SIMULATOR_WORKSPACE;
if (!workspacePath) {
  console.error("SIMULATOR_WORKSPACE_REQUIRED: pass --workspace <path> (or HARDKAS_SIMULATOR_WORKSPACE)");
  process.exit(2);
}
const port = Number(values.port ?? process.env.HARDKAS_SIMULATOR_PORT ?? KASPA_SIMULATOR_DEFAULT_PORT);
if (Object.values(CANONICAL_LOCALNET.ports).includes(port)) {
  console.error(`SIMULATOR_PORT_CANONICAL: ${port} is a canonical localnet port; the simulator never serves on it`);
  process.exit(2);
}

const accountsFile = path.join(workspacePath, ".hardkas", "accounts.real.json");
const accounts = existsSync(accountsFile) ? JSON.parse(readFileSync(accountsFile, "utf8")).accounts ?? [] : [];
const byName = new Map(accounts.map((a) => [a.name, a.address]));

console.log("[SIM-SERVICE] Initializing the HardKAS simulator (EXPERIMENTAL, not consensus-equivalent) on simnet...");
const node = createKaspaSimulator({ networkId: "simnet" });
const SOMPI = 100_000_000n;

const fund = (address, amount, label) => {
  try {
    node.fund(address, amount);
  } catch (e) {
    console.error(`[SIM-SERVICE] not funded ${label} (${address}): ${e?.message ?? e}`);
  }
};

const miner = byName.get("miner");
if (miner) for (let i = 0; i < 5; i++) fund(miner, 1_000n * SOMPI, "miner");
for (const name of ["alice", "bob", "charlie", "dave", "eve"]) {
  const address = byName.get(name);
  if (address) fund(address, 100n * SOMPI, name);
}

// Dev accounts of the workspace itself (.hardkas/dev-accounts/*.json)
const devDir = path.join(workspacePath, ".hardkas", "dev-accounts");
if (existsSync(devDir)) {
  for (const file of readdirSync(devDir).filter((f) => f.endsWith(".json"))) {
    try {
      const address = JSON.parse(readFileSync(path.join(devDir, file), "utf8")).metadata?.address;
      if (typeof address === "string") fund(address, 100n * SOMPI, file);
    } catch (e) {
      console.error(`[SIM-SERVICE] unreadable dev account ${file}: ${e?.message ?? e}`);
    }
  }
}

node.mine(20);
console.log(`[SIM-SERVICE] Seeded accounts and mined 20 blocks. Virtual DAA: ${node.dag.getVirtualDaaScore()}`);

const server = new SimulatorRpcServer(node);
const started = await server.start({ host: values.host, port });
console.log(`[SIM-SERVICE] Simulator (${SIMULATOR_SERVER_VERSION}) on ${started.wsUrl} (HTTP ${started.httpUrl})`);

node.startMiner(50);
console.log("[SIM-SERVICE] Background miner active (50 ms interval). Ready for RPC clients.");

const shutdown = async () => {
  console.log("\n[SIM-SERVICE] Shutting down...");
  node.stopMiner();
  await server.close();
  node.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
