import { getOutput } from "../output.js";
import { readArtifact, TxPlanArtifact } from "@hardkas/artifacts";
import { estimateTransactionMass, calculateUpstreamMass, MassBreakdown } from "@hardkas/tx-builder";
import { UI } from "../ui.js";
import { formatSompiToKas } from "@hardkas/core";
import path from "node:path";
import { HardkasSchemas } from "@hardkas/artifacts";
import { withSdk } from "./with-sdk.js";

export interface TxProfileOptions {
  path: string;
  workspaceRoot: string;
  /** JSON-PAPERCUTS #40: with `--json` the profile is ONE JSON document on stdout and nothing else is printed. */
  json?: boolean;
}

/** The machine-readable profile (`result` of the `--json` envelope). Sompi and mass are decimal strings. */
export interface TxProfileResult {
  path: string;
  planId: string;
  artifactId: string | null;
  networkId: string;
  mode: string | null;
  amountSompi: string;
  estimatedFeeSompi: string;
  mass: {
    total: string;
    base: string;
    inputs: string;
    outputs: string;
    payload: string;
  };
  structure: {
    inputs: Array<{ index: number; outpoint: { transactionId: string; index: number }; amountSompi: string }>;
    outputs: Array<{ index: number; address: string; amountSompi: string }>;
    change: { address: string; amountSompi: string } | null;
  };
  warnings: string[];
}

export async function runTxProfile(options: TxProfileOptions): Promise<TxProfileResult> {
  const absolutePath = await withSdk({ cwd: options.workspaceRoot }, (sdk) => sdk.workspace.resolvePath(options.path));
  const plan = (await readArtifact(absolutePath)) as TxPlanArtifact;

  const planObj = plan as unknown as Record<string, unknown>;
  if (plan.schema !== HardkasSchemas.TxPlan && planObj.schema !== HardkasSchemas.TxPlanV1) {
    throw new Error(`Artifact at ${options.path} is not a valid transaction plan.`);
  }

  // Breakdown by shape (SDK totals, differenced); the total is the SDK's mass
  // for the plan's own transaction, amounts included.
  const result = estimateTransactionMass({
    inputCount: plan.inputs.length,
    outputs: plan.outputs,
    hasChange: !!plan.change,
    networkId: plan.networkId
  });
  const upstream = calculateUpstreamMass({
    networkId: plan.networkId,
    inputs: plan.inputs.map((i: any) => ({ amountSompi: BigInt(i.amountSompi), outpoint: i.outpoint, scriptPublicKey: i.scriptPublicKey })),
    outputs: [
      ...plan.outputs.map((o: any) => ({ amountSompi: BigInt(o.amountSompi), address: o.address })),
      ...(plan.change ? [{ amountSompi: BigInt(plan.change.amountSompi), address: plan.change.address }] : [])
    ]
  });
  result.mass = upstream.mass;

  const profile: TxProfileResult = {
    path: options.path,
    planId: plan.planId,
    artifactId: typeof planObj.contentHash === "string" ? (planObj.contentHash as string) : null,
    networkId: plan.networkId,
    mode: typeof planObj.mode === "string" ? (planObj.mode as string) : null,
    amountSompi: String(plan.amountSompi),
    estimatedFeeSompi: String(plan.estimatedFeeSompi),
    mass: {
      total: result.mass.toString(),
      base: result.breakdown.base.toString(),
      inputs: result.breakdown.inputs.toString(),
      outputs: result.breakdown.outputs.toString(),
      payload: result.breakdown.payload.toString()
    },
    structure: {
      inputs: plan.inputs.map((i, index) => ({
        index,
        outpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index },
        amountSompi: String(i.amountSompi)
      })),
      outputs: plan.outputs.map((o, index) => ({ index, address: o.address, amountSompi: String(o.amountSompi) })),
      change: plan.change ? { address: plan.change.address, amountSompi: String(plan.change.amountSompi) } : null
    },
    warnings: [...result.warnings]
  };

  if (options.json) {
    getOutput().writeJson({ ok: true, command: "tx profile", mode: "cli", result: profile });
    return profile;
  }

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
    "\nNote: Mass estimation is protocol-aware (0.12.0-rc.26 best-effort)."
  );
  return profile;
}
