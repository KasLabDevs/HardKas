import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { KASPA_SIMULATOR_DEFAULT_PORT } from "@hardkas/core";
import { createKaspaSimulator, SOMPI_PER_KAS } from "../simulator-node.js";
import { SimulatorRpcServer } from "../rpc/rpc-server.js";
import { SIMULATOR_SERVER_VERSION } from "../rpc/simulator-rpc.js";
import type { NetworkId } from "../types.js";

const SUPPORTED_NETWORKS: readonly NetworkId[] = ["simnet", "devnet", "testnet-10", "testnet-11"];

function packageVersion(): string {
  try {
    return String(createRequire(import.meta.url)("../../package.json").version);
  } catch {
    return "unknown";
  }
}

const HELP = `
kaspa-simulator — in-memory Kaspa node simulator for local development (EXPERIMENTAL)

It imitates the RPC of rusty-kaspad ${SIMULATOR_SERVER_VERSION.replace(/-kaspa-simulator$/, "")} and approximates its rules. It is not
consensus-equivalent: validate timelocks, covenants and transaction rules against rusty-kaspad (simnet).
Known divergences: packages/simulator/README.md.

Usage:
  kaspa-simulator [options]

Options:
  -p, --port <port>       RPC listen port (default: ${KASPA_SIMULATOR_DEFAULT_PORT}; never a canonical localnet port)
  -h, --host <host>       Host interface (default: 127.0.0.1)
  -n, --network <network> Network ID: ${SUPPORTED_NETWORKS.join(", ")} (default: simnet; mainnet is refused)
      --automine <bool>   Mine a block on every transaction submit (default: true)
      --allow-origin <o>  Browser origin allowed to call the RPC (repeatable; default: none)
      --no-dev-methods    Do not serve the kaspasim_* dev methods
  -v, --version           Print version and exit
      --help              Show this help message
`;

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options = {
    port: { type: "string" as const, short: "p", default: String(KASPA_SIMULATOR_DEFAULT_PORT) },
    host: { type: "string" as const, short: "h", default: "127.0.0.1" },
    network: { type: "string" as const, short: "n", default: "simnet" },
    automine: { type: "string" as const, default: "true" },
    "allow-origin": { type: "string" as const, multiple: true as const },
    "no-dev-methods": { type: "boolean" as const },
    help: { type: "boolean" as const },
    version: { type: "boolean" as const, short: "v" }
  };

  const { values } = parseArgs({ args: argv, options, strict: false });

  if (values.version) {
    console.log(`kaspa-simulator ${packageVersion()} (@hardkas/simulator, EXPERIMENTAL; reports ${SIMULATOR_SERVER_VERSION})`);
    return;
  }

  if (values.help) {
    console.log(HELP);
    return;
  }

  const port = parseInt(typeof values.port === "string" ? values.port : String(KASPA_SIMULATOR_DEFAULT_PORT), 10);
  const host = typeof values.host === "string" ? values.host : "127.0.0.1";
  const networkId = (typeof values.network === "string" ? values.network : "simnet") as NetworkId;
  if (!SUPPORTED_NETWORKS.includes(networkId)) {
    throw new Error(`SIMULATOR_NETWORK_UNSUPPORTED: '${networkId}' is not one of ${SUPPORTED_NETWORKS.join(", ")} (mainnet is refused: the dev keys derive from a public seed)`);
  }
  const automine = values.automine !== "false" && values.automine !== false;
  const allowedOrigins = Array.isArray(values["allow-origin"]) ? values["allow-origin"].map(String) : [];

  console.log(`
  kaspa-simulator ${packageVersion()} — EXPERIMENTAL in-memory Kaspa node simulator (not consensus-equivalent)
  `);

  const sim = createKaspaSimulator({
    networkId,
    automine,
    bootstrapDevAccounts: true
  });

  const server = new SimulatorRpcServer(sim);
  const info = await server.start({ port, host, allowedOrigins, devMethods: values["no-dev-methods"] !== true });

  console.log(`  Network:        ${networkId}`);
  console.log(`  Reports:        ${SIMULATOR_SERVER_VERSION} (never accepted as the canonical rusty-kaspad)`);
  console.log(`  Automine:       ${automine ? "ENABLED (a block per submitted transaction)" : "DISABLED (manual mining)"}`);
  console.log(`  JSON-RPC HTTP:  ${info.url}`);
  console.log(`  Kaspa wRPC WS:  ${info.wsUrl}`);
  console.log("");
  console.log("  Dev accounts (pre-funded with 1,000 KAS each). Their keys derive from a PUBLIC seed:");
  console.log("  anyone can spend from these addresses; never send real funds to them.");
  console.log("  ========================================================");

  const accounts = sim.getDevAccounts();
  for (const acc of accounts) {
    const bal = sim.ledger.getBalance(acc.address);
    const kas = Number(bal) / Number(SOMPI_PER_KAS);
    console.log(`  [${acc.name.toUpperCase()}]`);
    console.log(`    Address:     ${acc.address}`);
    console.log(`    Private Key: ${acc.privateKey}`);
    console.log(`    Balance:     ${kas.toLocaleString()} KAS (${bal} sompi)`);
  }

  console.log("");
  console.log("  Ready. Press Ctrl+C to stop.");

  const shutdown = async () => {
    console.log("\n  Shutting down simulator server...");
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/** True only when this module is the process entry point (`node dist/cli/index.js`), not when the bin imports it. */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  runCli().catch((err) => {
    console.error("FATAL ERROR IN CLI:", err?.message ?? err);
    process.exit(1);
  });
}
