import { UI } from "../ui.js";
import { runTxReceipt } from "./tx-receipt-runner.js";
import { runTxVerify } from "./tx-verify-runner.js";
import fs from "node:fs";
import path from "node:path";
import { loadHardkasConfig } from "@hardkas/config";
import { HardkasSchemas, enumerateWorkspaceArtifactsSync } from "@hardkas/artifacts";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

// SURFACE-TRUTH-1B (ST-I):
// - the latest transaction artifact is looked up in the canonical store enumeration (`plans/`, `signed/`, `receipts/`, …).
//   The runner read only the top level of `.hardkas/artifacts`, where the current layout writes nothing, so it answered
//   "No recent transaction artifacts found" in workspaces that had them;
// - an error is a failure (typed, exit ≠ 0). Every error path here used to render a message and exit 0;
// - `--replay` says what it does: it shows the latest receipt, or verifies the latest plan or signed transaction. It
//   runs no replay (`hardkas replay verify` replays a simulator receipt).
export async function runDevLast(options: {
  inspect: boolean;
  replay: boolean;
  explain: boolean;
  workspaceRoot?: string;
}) {
  const loaded = await loadHardkasConfig(
    options.workspaceRoot ? { cwd: options.workspaceRoot } : {}
  );

  const files = enumerateWorkspaceArtifactsSync(loaded.cwd)
    .map((entry) => ({
      name: path.basename(entry.path),
      path: entry.path,
      time: fs.statSync(entry.path).mtime.getTime(),
      schema: typeof entry.artifact?.schema === "string" ? (entry.artifact.schema as string) : "",
      artifact: entry.artifact
    }))
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
    throw new HardkasCliError(
      "DEV_LAST_NOTHING_FOUND",
      "No recent transaction artifacts found in this workspace's store (.hardkas/artifacts).",
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }

  const targetPath = target.path;
  UI.info(`Targeting latest artifact: ${target.name}`);

  const wsSuffix = options.workspaceRoot ? ` --workspace ${options.workspaceRoot}` : "";
  // Wave 1.2 · IC-5′.11: suggestions name a contained workspace path (a file name
  // root is neither a path nor an artifactId and is not accepted by the resolver).
  const whyTarget = path.relative(loaded.cwd, targetPath).replace(/\\/g, "/");

  if (options.explain) {
    console.log(`\nTo explain this artifact, run:`);
    console.log(`hardkas why ${whyTarget}${wsSuffix}`);
    return;
  }

  if (options.inspect) {
    const data = fs.readFileSync(targetPath, "utf-8");
    console.log(JSON.stringify(JSON.parse(data), null, 2));
    UI.printNextSteps([`hardkas why ${whyTarget}${wsSuffix}`]);
    return;
  }

  if (options.replay) {
    if (
      target.schema.startsWith(HardkasSchemas.TxReceipt) ||
      target.name.startsWith("receipt_")
    ) {
      // For a receipt, we show it
      console.log("\nShowing the latest receipt (no replay is run)...");
      const txId =
        typeof target.artifact?.txId === "string" && target.artifact.txId
          ? (target.artifact.txId as string)
          : target.name.replace("receipt_", "").replace(".json", "");
      const result = await runTxReceipt({ txId, cwd: loaded.cwd });
      console.log(result.formatted);
      UI.printNextSteps([`hardkas why --tx ${txId}${wsSuffix}`]);
    } else {
      // For a plan or a signed transaction, we verify it
      console.log(`\nVerifying ${target.name} (no replay is run)...`);
      await runTxVerify({ path: targetPath, json: false, workspaceRoot: loaded.cwd });
      UI.printNextSteps([`hardkas why ${whyTarget}${wsSuffix}`]);
    }
    return;
  }

  // Default: just show the ID
  UI.causality("Latest Workflow Resolved", { Artifact: target.name }, [
    `hardkas dev last --replay${wsSuffix}`,
    `hardkas dev last --inspect${wsSuffix}`,
    `hardkas why ${whyTarget}${wsSuffix}`
  ]);
}
