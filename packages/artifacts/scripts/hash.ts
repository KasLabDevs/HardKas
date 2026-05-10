import fs from "node:fs";
import path from "node:path";
import { calculateContentHash } from "../src/canonical.js";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: tsx hash.ts <file>");
  process.exit(1);
}

const content = fs.readFileSync(filePath, "utf8");
const artifact = JSON.parse(content);

const hash = calculateContentHash(artifact);
artifact.contentHash = hash;
if (artifact.lineage) {
  artifact.lineage.artifactId = hash;
}

fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2) + "\n");
console.log(`Updated ${filePath} with hash: ${hash}`);
