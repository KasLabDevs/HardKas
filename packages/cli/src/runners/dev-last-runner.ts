import { UI } from "../ui.js";
import { runTxReceipt } from "./tx-receipt-runner.js";
import { runTxVerify } from "./tx-verify-runner.js";
import fs from "node:fs";
import path from "node:path";
import { loadHardkasConfig } from "@hardkas/config";

export async function runDevLast(options: { inspect: boolean; replay: boolean; explain: boolean }) {
  const loaded = await loadHardkasConfig();
  const artifactsDir = path.join(loaded.cwd, ".hardkas", "artifacts");
  
  if (!fs.existsSync(artifactsDir)) {
    UI.error("No artifacts found in workspace.");
    return;
  }

  // Find latest receipt or txPlan
  const files = fs.readdirSync(artifactsDir)
    .filter(f => f.endsWith(".json"))
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(artifactsDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  const latestReceipt = files.find(f => f.name.startsWith("receipt_"));
  const latestPlan = files.find(f => f.name.startsWith("txPlan_"));
  
  const target = latestReceipt || latestPlan;

  if (!target) {
    UI.error("No recent transaction artifacts found.");
    return;
  }

  const targetPath = path.join(artifactsDir, target.name);
  UI.info(`Targeting latest artifact: ${target.name}`);

  if (options.explain) {
    console.log(`\nTo explain this artifact, run:`);
    console.log(`hardkas why ${target.name.replace(".json", "")}`);
    return;
  }

  if (options.inspect) {
    try {
      const data = fs.readFileSync(targetPath, "utf-8");
      console.log(JSON.stringify(JSON.parse(data), null, 2));
      UI.printNextSteps([`hardkas why ${target.name.replace(".json", "")}`]);
    } catch (e) {
      UI.error("Failed to inspect artifact: " + e);
    }
    return;
  }

  if (options.replay) {
    if (target.name.startsWith("receipt_")) {
      // For receipt, we show it
      console.log("\nReplaying receipt...");
      const txId = target.name.replace("receipt_", "").replace(".json", "");
      try {
        const result = await runTxReceipt({ txId, cwd: loaded.cwd });
        console.log(result.formatted);
        UI.printNextSteps([`hardkas why ${txId}`]);
      } catch (e) {
        UI.error("Replay failed: " + e);
      }
    } else {
      // For plan, we verify it
      console.log("\nReplaying transaction plan semantics...");
      try {
        await runTxVerify({ path: targetPath, json: false, workspaceRoot: loaded.cwd });
        UI.printNextSteps([
          `hardkas dev tx sign ${target.name.replace(".json", "")}`,
          `hardkas why ${target.name.replace(".json", "")}`
        ]);
      } catch (e) {
        UI.error("Replay verification failed: " + e);
      }
    }
    return;
  }

  // Default: just show the ID
  UI.causality("Latest Workflow Resolved", { "Artifact": target.name }, [
    `hardkas dev last --replay`,
    `hardkas dev last --inspect`,
    `hardkas why ${target.name.replace(".json", "")}`
  ]);
}
