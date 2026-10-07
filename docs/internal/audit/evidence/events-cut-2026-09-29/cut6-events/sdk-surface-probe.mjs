// Surface Cut 3a closure probe, run INSIDE an external consumer (cwd = consumer dir):
//  - the packed @hardkas/sdk's exports and a Hardkas instance's members (`events` or not);
//  - the installed sdk's type declarations: any mention of rpc-events / the removed types;
//  - can @hardkas/rpc-events be resolved from the consumer (ESM import) or from the
//    installed sdk's own location (CJS resolve)? Which node_modules directories does Node
//    search from there, and is any of them inside the monorepo? Is NODE_PATH set?
// The Hardkas instance opens a throwaway project in the OS temp dir (simulated default).
// usage: node <this> <repoRoot>   (prints one JSON line)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const repoRoot = path.resolve(process.argv[2]).toLowerCase();
const out = { consumer: process.cwd(), nodePath: process.env.NODE_PATH ?? null };
const inRepo = (p) => path.resolve(p).toLowerCase().startsWith(repoRoot);

const m = await import("@hardkas/sdk");
out.sdkExports = Object.keys(m).sort();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-3a-probe-"));
try {
  const hk = await m.Hardkas.open({ cwd: tmp });
  out.instanceHasEvents = "events" in hk;
  out.instanceMembers = Object.keys(hk).sort();
  out.prototypeMembers = Object.getOwnPropertyNames(Object.getPrototypeOf(hk)).sort();
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const sdkDir = fs.realpathSync(path.join(process.cwd(), "node_modules", "@hardkas", "sdk"));
out.sdkDirInRepo = inRepo(sdkDir);
const dts = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); }
    else if (p.endsWith(".d.ts")) dts.push(p);
  }
})(path.join(sdkDir, "dist"));
out.sdkDtsFiles = dts.length;
out.sdkDtsMentions = dts
  .map((f) => ({ f: path.relative(sdkDir, f), t: fs.readFileSync(f, "utf8") }))
  .filter(({ t }) => /rpc-events|ReactiveEventProvider|readonly events\s*:/.test(t))
  .map(({ f }) => f);

try {
  await import("@hardkas/rpc-events");
  out.importFromConsumer = "RESOLVED";
} catch (e) {
  out.importFromConsumer = e.code ?? String(e.message).slice(0, 120);
}
const req = createRequire(path.join(sdkDir, "package.json"));
try {
  out.resolveFromSdk = req.resolve("@hardkas/rpc-events");
  out.resolveFromSdkInRepo = inRepo(out.resolveFromSdk);
} catch (e) {
  out.resolveFromSdk = e.code ?? String(e.message).slice(0, 120);
}
const searched = req.resolve.paths("@hardkas/rpc-events") ?? [];
out.searchedDirs = searched.length;
out.searchedDirsInRepo = searched.filter(inRepo);
console.log(JSON.stringify(out));
