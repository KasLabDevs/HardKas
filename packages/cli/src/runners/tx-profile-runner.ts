import { readArtifact, TxPlanArtifact } from "@hardkas/artifacts";
import { estimateTransactionMass, MassBreakdown } from "@hardkas/tx-builder";
import { UI } from "../ui.js";
import { formatSompi } from "@hardkas/core";
import path from "node:path";

export interface TxProfileOptions {
  path: string;
}

export async function runTxProfile(options: TxProfileOptions) {
  const absolutePath = path.resolve(process.cwd(), options.path);
  const plan = await readArtifact(absolutePath) as TxPlanArtifact;

  if (plan.schema !== "hardkas.txPlan" && (plan as any).schema !== "hardkas.txPlan.v1") {
    throw new Error(`Artifact at ${options.path} is not a valid transaction plan.`);
  }

  const result = estimateTransactionMass({
    inputCount: plan.inputs.length,
    outputs: plan.outputs,
    hasChange: !!plan.change
  });

  UI.header(`Transaction Profile: ${path.basename(options.path)}`);
  
  console.log("Summary:");
  console.log(`  Plan ID:    ${plan.planId}`);
  console.log(`  Network:    ${plan.networkId}`);
  console.log(`  Amount:     ${formatSompi(BigInt(plan.amountSompi))} (${plan.amountSompi} sompi)`);
  console.log(`  Total Mass: ${result.mass}`);
  console.log(`  Est. Fee:   ${formatSompi(BigInt(plan.estimatedFeeSompi))} (${plan.estimatedFeeSompi} sompi)`);
  
  console.log("\nMass Breakdown:");
  console.log(`  Base Transaction:  ${result.breakdown.base.toString().padStart(5)}`);
  console.log(`  Inputs (${plan.inputs.length}):       ${result.breakdown.inputs.toString().padStart(5)}`);
  console.log(`  Outputs (${plan.outputs.length + (plan.change ? 1 : 0)}):      ${result.breakdown.outputs.toString().padStart(5)}`);
  if (result.breakdown.payload > 0n) {
    console.log(`  Payload:           ${result.breakdown.payload.toString().padStart(5)}`);
  }
  console.log(`  -----------------------`);
  console.log(`  Total:             ${result.mass.toString().padStart(5)}`);

  if (result.warnings.length > 0) {
    console.log("\x1b[33m\nWarnings:\x1b[0m");
    result.warnings.forEach(w => console.log(`  [!] ${w}`));
  }

  console.log("\nStructure:");
  console.log(`  Inputs:  ${plan.inputs.length}`);
  plan.inputs.forEach((i, idx) => {
    console.log(`    [${idx}] ${i.outpoint.transactionId.substring(0, 8)}...:${i.outpoint.index} (${formatSompi(BigInt(i.amountSompi))})`);
  });
  
  console.log(`  Outputs: ${plan.outputs.length + (plan.change ? 1 : 0)}`);
  plan.outputs.forEach((o, idx) => {
    console.log(`    [${idx}] ${o.address.substring(0, 20)}... (${formatSompi(BigInt(o.amountSompi))})`);
  });
  if (plan.change) {
    console.log(`    [C] ${plan.change.address.substring(0, 20)}... (${formatSompi(BigInt(plan.change.amountSompi))}) [CHANGE]`);
  }

  console.log("\nNote: Mass estimation is protocol-aware (v0.2-alpha best-effort).");
}
