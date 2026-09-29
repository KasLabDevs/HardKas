// Keeps the minimum evidence of the Surface Cut item 3 packed-consumer proofs before the temp dirs
// are cleaned (reviewer, 2-oct: final JSON reports, before/after results, consumer/tarball
// comparisons). For each %TEMP% evidence root: every top-level file (reports, comparisons, logs,
// probes, statuses), and for each packed set (a subdir with result.json): result.json,
// summary.json and the SHA-256 of every tarball it held (not the tarballs). node_modules, consumer
// projects, tarball extractions and saved working copies are not kept.
// usage: node archive-evidence.mjs <archiveDir> <root>...
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [archive, ...roots] = process.argv.slice(2).map((p) => path.resolve(p));
const report = {};
for (const root of roots) {
  const name = path.basename(root);
  const dest = path.join(archive, name);
  fs.mkdirSync(dest, { recursive: true });
  const r = (report[name] = { files: 0, bytes: 0, sets: {}, skippedDirs: [] });
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, e.name);
    if (e.isFile()) {
      fs.copyFileSync(p, path.join(dest, e.name));
      r.files++;
      r.bytes += fs.statSync(p).size;
    } else if (e.isDirectory() && fs.existsSync(path.join(p, "result.json"))) {
      const setDest = path.join(dest, e.name);
      fs.mkdirSync(setDest, { recursive: true });
      for (const f of ["result.json", "summary.json"]) {
        if (!fs.existsSync(path.join(p, f))) continue;
        fs.copyFileSync(path.join(p, f), path.join(setDest, f));
        r.files++;
        r.bytes += fs.statSync(path.join(p, f)).size;
      }
      const tgzDir = path.join(p, "tarballs");
      const lines = fs.existsSync(tgzDir)
        ? fs.readdirSync(tgzDir).filter((f) => f.endsWith(".tgz")).sort().map((f) => `${crypto.createHash("sha256").update(fs.readFileSync(path.join(tgzDir, f))).digest("hex")}  ${f}`)
        : [];
      fs.writeFileSync(path.join(setDest, "tarballs-sha256.txt"), lines.join("\n") + "\n");
      r.files++;
      r.sets[e.name] = lines.length;
    } else {
      r.skippedDirs.push(e.name);
    }
  }
}
console.log(JSON.stringify(report, null, 2));
