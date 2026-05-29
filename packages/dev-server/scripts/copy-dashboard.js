import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, "../../../apps/dashboard/dist");
const destDir = path.resolve(__dirname, "../dashboard");

if (!fs.existsSync(srcDir)) {
  console.warn(
    "⚠️ Warning: Dashboard build not found at " +
      srcDir +
      ". Run 'pnpm build' in apps/dashboard first."
  );
  process.exit(0);
}

// Clean and create destination directory
fs.rmSync(destDir, { recursive: true, force: true });
fs.mkdirSync(destDir, { recursive: true });

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

copyRecursive(srcDir, destDir);
console.log("✅ Dashboard bundled successfully into dev-server/dashboard!");
