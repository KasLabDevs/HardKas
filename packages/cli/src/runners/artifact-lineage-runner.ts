import { 
  verifyArtifactIntegrity, 
  verifyLineage 
} from "@hardkas/artifacts";
import { UI } from "../ui.js";
import fs from "node:fs";
import path from "node:path";

export interface ArtifactLineageOptions {
  path: string;
}

export async function runArtifactLineage(options: ArtifactLineageOptions) {
  const absolutePath = path.resolve(process.cwd(), options.path);
  
  if (!fs.existsSync(absolutePath)) {
    UI.error(`File not found: ${options.path}`);
    process.exitCode = 1;
    return;
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

  console.log("═".repeat(60));
  console.log(`Lineage ID:    ${lineage.lineageId}`);
  console.log(`Root Artifact: ${lineage.rootArtifactId}`);
  console.log(`Current ID:    ${lineage.artifactId}`);
  console.log(`Parent ID:     ${lineage.parentArtifactId || "None (Root)"}`);
  if (lineage.sequence !== undefined) {
    console.log(`Sequence:      ${lineage.sequence}`);
  }
  console.log("═".repeat(60));

  // Trace visualization (conceptual)
  console.log("\nPROVENANCE CHAIN:");
  const chain = [];
  if (lineage.rootArtifactId === lineage.artifactId) {
    chain.push(`[ROOT] ${artifact.schema} (${lineage.artifactId.slice(0, 8)}...)`);
  } else {
    chain.push(`[ROOT] ${lineage.rootArtifactId.slice(0, 8)}...`);
    chain.push(`  ↓    (Intermediate Artifacts)`);
    if (lineage.parentArtifactId) {
      chain.push(`  ↓    ${lineage.parentArtifactId.slice(0, 8)}... (Parent)`);
    }
    chain.push(`[HERE] ${artifact.schema} (${lineage.artifactId.slice(0, 8)}...)`);
  }

  chain.forEach(step => console.log(`  ${step}`));

  // Validation
  const result = verifyLineage(artifact);
  if (!result.ok) {
    console.log("\nLineage Violations:");
    result.issues.forEach(i => console.log(`  ✗ [${i.code}] ${i.message}`));
  } else {
    console.log("\n✓ Internal lineage structure is consistent.");
  }

  UI.footer("Operational Provenance Complete");
}
