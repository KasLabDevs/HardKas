import fs from "node:fs";
import path from "node:path";
import url from "node:url";

console.log("=== API Check ===");
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const requiredFiles = [
  "PUBLIC_API_SURFACE.md",
  "EXPERIMENTAL_SURFACE.md",
  "DEPRECATED_SURFACE.md",
  "MIGRATION_GUIDE_0_9_TO_0_10.md",
  "API_FREEZE_0_10.md"
];

let allGood = true;
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(repoRoot, file))) {
    console.error("Missing " + file);
    allGood = false;
  }
}

if (!allGood) {
  process.exit(1);
}
console.log("API check passed. Surfaces are documented.");
