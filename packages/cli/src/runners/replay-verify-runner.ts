import { readTxPlanArtifact, readTxReceiptArtifact } from "@hardkas/artifacts";
import { loadOrCreateLocalnetState, verifyReplay } from "@hardkas/localnet";
import { UI } from "../ui.js";
import path from "node:path";

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
    // If the artifact is from a CI run, we might need a specific snapshot.
    // For now, we use the current localnet state (or a clean one if none exists).
    const state = await loadOrCreateLocalnetState();

    const report = verifyReplay(state, plan, receipt);

    if (report.invariantsOk) {
      UI.success("Replay Verified Successfully");
      console.log(`  Plan Hash:    ✓ MATCH`);
      console.log(`  State Hashes: ✓ MATCH`);
      console.log(`  Mass/Fees:    ✓ MATCH`);
      console.log(`  Status:       ✓ MATCH`);
    } else {
      UI.error("Replay Verification Failed");
      report.errors.forEach(err => console.log(`  [!] ${err}`));
      process.exitCode = 1;
    }
  } catch (e: any) {
    UI.error(`Failed to perform replay verification: ${e.message}`);
    process.exitCode = 1;
  }
}
