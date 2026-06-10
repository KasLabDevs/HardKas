import fs from "fs";
import path from "path";

const projectRoot = path.resolve(process.cwd());
const outPath = path.join(projectRoot, "docs", "index.html");

let html = fs.readFileSync(outPath, "utf8");

const newContent = `</div>
</div>
</details>
<details>
<summary>Fork state and test deterministic hashing</summary>
<div class="details-body">
<div class="codeblock">
<div class="codebar">localnet <button class="copy" data-copy="hardkas localnet fork --network testnet-10\\nhardkas tx plan --to qz... --amount 1000\\nhardkas tx sign ./artifacts/plan.json --account dev\\nhardkas verify --strict">Copy</button></div>
<pre><span class="cmd">hardkas</span> localnet fork <span class="flag">--network</span> testnet-10
<span class="cmd">hardkas</span> tx plan <span class="flag">--to</span> qz... <span class="flag">--amount</span> 1000
<span class="cmd">hardkas</span> tx sign ./artifacts/plan.json <span class="flag">--account</span> dev
<span class="cmd">hardkas</span> verify <span class="flag">--strict</span></pre>
</div>
<div class="codeblock" style="margin-top: 8px;">
<div class="codebar">sample output</div>
<pre><span class="comment">Strict verification:</span>
  Sorting:     <span style="color:#72f2c3">byte-level deterministic</span>
  Boundaries:  <span style="color:#72f2c3">enforced (.hardkas/ context)</span>
  Hash match:  <span style="color:#72f2c3">passed</span></pre>
</div>
</div>
</details>
<details>
<summary>Replay causal graph from a crashed workspace</summary>
<div class="details-body">
<div class="codeblock">
<div class="codebar">replay <button class="copy" data-copy="hardkas doctor --json\\nhardkas repair --dry-run\\nhardkas rebuild --from-artifacts\\nhardkas replay verify path --json">Copy</button></div>
<pre><span class="cmd">hardkas</span> doctor <span class="flag">--json</span>
<span class="cmd">hardkas</span> repair <span class="flag">--dry-run</span>
<span class="cmd">hardkas</span> rebuild <span class="flag">--from-artifacts</span>
<span class="cmd">hardkas</span> replay verify path <span class="flag">--json</span></pre>
</div>
<div class="codeblock" style="margin-top: 8px;">
<div class="codebar">sample output</div>
<pre><span class="comment">Rebuild complete:</span>
  Events parsed:  1542
  Artifacts:      128
  Conflicts:      0

<span class="comment">Replay Verification:</span>
  Status:         <span style="color:#72f2c3">VERIFIED</span>
  Causal Graph:   <span style="color:#72f2c3">intact</span></pre>
</div>
</div>
</details>
</div>
</section>`;

// Replace using regex to ignore any weird whitespace issues
const replaced = html.replace(
  /<\/div>\s*<\/div>\s*<\/details>\s*<\/div>\s*<\/section>/,
  newContent
);

if (replaced !== html) {
  fs.writeFileSync(outPath, replaced, "utf8");
  console.log("Successfully added examples using regex");
} else {
  console.log("Failed to find target using regex");
}
