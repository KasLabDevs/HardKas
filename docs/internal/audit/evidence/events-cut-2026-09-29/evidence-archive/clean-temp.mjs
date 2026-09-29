// Removes disposable temp dirs without ever following a link (pnpm junctions are unlinked as
// links, real directories emptied first — the same walk as cut6-events/safe-rm.mjs).
// Targets: the named evidence roots given with --root, and test leftovers directly under the temp
// dir whose name is one of the known mkdtemp prefixes + a 6-character suffix and that were last
// written more than --min-age-hours ago (so nothing a running process is using).
// usage: node clean-temp.mjs <tempDir> [--root <dir>]... [--min-age-hours N] [--dry-run]
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const temp = path.resolve(args[0]);
const roots = [];
let minAgeHours = 2;
let dryRun = false;
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--root") roots.push(path.resolve(args[++i]));
  else if (args[i] === "--min-age-hours") minAgeHours = Number(args[++i]);
  else if (args[i] === "--dry-run") dryRun = true;
}
const LEFTOVER =
  /^(hardkas-(test|scaffold-test|zk-corpus|deprec|hardening-v03|hermetic-home|adversarial-circular|adversarial-cross-network)|hk-(tq-shared-out|tq-shared|tq-runner-shared|tq-runner|tq-receipt|def1c|def13|w1-h|wave1-trace|wave1|wave4-def27|sec1))-[A-Za-z0-9]{6}$/;
const cutoff = Date.now() - minAgeHours * 3600_000;

const counts = { dirsTargeted: 0, links: 0, files: 0, dirs: 0, bytes: 0, errors: 0 };
const errors = [];
function rm(p) {
  let st;
  try {
    st = fs.lstatSync(p);
  } catch (e) {
    counts.errors++;
    errors.push(`${p}: ${e.code}`);
    return;
  }
  try {
    if (st.isSymbolicLink()) {
      if (!dryRun) fs.unlinkSync(p);
      counts.links++;
    } else if (st.isDirectory()) {
      for (const e of fs.readdirSync(p)) rm(path.join(p, e));
      if (!dryRun) fs.rmdirSync(p);
      counts.dirs++;
    } else {
      counts.bytes += st.size;
      if (!dryRun) fs.unlinkSync(p);
      counts.files++;
    }
  } catch (e) {
    counts.errors++;
    errors.push(`${p}: ${e.code}`);
  }
}

const targets = [...roots];
for (const e of fs.readdirSync(temp, { withFileTypes: true })) {
  if (!e.isDirectory() || !LEFTOVER.test(e.name)) continue;
  const p = path.join(temp, e.name);
  if (fs.statSync(p).mtimeMs < cutoff) targets.push(p);
}
for (const t of targets) {
  if (!path.relative(temp, t) || path.relative(temp, t).startsWith("..")) throw new Error(`refusing ${t}: not inside ${temp}`);
  counts.dirsTargeted++;
  rm(t);
}
console.log(JSON.stringify({ dryRun, temp, roots, minAgeHours, ...counts, mb: Math.round(counts.bytes / 1048576), errors: errors.slice(0, 20) }, null, 2));
