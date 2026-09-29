// safe-rm.mjs (cut6-events) for a whole worktree: removes a tree without ever following a link
// (pnpm junctions are unlinked as links, real directories emptied first), but only counts the
// links and reports those whose target lies outside the tree instead of printing every one.
// usage: node safe-rm-quiet.mjs <dir>
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2]);
const counts = { links: 0, files: 0, dirs: 0 };
const outside = [];
function rm(p) {
  const st = fs.lstatSync(p);
  if (st.isSymbolicLink()) {
    const target = path.resolve(path.dirname(p), fs.readlinkSync(p));
    if (path.relative(root, target).startsWith("..")) outside.push(`${path.relative(root, p)} -> ${target}`);
    fs.unlinkSync(p);
    counts.links++;
  } else if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) rm(path.join(p, e));
    fs.rmdirSync(p);
    counts.dirs++;
  } else {
    fs.unlinkSync(p);
    counts.files++;
  }
}
rm(root);
console.log(JSON.stringify({ removed: root, ...counts, linksOutsideTree: outside.length, sampleOutside: outside.slice(0, 10) }, null, 2));
