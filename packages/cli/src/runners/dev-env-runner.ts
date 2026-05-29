import { UI } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";
import { runDevServer } from "./dev-server-runner.js";

export async function runDevEnv(options: any) {
  UI.header("HardKAS Dev Environment");
  UI.info("Checking workspace...");

  let config;
  try {
    const loaded = await loadHardkasConfig();
    config = loaded.config;
    UI.success(`Workspace detected: ${loaded.cwd}`);
  } catch (e: any) {
    UI.error(`Config load failed: ${e.message}`);
    UI.error("Not a valid HardKAS workspace.");
    UI.info("Run 'hardkas dev init' to initialize dApp support in this directory.");
    process.exitCode = 1;
    return;
  }

  const network = config.defaultNetwork || "simulated";
  UI.info(`Active Network: ${network}`);

  if (network === "simulated") {
    UI.warning("Running in SIMULATED mode. Transactions will not broadcast to Kaspa L1.");
    UI.warning(
      "Kaspa L1 does not execute EVM. Local simulation results do not imply mainnet finality."
    );
  }

  // Artifact & Store checks
  const path = await import("node:path");
  const fs = await import("node:fs");
  const artifactDir = path.join(process.cwd(), ".hardkas", "artifacts");
  if (fs.existsSync(artifactDir)) {
    UI.success(`Artifact folder health: OK (${artifactDir})`);
  } else {
    UI.info(
      `Artifact folder: Not found (will be created automatically on first transaction)`
    );
  }

  try {
    const res = await fetch("http://127.0.0.1:7420/api/dev/status", {
      signal: AbortSignal.timeout(1000)
    });
    if (res.ok) {
      UI.success("Local store connection: OK");
    }
  } catch (e) {}

  UI.info("\nStarting services...");

  // We reuse the existing dev-server runner instead of inventing a new orchestrator.
  // The dev-server runner already starts the watcher and binds ports.
  await runDevServer({
    port: options.port || "7420",
    host: options.host || "localhost",
    open: !options.headless,
    unsafeExternal: !!options.unsafeExternal,
    showToken: false,
    json: false
  });
}
