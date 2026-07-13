import fs from "node:fs";
import path from "node:path";
import { calculateContentHash } from "../packages/artifacts/src/index.js";

const goldenDir = path.join(process.cwd(), "packages/artifacts/test/fixtures/golden");
const files = fs.readdirSync(goldenDir);

for (const file of files) {
  if (!file.endsWith(".json")) continue;
  const filePath = path.join(goldenDir, file);
  const content = JSON.parse(fs.readFileSync(filePath, "utf8"));

  // Fix age
  content.createdAt = new Date().toISOString();

  // Fix mass/fee if tx-plan
  if (content.schema === "hardkas.txPlan") {
    content.estimatedMass = "500";
    content.estimatedFeeSompi = "500";
  }

  // Calculate hash first for lineage
  const tempHash = calculateContentHash(content);
  
  if (content.lineage) {
    content.lineage.artifactId = tempHash;
  }

  // Recalculate hash with updated lineage
  delete content.contentHash;
  content.contentHash = calculateContentHash(content);

  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  console.log(`Fixed ${file}`);
}
