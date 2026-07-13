import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const packsDir = path.join(root, "packs");

if (fs.existsSync(packsDir)) {
  fs.rmSync(packsDir, { recursive: true, force: true });
}
fs.mkdirSync(packsDir);

const dirsToScan = [path.join(root, "packages"), path.join(root, "plugins")];
let packedCount = 0;

for (const scanDir of dirsToScan) {
  if (!fs.existsSync(scanDir)) continue;
  
  const entries = fs.readdirSync(scanDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const pkgPath = path.join(scanDir, entry.name);
      if (fs.existsSync(path.join(pkgPath, "package.json"))) {
        console.log(`Packing ${entry.name}...`);
        try {
          // pnpm pack outputs the tgz file in the current directory (pkgPath)
          const output = execSync("pnpm pack", { cwd: pkgPath, encoding: "utf8" });
          
          // Find the generated .tgz file
          const files = fs.readdirSync(pkgPath);
          const tgzFile = files.find(f => f.endsWith(".tgz"));
          
          if (tgzFile) {
            const src = path.join(pkgPath, tgzFile);
            const dest = path.join(packsDir, tgzFile);
            fs.renameSync(src, dest);
            console.log(` -> Saved to packs/${tgzFile}`);
            packedCount++;
          }
        } catch (e: any) {
          console.error(`Failed to pack ${entry.name}:`, e.message);
        }
      }
    }
  }
}

console.log(`\nSuccess! Packed ${packedCount} packages into /packs directory.`);
