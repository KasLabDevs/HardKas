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
    UI.error("No package.json found. Are you in a Node.js project?");
    process.exitCode = 1;
    return;
  }

  UI.info("Checking configuration...");

  if (!fs.existsSync(configFile)) {
    const template = `import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  defaultNetwork: "simulated",
  networks: {
    simulated: {
      kind: "simulated",
      description: "Local development simulation"
    }
  },
  accounts: {
    developer: {
      kind: "simulated",
      address: "kaspa:sim_developer"
    }
  }
});
`;
    fs.writeFileSync(configFile, template, "utf-8");
    UI.success("Created hardkas.config.ts");
  } else {
    UI.info("hardkas.config.ts already exists.");
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
