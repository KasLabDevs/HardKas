import { readTxPlanArtifact, readTxReceiptArtifact } from "@hardkas/artifacts";
import { loadOrCreateLocalnetState, verifyReplay } from "@hardkas/localnet";
import { UI } from "../ui.js";
import path from "node:path";
import fs from "node:fs";
import pc from "picocolors";

export interface ReplayVerifyOptions {
  path: string;
}

export async function runReplayVerify(options: ReplayVerifyOptions) {
  const artifactDir = path.resolve(process.cwd(), options.path);
  
  if (!fs.existsSync(path.join(artifactDir, "hardkas.config.ts"))) {
    throw new Error("WORKSPACE_NOT_FOUND: Directory is not a HardKAS workspace.");
  }
  
  // Try to load tx-plan.json and tx-receipt.json from the dir
  const planPath = path.join(artifactDir, "tx-plan.json");
  const receiptPath = path.join(artifactDir, "tx-receipt.json");

  UI.header(`Replay Verification: ${path.basename(artifactDir)}`);

  try {
    const plan = await readTxPlanArtifact(planPath);
    const receipt = await readTxReceiptArtifact(receiptPath);
    
    // For replay verification, we need a base state.
    let state = await loadOrCreateLocalnetState();

    // Reconstruct pre-state if we are running in simulated mode and have a receipt DAA score
    if (receipt.mode === "simulated" && receipt.daaScore) {
      const receiptDaa = BigInt(receipt.daaScore);
      const targetDaa = receiptDaa - 1n;
      
      const reconstructedUtxos = state.utxos
        .filter(u => BigInt(u.createdAtDaaScore || "0") <= targetDaa)
        .map(u => {
          if (u.spent && u.spentAtDaaScore && BigInt(u.spentAtDaaScore) >= receiptDaa) {
            return {
              ...u,
              spent: false,
              spentAtDaaScore: undefined
            };
          }
          return u;
        });

      state = {
        ...state,
        daaScore: targetDaa.toString(),
        utxos: reconstructedUtxos
      };
    }

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
