import { getOutput } from "../output.js";
import { UI } from "../ui.js";
import fs from "node:fs/promises";
import pc from "picocolors";

export interface TxCompareRunnerInput {
  simulatedPath: string;
  realPath: string;
}

export async function runTxCompare(input: TxCompareRunnerInput): Promise<void> {
  const { simulatedPath, realPath } = input;

  let simRaw, realRaw;
  try {
    simRaw = await fs.readFile(simulatedPath, "utf-8");
  } catch (e) {
    throw new Error(`Failed to read simulated receipt: ${simulatedPath}`);
  }
  try {
    realRaw = await fs.readFile(realPath, "utf-8");
  } catch (e) {
    throw new Error(`Failed to read real receipt: ${realPath}`);
  }

  const sim = JSON.parse(simRaw);
  const real = JSON.parse(realRaw);

  UI.box("Simulation Fidelity", "Comparative Analysis (Phase 9)");
  getOutput().writeLine("");

  const semanticMatches = [
    { name: "Amount (Sompi)", a: sim.amountSompi, b: real.amountSompi },
    { name: "Network Intent", a: sim.networkId, b: real.networkId },
    { name: "Mode", a: sim.mode, b: real.mode },
    {
      name: "Parent Artifact Hash",
      a: sim.lineage?.parentArtifactId,
      b: real.lineage?.parentArtifactId
    },
    {
      name: "Root Artifact Hash",
      a: sim.lineage?.rootArtifactId,
      b: real.lineage?.rootArtifactId
    }
  ];

  let matchesFail = false;
  getOutput().writeLine(pc.bold("  Semantic Matches (Must Match)"));
  for (const item of semanticMatches) {
    if (item.a === item.b) {
      getOutput().writeLine(`  ${pc.green("âœ“")} ${item.name.padEnd(25)} : ${item.a}`);
    } else {
      getOutput().writeLine(
        `  ${pc.red("âœ—")} ${item.name.padEnd(25)} : SIM: ${item.a}  |  REAL: ${item.b}`
      );
      matchesFail = true;
    }
  }

  getOutput().writeLine("");
  getOutput().writeLine(pc.bold("  Expected Deltas (May Differ)"));

  const deltas = [
    { name: "TxId", a: sim.txId, b: real.txId },
    {
      name: "Mass",
      a: sim.metadata?.mass || sim.mass,
      b: real.metadata?.mass || real.mass
    },
    {
      name: "Fees",
      a: sim.metadata?.fees || sim.fees,
      b: real.metadata?.fees || real.fees
    }
  ];

  for (const item of deltas) {
    const isSame = item.a === item.b;
    const color = isSame ? pc.green : pc.yellow;
    getOutput().writeLine(
      `  ${color("Î”")} ${item.name.padEnd(25)} : SIM: ${item.a || "N/A"}  |  REAL: ${item.b || "N/A"}`
    );
  }

  getOutput().writeLine("");
  if (matchesFail) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("FIDELITY_FAIL", "Simulation Fidelity: FAIL", {
      exitCode: 1
    });
  } else {
    UI.logHuman(`  âœ… Simulation Fidelity: DELTA_ACCEPTABLE`);
  }
}
