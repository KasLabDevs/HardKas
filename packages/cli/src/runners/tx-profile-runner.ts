import { getOutput } from "../output.js";
import { readArtifact, TxPlanArtifact } from "@hardkas/artifacts";
import { estimateTransactionMass, MassBreakdown } from "@hardkas/tx-builder";
import { UI } from "../ui.js";
import { formatSompiToKas } from "@hardkas/core";
import path from "node:path";
import { HardkasSchemas } from "@hardkas/artifacts";

export interface TxProfileOptions {
  path: string;
  workspaceRoot: string;
}

export async function runTxProfile(options: TxProfileOptions) {
  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
  const absolutePath = sdk.workspace.resolvePath(options.path);
  const plan = (await readArtifact(absolutePath)) as TxPlanArtifact;

  const planObj = plan as unknown as Record<string, unknown>;
  if (plan.schema !== HardkasSchemas.TxPlan && planObj.schema !== HardkasSchemas.TxPlanV1) {
    throw new Error(`Artifact at ${options.path} is not a valid transaction plan.`);
  }

  const result = estimateTransactionMass({
    inputCount: plan.inputs.length,
    outputs: plan.outputs,
    hasChange: !!plan.change
  });

  UI.header(`Transaction Profile: ${path.basename(options.path)}`);

  getOutput().writeLine("Summary:");
  getOutput().writeLine(`  Plan ID:    ${plan.planId}`);
  getOutput().writeLine(`  Network:    ${plan.networkId}`);
  getOutput().writeLine(
    `  Amount:     ${formatSompiToKas(BigInt(plan.amountSompi))} (${plan.amountSompi} sompi)`
  );
  getOutput().writeLine(`  Total Mass: ${result.mass}`);
  getOutput().writeLine(
    `  Est. Fee:   ${formatSompiToKas(BigInt(plan.estimatedFeeSompi))} (${plan.estimatedFeeSompi} sompi)`
  );

  getOutput().writeLine("\nMass Breakdown:");
  getOutput().writeLine(
    `  Base Transaction:  ${result.breakdown.base.toString().padStart(5)}`
  );
  getOutput().writeLine(
    `  Inputs (${plan.inputs.length}):       ${result.breakdown.inputs.toString().padStart(5)}`
  );
  getOutput().writeLine(
    `  Outputs (${plan.outputs.length + (plan.change ? 1 : 0)}):      ${result.breakdown.outputs.toString().padStart(5)}`
  );
  if (result.breakdown.payload > 0n) {
    getOutput().writeLine(
      `  Payload:           ${result.breakdown.payload.toString().padStart(5)}`
    );
  }
  getOutput().writeLine(`  -----------------------`);
  getOutput().writeLine(`  Total:             ${result.mass.toString().padStart(5)}`);

  if (result.warnings.length > 0) {
    getOutput().writeLine("\x1b[33m\nWarnings:\x1b[0m");
    result.warnings.forEach((w) => getOutput().writeLine(`  [!] ${w}`));
  }

  getOutput().writeLine("\nStructure:");
  getOutput().writeLine(`  Inputs:  ${plan.inputs.length}`);
  plan.inputs.forEach((i, idx) => {
    getOutput().writeLine(
      `    [${idx}] ${i.outpoint.transactionId.substring(0, 8)}...:${i.outpoint.index} (${formatSompiToKas(BigInt(i.amountSompi))})`
    );
  });

  getOutput().writeLine(`  Outputs: ${plan.outputs.length + (plan.change ? 1 : 0)}`);
  plan.outputs.forEach((o, idx) => {
    getOutput().writeLine(
      `    [${idx}] ${o.address.substring(0, 20)}... (${formatSompiToKas(BigInt(o.amountSompi))})`
    );
  });
  if (plan.change) {
    getOutput().writeLine(
      `    [C] ${plan.change.address.substring(0, 20)}... (${formatSompiToKas(BigInt(plan.change.amountSompi))}) [CHANGE]`
    );
  }

  getOutput().writeLine(
    "\nNote: Mass estimation is protocol-aware (0.9.3-alpha best-effort)."
  );
}
