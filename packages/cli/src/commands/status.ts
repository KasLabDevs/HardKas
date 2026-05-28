import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { listDevAccountsSync } from "@hardkas/accounts";
import fs from "fs";
import path from "path";

export function registerStatusCommands(program: Command) {
  program
    .command("status")
    .description("Display the current state of the local HardKAS runtime workspace")
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (options: { workspace?: string }) => {
      try {
        UI.header("HardKAS Workspace Status");

        // 1. Workspace Info
        const root = options.workspace ? path.resolve(options.workspace) : process.cwd();
        if (options.workspace && !fs.existsSync(root)) {
          throw new Error(`Invalid workspace: Directory '${root}' does not exist.`);
        }
        const hardkasDir = path.join(root, ".hardkas");
        const artifactsDir = path.join(hardkasDir, "artifacts");
        const hasWorkspace = fs.existsSync(hardkasDir);

        if (!hasWorkspace) {
          UI.info("No HardKAS workspace detected in current directory.");
          UI.printNextSteps(["hardkas init"]);
          return;
        }

        UI.box("Workspace", root);

        // 2. Node & Server Status (Offline check)
        // We do a fast check by trying to connect to the dev-server
        let serverOnline = false;
        try {
          const res = await fetch("http://localhost:3333/api/dashboard-health", { signal: AbortSignal.timeout(500) });
          if (res.ok) serverOnline = true;
        } catch {}

        UI.field("Dev Server", serverOnline ? "🟢 Online" : "🔴 Offline");
        UI.field("Kaspa Node", serverOnline ? "🟢 Online (Simulated)" : "🔴 Offline");
        
        UI.emptyLine();

        // 3. Artifacts
        let planCount = 0;
        let signedCount = 0;
        let receiptCount = 0;
        let replayCount = 0;
        let latestWorkflow = "none";
        
        if (fs.existsSync(artifactsDir)) {
          const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith(".json"));
          UI.field("Artifacts", `${files.length} indexed`);

          const sorted = files
            .map(f => ({ file: f, time: fs.statSync(path.join(artifactsDir, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time);

          if (sorted.length > 0 && sorted[0]) {
            latestWorkflow = sorted[0].file.replace(".json", "");
            UI.field("Latest Workflow", latestWorkflow);
          } else {
            UI.field("Latest Workflow", "none");
          }
        } else {
          UI.field("Artifacts", "0 (no artifacts directory)");
        }

        UI.emptyLine();

        // 4. Projection
        try {
          const { HardkasStore } = await import("@hardkas/query-store");
          const store = new HardkasStore({ dbPath: path.join(hardkasDir, "store.db") });
          store.connect();
          UI.field("Projection", "healthy");
        } catch (e) {
          UI.field("Projection", "degraded or offline");
        }

        UI.emptyLine();

        // 5. Dev Accounts
        const accounts = listDevAccountsSync(root);
        if (accounts.length > 0) {
          UI.info(`Active Dev Accounts (${accounts.length}):`);
          for (const acc of accounts) {
            UI.field(`  ${acc.name}`, acc.address.substring(0, 20) + "...");
          }
        } else {
          UI.info("No Dev Accounts found.");
        }

        // 6. Next Steps
        const nextSteps = [];
        const wsSuffix = options.workspace ? ` --workspace ${options.workspace}` : "";
        
        if (!serverOnline) {
          nextSteps.push(`hardkas dev --with-node${wsSuffix}`);
        } else {
          nextSteps.push(`hardkas dev tx send --from alice --to bob --amount 1${wsSuffix}`);
        }
        if (latestWorkflow !== "none") {
          nextSteps.push(`hardkas why ${latestWorkflow}${wsSuffix}`);
          nextSteps.push(`hardkas dev last --replay${wsSuffix}`);
        }

        UI.printNextSteps(nextSteps);
      } catch (e) {
        handleError(e, "Status Error");
      }
    });
}
