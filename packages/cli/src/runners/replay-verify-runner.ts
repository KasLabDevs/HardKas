import { readTxPlanArtifact, readTxReceiptArtifact } from "@hardkas/artifacts";
import { loadOrCreateLocalnetState, verifyReplay } from "@hardkas/localnet";
import { UI } from "../ui.js";
import path from "node:path";
import pc from "picocolors";

export interface ReplayVerifyOptions {
  path: string;
}

export async function runReplayVerify(options: ReplayVerifyOptions) {
  const artifactDir = path.resolve(process.cwd(), options.path);
  
  // Try to load tx-plan.json and tx-receipt.json from the dir
  const planPath = path.join(artifactDir, "tx-plan.json");
  const receiptPath = path.join(artifactDir, "tx-receipt.json");

  UI.header(`Replay Verification: ${path.basename(artifactDir)}`);

  try {
    const plan = await readTxPlanArtifact(planPath);
    const receipt = await readTxReceiptArtifact(receiptPath);
    
    // For replay verification, we need a base state.
    const state = await loadOrCreateLocalnetState();

    const report = verifyReplay(state, plan, receipt);

    // Honest Report UI
    console.log(`  Workflow:      ${report.checks.workflowDeterministic === "reproduced" ? pc.green("✓ REPRODUCED") : pc.red("✗ DIVERGED")}`);
    console.log(`  Consensus:     ${pc.yellow("- UNIMPLEMENTED")} (HardKAS does not validate network consensus)`);
    console.log(`  L2 Logic:      ${pc.yellow("- UNIMPLEMENTED")} (HardKAS does not validate bridge protocol)`);
    console.log("");

    if (report.invariantsOk) {
      UI.success("Artifact workflow is deterministic.");
      console.log(`  Plan Hash:     ✓ MATCH`);
      console.log(`  Semantic Diff: ✓ NO CHANGES`);
    } else {
      UI.error("Replay Verification Failed");
      if (report.divergences.length > 0) {
        console.log(pc.bold("\n  Divergences found:"));
        for (const div of report.divergences) {
          console.log(`    ${pc.cyan(div.path)}:`);
          console.log(`      Expected: ${pc.green(JSON.stringify(div.expected))}`);
          console.log(`      Actual:   ${pc.red(JSON.stringify(div.actual))}`);
        }
      }
      
      if (report.errors.length > 0 && report.divergences.length === 0) {
        report.errors.forEach(err => console.log(`  [!] ${err}`));
      }
      process.exitCode = 1;
    }
  } catch (e: any) {
    UI.error(`Failed to perform replay verification: ${e.message}`);
    process.exitCode = 1;
  }
}
