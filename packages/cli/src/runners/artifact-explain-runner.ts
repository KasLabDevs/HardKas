import { explainArtifact } from "@hardkas/artifacts";
import { UI } from "../ui.js";
import fs from "node:fs";
import path from "node:path";
import { formatSompiToKas, formatSignedSompiToKas } from "@hardkas/core";

export interface ArtifactExplainOptions {
  path: string;
  workspaceRoot: string;
}

export async function runArtifactExplain(options: {
  path: string;
  workspaceRoot: string;
}) {
  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
  const absolutePath = sdk.workspace.resolvePath(options.path);

  if (!fs.existsSync(absolutePath)) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("FILE_NOT_FOUND", `File not found: ${options.path}`, {
      exitCode: 1
    });
  }

  const rawArtifact = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
  const explanation = await explainArtifact(rawArtifact);

  UI.header(`Operational Audit: ${path.basename(options.path)}`);

  // 1. Summary Section
  console.log(
    "â”Œâ”€â”€ SUMMARY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€"
  );
  console.log(`â”‚ TYPE:      ${explanation.summary.type.padEnd(48)} â”‚`);
  console.log(`â”‚ VERSION:   ${explanation.summary.version.padEnd(48)} â”‚`);
  console.log(`â”‚ NETWORK:   ${explanation.summary.network.padEnd(48)} â”‚`);
  console.log(`â”‚ MODE:      ${explanation.summary.mode.toUpperCase().padEnd(48)} â”‚`);
  console.log(`â”‚ CREATED:   ${explanation.summary.createdAt.padEnd(48)} â”‚`);
  console.log(
    `â”‚ STATUS:    ${explanation.summary.status.toUpperCase().padEnd(48)} â”‚`
  );
  console.log(
    "â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€"
  );

  // 2. Identity Section
  console.log("\n[ IDENTITY & LINEAGE ]");
  console.log(`  ArtifactId: ${explanation.identity.artifactId}`);
  console.log(`  Hash:       ${explanation.identity.contentHash}`);
  if (explanation.identity.lineageId) {
    console.log(`  LineageId:  ${explanation.identity.lineageId}`);
    console.log(`  RootId:     ${explanation.identity.rootArtifactId}`);
    console.log(
      `  ParentId:   ${explanation.identity.parentArtifactId || "None (Root)"}`
    );
  }

  // 3. Economics Section
  if (explanation.economics) {
    console.log("\n[ ECONOMIC AUDIT ]");
    if (explanation.economics.ok) {
      UI.success("  âœ“ Economic invariants verified.");
    } else {
      UI.error("  âœ— Economic invariants VIOLATED.");
    }

    console.log(`\n  Mass:`);
    console.log(`    Reported:   ${explanation.economics.mass.reported}`);
    console.log(`    Recomputed: ${explanation.economics.mass.recomputed}`);

    console.log(`\n  Fees:`);
    console.log(
      `    Reported:   ${formatSompiToKas(explanation.economics.fee.reported)}`
    );
    console.log(
      `    Recomputed: ${formatSompiToKas(explanation.economics.fee.recomputed)}`
    );
    console.log(`    Rate:       ${explanation.economics.fee.rate} sompi/mass`);

    if (explanation.economics.fee.delta !== 0n) {
      const delta = explanation.economics.fee.delta;
      const type = delta > 0n ? "Overpaid" : "Underpaid";
      // formatSompiToKas handles the sign, but we might want absolute for delta display with a type suffix
      const absDelta = delta < 0n ? -delta : delta;
      console.log(`    Delta:      ${formatSompiToKas(absDelta)} (${type})`);
    }

    console.log(`\n  Balance Sheet:`);
    console.log(
      `    Total Inputs:  ${formatSignedSompiToKas(explanation.economics.balance.inputs)}`
    );
    console.log(
      `    Total Outputs: ${formatSignedSompiToKas(explanation.economics.balance.outputs)}`
    );
    if (explanation.economics.balance.change > 0n) {
      console.log(
        `    Change:        ${formatSignedSompiToKas(explanation.economics.balance.change)}`
      );
    }
    console.log(
      `    Implied Fee:   ${formatSignedSompiToKas(explanation.economics.balance.impliedFee)}`
    );
  }

  // 4. Security Section
  console.log("\n[ SECURITY & INTEGRITY ]");
  if (explanation.security.strictOk) {
    UI.success("  âœ“ No critical integrity violations detected.");
  } else {
    const hasErrors = explanation.security.issues.some(
      (i: any) => i.severity === "critical" || i.severity === "error"
    );
    if (hasErrors) {
      UI.error("  âœ— SECURITY WARNINGS DETECTED.");
      // Will throw at the end of the function to preserve cleanup/output
    } else {
      UI.warning("  âš  SECURITY WARNINGS DETECTED.");
    }
  }

  if (explanation.security.issues.length > 0) {
    explanation.security.issues.forEach((issue) => {
      const prefix =
        issue.severity === "critical"
          ? "CRITICAL"
          : issue.severity === "error"
            ? "ERROR"
            : "WARNING";
      console.log(`  â€¢ [${prefix}] [${issue.code}] ${issue.message}`);
    });
  }

  UI.divider();

  if (explanation.security && !explanation.security.strictOk) {
    const hasErrors = explanation.security.issues.some(
      (i: any) => i.severity === "critical" || i.severity === "error"
    );
    if (hasErrors) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("SECURITY_WARNINGS", "Security warnings detected.", {
        exitCode: 1
      });
    }
  }
}
