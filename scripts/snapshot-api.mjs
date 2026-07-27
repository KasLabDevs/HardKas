import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const packagesDir = path.resolve(__dirname, "../packages");

async function snapshot() {
  const pkgs = fs.readdirSync(packagesDir).filter(p => fs.statSync(path.join(packagesDir, p)).isDirectory());
  const snapshotData = {};

  for (const pkg of pkgs) {
    const pkgJsonPath = path.join(packagesDir, pkg, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;
    if (pkg === "cli") continue; // Skip CLI to avoid commander side effects
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    const mainFile = pkgJson.main || pkgJson.exports?.["."]?.import || pkgJson.exports?.["."]?.default;
    if (!mainFile) continue;

    try {
      const modulePath = path.join(packagesDir, pkg, mainFile);
      if (!fs.existsSync(modulePath)) continue;
      
      const imported = await import(url.pathToFileURL(modulePath).href);
      snapshotData[pkgJson.name] = Object.keys(imported).sort();
    } catch (e) {
      console.error(`Failed to import ${pkgJson.name}:`, e.message);
    }
  }

  return snapshotData;
}

snapshot().then(data => {
  const outPath = process.argv[2] || "PUBLIC_API_SNAPSHOT.json";
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Snapshot written to ${outPath}`);
});
