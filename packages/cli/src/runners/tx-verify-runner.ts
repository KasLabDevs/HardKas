import { readTxPlanArtifact } from "@hardkas/artifacts";
import { verifyTxPlanSemantics, SemanticVerificationIssue } from "@hardkas/tx-builder";
import { UI } from "../ui.js";
import { formatSompi } from "@hardkas/core";
import path from "node:path";

export interface TxVerifyOptions {
  path: string;
  json?: boolean;
}

export async function runTxVerify(options: TxVerifyOptions) {
  const absolutePath = path.resolve(process.cwd(), options.path);
  
  UI.header(`Transaction Verification: ${path.basename(options.path)}`);

  try {
    const artifact = await readTxPlanArtifact(absolutePath);
    
    // Perform semantic verification
    const result = verifyTxPlanSemantics(artifact as any);

    if (options.json) {
      console.log(JSON.stringify(result, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value, 2));
      return result;
    }

    // Display Results
    console.log(`Plan ID:      ${artifact.planId}`);
    console.log(`Network:      ${artifact.networkId}`);
    console.log(`Mode:         ${artifact.mode}`);
    console.log("");
    
    console.log("Economic Audit:");
    console.log(`  Inputs:     ${formatSompi(result.inputTotalSompi)}`);
    console.log(`  Outputs:    ${formatSompi(result.outputTotalSompi)}`);
    console.log(`  Change:     ${formatSompi(result.changeAmountSompi)}`);
    console.log(`  Fee (calc): ${formatSompi(result.recomputedFeeSompi)}`);
    console.log(`  Mass:       ${result.recomputedMass}`);
    console.log("");

    if (result.issues.length > 0) {
      console.log("Issues Found:");
      result.issues.forEach(issue => {
        const prefix = getSeverityPrefix(issue.severity);
        console.log(`  ${prefix} [${issue.code}] ${issue.message}`);
        if (issue.path) console.log(`      Path: ${issue.path}`);
      });
      console.log("");
    }

    if (result.ok) {
      UI.success("SEMANTIC VERIFICATION PASSED");
    } else {
      UI.error("SEMANTIC VERIFICATION FAILED");
      process.exitCode = 1;
    }

    return result;
  } catch (e: any) {
    UI.error(`Verification error: ${e.message}`);
    process.exitCode = 1;
  }
}

function getSeverityPrefix(severity: string): string {
  switch (severity) {
    case "critical": return "[!!!]";
    case "error":    return "[!]  ";
    case "warning":  return "[?]  ";
    default:         return "[i]  ";
  }
}
