// Removes a directory tree without ever following a link: pnpm's node_modules holds
// junctions into other workspace packages and the root store, and a remover that
// descended into them would delete their targets. Links are unlinked as links
// (libuv opens them with FILE_FLAG_OPEN_REPARSE_POINT), real directories are emptied
// first. usage: node safe-rm.mjs <dir>
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2]);
const counts = { links: 0, files: 0, dirs: 0 };
const links = [];
function rm(p) {
  const st = fs.lstatSync(p);
  if (st.isSymbolicLink()) {
    links.push(`${path.relative(root, p)} -> ${fs.readlinkSync(p)}`);
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
console.log(JSON.stringify({ removed: root, ...counts, links }, null, 2));
