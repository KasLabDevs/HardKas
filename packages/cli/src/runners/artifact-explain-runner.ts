import { explainArtifact } from "@hardkas/artifacts";
import { UI } from "../ui.js";
import fs from "node:fs";
import path from "node:path";
import { formatSompi } from "@hardkas/core";

export interface ArtifactExplainOptions {
  path: string;
}

export async function runArtifactExplain(options: ArtifactExplainOptions) {
  const absolutePath = path.resolve(process.cwd(), options.path);
  
  if (!fs.existsSync(absolutePath)) {
    UI.error(`File not found: ${options.path}`);
    process.exitCode = 1;
    return;
  }

  const rawArtifact = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
  const explanation = await explainArtifact(rawArtifact);

  UI.header(`Operational Audit: ${path.basename(options.path)}`);
  
  // 1. Summary Section
  console.log("┌── SUMMARY ───────────────────────────────────────────────────");
  console.log(`│ TYPE:      ${explanation.summary.type.padEnd(48)} │`);
  console.log(`│ VERSION:   ${explanation.summary.version.padEnd(48)} │`);
  console.log(`│ NETWORK:   ${explanation.summary.network.padEnd(48)} │`);
  console.log(`│ MODE:      ${explanation.summary.mode.toUpperCase().padEnd(48)} │`);
  console.log(`│ CREATED:   ${explanation.summary.createdAt.padEnd(48)} │`);
  console.log(`│ STATUS:    ${explanation.summary.status.toUpperCase().padEnd(48)} │`);
  console.log("└──────────────────────────────────────────────────────────────");

  // 2. Identity Section
  console.log("\n[ IDENTITY & LINEAGE ]");
  console.log(`  ArtifactId: ${explanation.identity.artifactId}`);
  console.log(`  Hash:       ${explanation.identity.contentHash}`);
  if (explanation.identity.lineageId) {
    console.log(`  LineageId:  ${explanation.identity.lineageId}`);
    console.log(`  RootId:     ${explanation.identity.rootArtifactId}`);
    console.log(`  ParentId:   ${explanation.identity.parentArtifactId || "None (Root)"}`);
  }

  // 3. Economics Section
  if (explanation.economics) {
    console.log("\n[ ECONOMIC AUDIT ]");
    if (explanation.economics.ok) {
      UI.success("  ✓ Economic invariants verified.");
    } else {
      UI.error("  ✗ Economic invariants VIOLATED.");
    }

    console.log(`\n  Mass:`);
    console.log(`    Reported:   ${explanation.economics.mass.reported}`);
    console.log(`    Recomputed: ${explanation.economics.mass.recomputed}`);
    
    console.log(`\n  Fees:`);
    console.log(`    Reported:   ${formatSompi(explanation.economics.fee.reported)}`);
    console.log(`    Recomputed: ${formatSompi(explanation.economics.fee.recomputed)}`);
    console.log(`    Rate:       ${explanation.economics.fee.rate} sompi/mass`);
    
    if (explanation.economics.fee.delta !== 0n) {
      const delta = explanation.economics.fee.delta;
      const type = delta > 0n ? "Overpaid" : "Underpaid";
      // formatSompi handles the sign, but we might want absolute for delta display with a type suffix
      const absDelta = delta < 0n ? -delta : delta;
      console.log(`    Delta:      ${formatSompi(absDelta)} (${type})`);
    }

    console.log(`\n  Balance Sheet:`);
    console.log(`    Total Inputs:  ${formatSompi(explanation.economics.balance.inputs)}`);
    console.log(`    Total Outputs: ${formatSompi(explanation.economics.balance.outputs)}`);
    if (explanation.economics.balance.change > 0n) {
      console.log(`    Change:        ${formatSompi(explanation.economics.balance.change)}`);
    }
    console.log(`    Implied Fee:   ${formatSompi(explanation.economics.balance.impliedFee)}`);
  }

  // 4. Security Section
  console.log("\n[ SECURITY & INTEGRITY ]");
  if (explanation.security.strictOk) {
    UI.success("  ✓ No critical integrity violations detected.");
  } else {
    UI.error("  ✗ SECUIRTY WARNINGS DETECTED.");
  }

  if (explanation.security.issues.length > 0) {
    explanation.security.issues.forEach(issue => {
      const prefix = issue.severity === "critical" ? "CRITICAL" : issue.severity === "error" ? "ERROR" : "WARNING";
      console.log(`  • [${prefix}] [${issue.code}] ${issue.message}`);
    });
  }

  UI.divider();
}
