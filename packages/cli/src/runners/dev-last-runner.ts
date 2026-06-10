import { UI } from "../ui.js";
import { runTxReceipt } from "./tx-receipt-runner.js";
import { runTxVerify } from "./tx-verify-runner.js";
import fs from "node:fs";
import path from "node:path";
import { loadHardkasConfig } from "@hardkas/config";
import { HardkasSchemas } from "@hardkas/artifacts";

export async function runDevLast(options: {
  inspect: boolean;
  replay: boolean;
  explain: boolean;
  workspaceRoot?: string;
}) {
  const loaded = await loadHardkasConfig(
    options.workspaceRoot ? { cwd: options.workspaceRoot } : {}
  );
  const artifactsDir = path.join(loaded.cwd, ".hardkas", "artifacts");

  if (!fs.existsSync(artifactsDir)) {
    UI.error("No artifacts found in workspace.");
    return;
  }

  // Find latest receipt or txPlan by reading schemas
  const files = fs
    .readdirSync(artifactsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const fullPath = path.join(artifactsDir, f);
      const stat = fs.statSync(fullPath);
      let schema = "";
      try {
        const content = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        schema = content.schema || "";
      } catch (e) {}
      return {
        name: f,
        time: stat.mtime.getTime(),
        schema
      };
    })
    .sort((a, b) => b.time - a.time);

  // Preference order: replay > receipt > signedTx > txPlan
  const latestReplay = files.find((f) => f.schema.startsWith(HardkasSchemas.ReplayV1));
  const latestReceipt = files.find(
    (f) => f.schema.startsWith(HardkasSchemas.TxReceipt) || f.name.startsWith("receipt_")
  );
  const latestSigned = files.find(
    (f) => f.schema.startsWith(HardkasSchemas.SignedTx) || f.name.includes(".signed")
  );
  const latestPlan = files.find(
    (f) =>
      f.schema.startsWith(HardkasSchemas.TxPlan) ||
      f.name.startsWith("txPlan_") ||
      f.name.includes(".plan")
  );

  const target = options.replay
    ? latestReceipt || latestSigned || latestPlan
    : latestReplay || latestReceipt || latestSigned || latestPlan;

  if (!target) {
    UI.error("No recent transaction artifacts found.");
    return;
  }

  const targetPath = path.join(artifactsDir, target.name);
  UI.info(`Targeting latest artifact: ${target.name}`);

  const wsSuffix = options.workspaceRoot ? ` --workspace ${options.workspaceRoot}` : "";

  if (options.explain) {
    console.log(`\nTo explain this artifact, run:`);
    console.log(`hardkas why ${target.name.replace(".json", "")}${wsSuffix}`);
    return;
  }

  if (options.inspect) {
    try {
      const data = fs.readFileSync(targetPath, "utf-8");
      console.log(JSON.stringify(JSON.parse(data), null, 2));
      UI.printNextSteps([`hardkas why ${target.name.replace(".json", "")}${wsSuffix}`]);
    } catch (e) {
      UI.error("Failed to inspect artifact: " + e);
    }
    return;
  }

  if (options.replay) {
    if (
      target.schema.startsWith(HardkasSchemas.TxReceipt) ||
      target.name.startsWith("receipt_")
    ) {
      // For receipt, we show it
      console.log("\nReplaying receipt...");
      const txId = target.name.replace("receipt_", "").replace(".json", "");
      try {
        const result = await runTxReceipt({ txId, cwd: loaded.cwd });
        console.log(result.formatted);
        UI.printNextSteps([`hardkas why ${txId}${wsSuffix}`]);
      } catch (e) {
        UI.error("Replay failed: " + e);
      }
    } else {
      // For plan or signed, we verify it
      console.log(`\nReplaying transaction semantics for ${target.name}...`);
      try {
        await runTxVerify({ path: targetPath, json: false, workspaceRoot: loaded.cwd });
        UI.printNextSteps([`hardkas why ${target.name.replace(".json", "")}${wsSuffix}`]);
      } catch (e) {
        UI.error("Replay verification failed: " + e);
      }
    }
    return;
  }

  // Default: just show the ID
  UI.causality("Latest Workflow Resolved", { Artifact: target.name }, [
    `hardkas dev last --replay${wsSuffix}`,
    `hardkas dev last --inspect${wsSuffix}`,
    `hardkas why ${target.name.replace(".json", "")}${wsSuffix}`
  ]);
}
