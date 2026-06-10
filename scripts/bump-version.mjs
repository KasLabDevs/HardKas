import fs from "node:fs";
import path from "node:path";

const ignoreDirs = new Set([
  "node_modules",
  "dist",
  ".git",
  ".pnpm-store",
  ".turbo",
  "build"
]);

const ignoreExtensions = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
  ".pack", ".idx", ".log", ".DS_Store", ".db", ".lock"
]);

const SEARCH = "0.9.1-alpha";
const REPLACE = "0.9.1-alpha";

let replacedCount = 0;

function walkAndReplace(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoreDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkAndReplace(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (ignoreExtensions.has(ext)) continue;
      
      try {
        const content = fs.readFileSync(fullPath, "utf8");
        if (content.includes(SEARCH)) {
          const newContent = content.replaceAll(SEARCH, REPLACE);
          fs.writeFileSync(fullPath, newContent, "utf8");
          console.log(`Updated: ${fullPath}`);
          replacedCount++;
        }
      } catch (e) {
        // console.error(`Failed to read/write ${fullPath}`, e);
      }
    }
  }
}

walkAndReplace(process.cwd());
console.log(`\nReplaced version in ${replacedCount} files.`);
