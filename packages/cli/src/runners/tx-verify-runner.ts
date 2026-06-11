import { getOutput } from "../output.js";
import { readTxPlanArtifact, verifyArtifactIntegrity } from "@hardkas/artifacts";
import {
  verifyTxPlanSemantics,
  SemanticVerificationIssue,
  TxPlan
} from "@hardkas/tx-builder";
import { UI } from "../ui.js";
import { formatSompiToKas } from "@hardkas/core";
import path from "node:path";

export interface TxVerifyOptions {
  path: string;
  workspaceRoot: string;
  json?: boolean;
}

export async function runTxVerify(options: TxVerifyOptions) {
  if (options.json) UI.setJsonMode(true);
  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
  const absolutePath = sdk.workspace.resolvePath(options.path);

  UI.header(`Transaction Verification: ${path.basename(options.path)}`);

  try {
    const artifact = await readTxPlanArtifact(absolutePath);

    // 1. Integrity Check (Hardening)
    const integrityResult = await verifyArtifactIntegrity(absolutePath);
    if (!integrityResult.ok) {
      integrityResult.issues.forEach((issue) => {
        getOutput().writeLine(`  [!] [${issue.code}] ${issue.message}`);
      });
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("INTEGRITY_FAILED", "INTEGRITY VERIFICATION FAILED", {
        exitCode: 1
      });
    }

    // 2. Perform semantic verification
    const artifactRecord = artifact as Record<string, unknown>;

    let result;
    if (artifact.mode === "simulated") {
      result = {
        ok: true,
        inputTotalSompi: BigInt(artifact.amountSompi || 0),
        outputTotalSompi: BigInt(artifact.amountSompi || 0),
        changeAmountSompi: 0n,
        recomputedFeeSompi: 0n,
        recomputedMass: 0n,
        issues: []
      };
    } else {
      if (
        !artifactRecord["inputs"] ||
        !Array.isArray(artifactRecord["inputs"]) ||
        !artifactRecord["outputs"] ||
        !Array.isArray(artifactRecord["outputs"])
      ) {
        throw new Error("Invalid artifact: missing or invalid inputs/outputs arrays");
      }
      result = verifyTxPlanSemantics(artifact as unknown as TxPlan);
    }

    if (options.json) {
      UI.writeJson(result);
      return result;
    }

    // Display Results
    getOutput().writeLine(`Plan ID:      ${artifact.planId}`);
    getOutput().writeLine(`Network:      ${artifact.networkId}`);
    getOutput().writeLine(`Mode:         ${artifact.mode}`);
    getOutput().writeLine("");

    getOutput().writeLine("Economic Audit:");
    getOutput().writeLine(`  Inputs:     ${formatSompiToKas(result.inputTotalSompi)}`);
    getOutput().writeLine(`  Outputs:    ${formatSompiToKas(result.outputTotalSompi)}`);
    getOutput().writeLine(`  Change:     ${formatSompiToKas(result.changeAmountSompi)}`);
    getOutput().writeLine(`  Fee (calc): ${formatSompiToKas(result.recomputedFeeSompi)}`);
    getOutput().writeLine(`  Mass:       ${result.recomputedMass}`);
    getOutput().writeLine("");

    if (result.issues.length > 0) {
      getOutput().writeLine("Issues Found:");
      result.issues.forEach((issue) => {
        const prefix = getSeverityPrefix(issue.severity);
        getOutput().writeLine(`  ${prefix} [${issue.code}] ${issue.message}`);
        if (issue.path) getOutput().writeLine(`      Path: ${issue.path}`);
      });
      getOutput().writeLine("");
    }

    if (result.ok) {
      UI.success("SEMANTIC VERIFICATION PASSED");
      UI.printNextSteps([
        `hardkas dev tx sign ${artifact.planId}`,
        `hardkas why ${artifact.planId}`
      ]);
    } else {
      UI.printNextSteps([`hardkas why ${artifact.planId}`]);
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError(
        "SEMANTIC_VERIFICATION_FAILED",
        "SEMANTIC VERIFICATION FAILED",
        { exitCode: 1 }
      );
    }

    return result;
  } catch (e: unknown) {
    if (((e as any).name) === "HardkasCliError") throw e;
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("VERIFICATION_ERROR", `Verification error: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`, {
      exitCode: 1,
      cause: e
    });
  }
}

function getSeverityPrefix(severity: string): string {
  switch (severity) {
    case "critical":
      return "[!!!]";
    case "error":
      return "[!]  ";
    case "warning":
      return "[?]  ";
    default:
      return "[i]  ";
  }
}
