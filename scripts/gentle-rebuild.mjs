import fs from "fs";
import path from "path";

const projectRoot = path.resolve(process.cwd());
const templatePath = path.join(projectRoot, "plantilla-docs.html");
const outPath = path.join(projectRoot, "docs", "index.html");

let html = fs.readFileSync(templatePath, "utf8");

// 1. Update versions
html = html.replace(/0\.6\.1-alpha/g, "0.7.9-alpha");

// 2. Update the Hero Warning to reflect the new 0.7.9 invariants without deleting the rest of the text
html = html.replace(
  /<strong>Alpha boundary\.<\/strong> HardKAS is currently in alpha\..*?<\/div>/,
  "<strong>Alpha boundary (0.7.9).</strong> HardKAS is currently in alpha. <strong>Runtime Invariants Updated:</strong> Strict deterministic sorting (byte-level, no localeCompare) and rigid path traversal boundaries are now enforced across the workspace.</div>"
);

// 3. Update the quickstart to use local dependencies instead of global
html = html.replace(
  /pnpm add -g @hardkas\/cli@alpha/g,
  "pnpm add -D @hardkas/cli\npnpm add @hardkas/sdk"
);

// 4. Update the L2 Tx Build command which was replaced by sdk.tx.plan / hardkas tx plan
html = html.replace(
  /hardkas l2 tx build --to kaspatest:qz7... --amount 50000000 --json/g,
  "hardkas tx plan --to kaspatest:qz7... --amount 50000000 --json"
);

// 5. Update old references to "localeCompare" to reflect the new byte-level deterministic sorting
html = html.replace(
  /sorted alphabetically using localeCompare/g,
  "sorted deterministically using strict byte-level comparison (localeCompare is strictly forbidden)"
);
html = html.replace(/localeCompare/g, "byte-level comparison");

// 6. Add path traversal boundary warnings where artifacts are discussed
html = html.replace(
  /<h3>Artifact engine<\/h3>/,
  '<h3>Artifact engine</h3>\n<div class="warning" style="margin-top:10px;font-size:0.85em;"><strong>Security:</strong> Strict path traversal boundaries prevent reading/writing outside the <code>.hardkas/</code> workspace.</div>'
);

// Write back the FULL 3145 line HTML file with all the deep architectural information preserved
fs.writeFileSync(outPath, html, "utf8");
console.log(
  "Successfully restored full architectural documentation and updated invariants to 0.7.9."
);
