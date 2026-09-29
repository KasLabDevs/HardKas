// Surface Cut 3a closure: does any published package still require or carry
// @hardkas/rpc-events? For every tarball of a packed set (packed-smoke.mjs label dir):
// the packed manifest's dependency sections, then every file inside the tarball
// (dist js, d.ts, maps, binaries) searched for the package name and the removed types.
// Extraction goes to a temp dir outside the repository. usage: node tarball-scan.mjs <labelDir> <extractDir>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [labelDir, extractBase] = process.argv.slice(2).map((a) => path.resolve(a));
const packed = JSON.parse(fs.readFileSync(path.join(labelDir, "result.json"), "utf8"));
const NEEDLES = ["@hardkas/rpc-events", "rpc-events", "ReactiveEventProvider", "DefaultReactiveEventProvider", "KaspaRpcTransportAdapter"];
fs.rmSync(extractBase, { recursive: true, force: true });
fs.mkdirSync(extractBase, { recursive: true });

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const report = { labelDir, packages: packed.packs.length, rpcEventsTarball: false, manifestHits: [], fileHits: [], filesScanned: 0 };
for (const p of packed.packs) {
  if (p.name === "@hardkas/rpc-events") report.rpcEventsTarball = true;
  const manifest = JSON.parse(execFileSync("tar", ["-xzOf", p.tarball, "package/package.json"], { encoding: "utf8" }));
  for (const section of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies", "bundleDependencies", "bundledDependencies"]) {
    const deps = manifest[section];
    const names = Array.isArray(deps) ? deps : Object.keys(deps ?? {});
    if (names.includes("@hardkas/rpc-events")) report.manifestHits.push(`${p.name} ${section}`);
  }
  const dir = path.join(extractBase, p.name.replace("/", "__"));
  fs.mkdirSync(dir);
  execFileSync("tar", ["-xzf", p.tarball, "-C", dir]);
  for (const file of walk(dir)) {
    report.filesScanned++;
    const text = fs.readFileSync(file).toString("latin1");
    const found = NEEDLES.filter((n) => text.includes(n));
    // "rpc-events" alone is reported only when the longer names did not already match.
    const specific = found.filter((n) => n !== "rpc-events");
    if (specific.length || found.includes("rpc-events")) {
      report.fileHits.push({ package: p.name, file: path.relative(dir, file).split(path.sep).join("/"), found });
    }
  }
}
report.clean = !report.rpcEventsTarball && report.manifestHits.length === 0 && report.fileHits.length === 0;
console.log(JSON.stringify(report, null, 2));
