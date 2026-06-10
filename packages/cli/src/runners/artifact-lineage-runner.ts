import { verifyArtifactIntegrity, verifyLineage } from "@hardkas/artifacts";
import { UI } from "../ui.js";
import fs from "node:fs";
import path from "node:path";

export interface ArtifactLineageOptions {
  path: string;
  workspaceRoot: string;
}

export async function runArtifactLineage(options: ArtifactLineageOptions) {
  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
  const absolutePath = sdk.workspace.resolvePath(options.path);

  if (!fs.existsSync(absolutePath)) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("FILE_NOT_FOUND", `File not found: ${options.path}`, {
      exitCode: 1
    });
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const artifact = JSON.parse(content);

  UI.header(`Artifact Lineage: ${path.basename(options.path)}`);

  const lineage = artifact.lineage;
  if (!lineage) {
    UI.warning("No lineage metadata found in this artifact.");
    UI.info("Artifact is an 'orphan' (Provenance cannot be verified).");
    return;
  }

  console.log("â•".repeat(60));
  console.log(`Lineage ID:    ${lineage.lineageId}`);
  console.log(`Root Artifact: ${lineage.rootArtifactId}`);
  console.log(`Current ID:    ${lineage.artifactId}`);
  console.log(`Parent ID:     ${lineage.parentArtifactId || "None (Root)"}`);
  if (lineage.sequence !== undefined) {
    console.log(`Sequence:      ${lineage.sequence}`);
  }
  console.log("â•".repeat(60));

  // Trace visualization (conceptual)
  console.log("\nPROVENANCE CHAIN:");
  const chain = [];
  if (lineage.rootArtifactId === lineage.artifactId) {
    chain.push(`[ROOT] ${artifact.schema} (${lineage.artifactId.slice(0, 8)}...)`);
  } else {
    chain.push(`[ROOT] ${lineage.rootArtifactId.slice(0, 8)}...`);
    chain.push(`  â†“    (Intermediate Artifacts)`);
    if (lineage.parentArtifactId) {
      chain.push(`  â†“    ${lineage.parentArtifactId.slice(0, 8)}... (Parent)`);
    }
    chain.push(`[HERE] ${artifact.schema} (${lineage.artifactId.slice(0, 8)}...)`);
  }

  chain.forEach((step) => console.log(`  ${step}`));

  // Validation
  let failed = false;
  const result = verifyLineage(artifact);
  if (!result.ok) {
    console.log("\nLineage Violations:");
    result.issues.forEach((i) => {
      const prefix = i.severity === "error" ? "âœ—" : "âš ";
      console.log(`  ${prefix} [${i.code}] ${i.message}`);
    });
    failed = true;
  } else {
    console.log("\nâœ“ Internal lineage structure is consistent.");
  }

  UI.footer("Operational Provenance Complete");

  if (failed) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "LINEAGE_VIOLATIONS",
      "Lineage structure is inconsistent.",
      { exitCode: 1 }
    );
  }
}
