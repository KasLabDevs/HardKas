import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { listDevAccountsSync } from "@hardkas/accounts";
import fs from "fs";
import path from "path";
import { invocationWorkspace } from "../workspace-root.js";

export function registerStatusCommands(program: Command) {
  program
    .command("status")
    .description("Display the current state of the local HardKAS runtime workspace")
    .option("--workspace <path>", "Override workspace root directory")
    .action(async () => {
      try {
        UI.header("HardKAS Workspace Status");

        // 1. Workspace Info · WORKSPACE-AUTHORITY-1 (WA-I0): the invocation's one root
        const workspace = invocationWorkspace();
        const root = workspace.root;
        if (workspace.explicit !== undefined && !fs.existsSync(root)) {
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

        // 2. Dev server (offline check). SURFACE-TRUTH-1B: the dev server `hardkas dev` starts (localhost:7420). This used
        // to ask the old dashboard (localhost:3333, a command the CLI does not register), and to report the Kaspa node
        // "Online (Simulated)" whenever that answered, without checking any node; `status` checks no node.
        let serverOnline = false;
        try {
          const res = await fetch("http://localhost:7420/api/health", {
            signal: AbortSignal.timeout(500)
          });
          if (res.ok) serverOnline = true;
        } catch {}

        UI.field("Dev Server", serverOnline ? "🟢 Online" : "🔴 Offline");

        UI.emptyLine();

        // 3. Artifacts
        let planCount = 0;
        let signedCount = 0;
        let receiptCount = 0;
        let replayCount = 0;
        let latestWorkflow = "none";

        if (fs.existsSync(artifactsDir)) {
          // WORKSPACE-AUTHORITY-1 (C1): "Artifacts" are the distinct identities of the artifact store the resolver reads
          // (all its canonical subdirectories); its files are a different count, named as such.
          const { countWorkspaceArtifactsSync } = await import("@hardkas/artifacts");
          const counts = countWorkspaceArtifactsSync(root);
          UI.field("Artifacts", `${counts.artifacts} (${counts.entries} store files)`);
          const files = fs.readdirSync(artifactsDir).filter((f) => f.endsWith(".json"));

          const sorted = files
            .map((f) => ({
              file: f,
              time: fs.statSync(path.join(artifactsDir, f)).mtimeMs
            }))
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

        // 4. Projection · WORKSPACE-AUTHORITY-1: observed, never created (WA-I3); "fresh" only when proven built from the
        // workspace's current artifacts and ledger (WA-I2)
        try {
          const { readProjectionStatus } = await import("@hardkas/query-store");
          const projection = readProjectionStatus(root, path.join(hardkasDir, "store.db"));
          UI.field(
            "Projection",
            projection.state === "fresh"
              ? "fresh"
              : projection.state === "absent"
                ? "none (queries read the workspace)"
                : `${projection.state}: ${projection.reason} (queries read the workspace; run 'hardkas query store rebuild')`
          );
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
        const wsSuffix = workspace.explicit !== undefined ? ` --workspace ${workspace.explicit}` : "";

        if (!serverOnline) {
          // `dev` has no --with-node (the hint named an option it does not register), and it takes no --workspace: it
          // runs in the current directory
          nextSteps.push(`hardkas dev --headless`);
        } else {
          nextSteps.push(
            `hardkas dev tx send --from alice --to bob --amount 1${wsSuffix}`
          );
        }
        if (latestWorkflow !== "none") {
          nextSteps.push(`hardkas why --workflow ${latestWorkflow}${wsSuffix}`);
          nextSteps.push(`hardkas dev last --replay${wsSuffix}`);
        }

        UI.printNextSteps(nextSteps);
      } catch (e) {
        handleError(e, "Status Error");
      }
    });
}
