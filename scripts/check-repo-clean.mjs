import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const FORBIDDEN_FILES = ["fix-*.js", "*.log"];

const FORBIDDEN_DIRS = [
  ".hardkas",
  "scratch",
  "generated workspaces",
  "_e2e_test",
  "demo-workspace",
  "tx-lifecycle-smoke",
  "generated-apps"
];

let failed = false;

function reportError(msg) {
  console.error(`[HYGIENE ERROR] ${msg}`);
  failed = true;
}

// Check forbidden directories in root
for (const dir of FORBIDDEN_DIRS) {
  const p = path.join(REPO_ROOT, dir);
  if (fs.existsSync(p)) {
    reportError(`Forbidden directory exists: ${dir}`);
  }
}

// Check for .hardkas* wildcards
const rootItems = fs.readdirSync(REPO_ROOT);
for (const item of rootItems) {
  if (item.startsWith(".hardkas")) {
    reportError(`Forbidden .hardkas directory/file exists: ${item}`);
  }
}

// Check forbidden files in root
for (const pattern of FORBIDDEN_FILES) {
  if (pattern.includes("*")) {
    const base = pattern.replace("*", "");
    const prefix = pattern.split("*")[0];
    const suffix = pattern.split("*")[1];

    for (const item of rootItems) {
      if (
        item.startsWith(prefix) &&
        item.endsWith(suffix) &&
        fs.statSync(path.join(REPO_ROOT, item)).isFile()
      ) {
        reportError(`Forbidden file exists: ${item}`);
      }
    }
  } else {
    if (fs.existsSync(path.join(REPO_ROOT, pattern))) {
      reportError(`Forbidden file exists: ${pattern}`);
    }
  }
}

// Check for generated files in src/
const PACKAGES_DIR = path.join(REPO_ROOT, "packages");
if (fs.existsSync(PACKAGES_DIR)) {
  const packages = fs.readdirSync(PACKAGES_DIR);
  for (const pkg of packages) {
    const srcDir = path.join(PACKAGES_DIR, pkg, "src");
    if (fs.existsSync(srcDir)) {
      function checkSrcFiles(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isDirectory()) {
            checkSrcFiles(fullPath);
          } else {
            if (file.endsWith(".js") || file.endsWith(".d.ts") || file.endsWith(".map")) {
              reportError(`Generated file found in src/: ${fullPath}`);
            }
          }
        }
      }
      checkSrcFiles(srcDir);
    }
  }
}

if (failed) {
  console.error("\nRepository hygiene check FAILED. Please clean up the repository.");
  process.exit(1);
} else {
  console.log("Repository hygiene check PASSED.");
}
