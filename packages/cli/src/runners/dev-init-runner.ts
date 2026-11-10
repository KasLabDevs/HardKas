import { UI, handleError } from "../ui.js";
import path from "node:path";
import fs from "node:fs";

export async function runDevInit() {
  UI.header("HardKAS dApp Initialization");

  const targetDir = process.cwd();
  const configFile = path.join(targetDir, "hardkas.config.ts");
  const pkgFile = path.join(targetDir, "package.json");
  const clientFile = path.join(targetDir, "src", "hardkas", "client.ts");

  if (!fs.existsSync(pkgFile)) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "NOT_NODE_PROJECT",
      "No package.json found. Are you in a Node.js project?",
      { exitCode: 1 }
    );
  }

  UI.info("Checking configuration...");

  // ESCALÓN 3 · P1: an existing config is never touched, whatever its name: a new hardkas.config.ts next to a
  // hardkas.config.mjs would shadow it (the loader prefers .ts). The generated config imports nothing (the old one
  // imported @hardkas/config, which a project does not depend on, and never loaded) and is loaded before it is kept.
  const { configFilesIn, scaffoldConfigSource, configLoadError } = await import("../config-scaffold.js");
  const existingConfig = configFilesIn(targetDir)[0];
  if (!existingConfig) {
    // PAPERCUTS #38: generated configs declare their target through the `execution` contract.
    const template = scaffoldConfigSource({
      description: "Local development simulation",
      accounts: { developer: { kind: "simulated", address: "kaspa:sim_developer" } }
    });
    fs.writeFileSync(configFile, template, "utf-8");
    const loadError = await configLoadError(configFile);
    if (loadError !== undefined) {
      fs.rmSync(configFile, { force: true });
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("CONFIG_TEMPLATE_INVALID", `The generated config did not load, so it was not kept: ${loadError}`);
    }
    UI.success("Created hardkas.config.ts");
  } else {
    UI.info(`${path.basename(existingConfig)} already exists; it is kept unchanged.`);
  }

  // Create SDK client facade stub
  if (!fs.existsSync(clientFile)) {
    fs.mkdirSync(path.dirname(clientFile), { recursive: true });
    const clientTemplate = `import { createHardkasClient } from "@hardkas/sdk";

// Local development facade targeting the HardKAS Dev Server
export const client = createHardkasClient({
  baseUrl: "http://localhost:7420",
  network: "simulated"
});
`;
    fs.writeFileSync(clientFile, clientTemplate, "utf-8");
    UI.success("Created src/hardkas/client.ts");
  }

  const gitIgnoreFile = path.join(targetDir, ".gitignore");
  if (fs.existsSync(gitIgnoreFile)) {
    const content = fs.readFileSync(gitIgnoreFile, "utf-8");
    if (!content.includes(".hardkas/")) {
      // hardkas-append-allow
      fs.appendFileSync(gitIgnoreFile, "\n# HardKAS\n.hardkas/\n", "utf-8");
      UI.success("Updated .gitignore with .hardkas/");
    }
  }

  UI.success("dApp support initialized successfully!");
  UI.info("Run 'hardkas dev' to start the local environment.");
}
