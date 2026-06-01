import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(process.cwd());
const outPath = path.join(projectRoot, 'docs', 'index.html');

let html = fs.readFileSync(outPath, 'utf8');

const newExample = `</details>
<details>
<summary>SQLite query store diagnostics and event tracing</summary>
<div class="details-body">
<div class="codeblock">
<div class="codebar">query store <button class="copy" data-copy="hardkas query store doctor --migrate\\nhardkas query events --domain tx --limit 10\\nhardkas query tx 0xa1b2... --explain full">Copy</button></div>
<pre><span class="cmd">hardkas</span> query store doctor <span class="flag">--migrate</span>
<span class="cmd">hardkas</span> query events <span class="flag">--domain</span> tx <span class="flag">--limit</span> 10
<span class="cmd">hardkas</span> query tx 0xa1b2... <span class="flag">--explain</span> full</pre>
</div>
<div class="codeblock" style="margin-top: 8px;">
<div class="codebar">sample output</div>
<pre><span class="comment">Store Doctor:</span>
  Migrations:  <span style="color:#72f2c3">up to date</span>
  Schema:      v4
  Health:      <span style="color:#72f2c3">passed</span>

<span class="comment">Tx Explain:</span>
  TxId:       0xa1b2...
  Domain:     tx
  Events:     [PlanCreated, Signed, Broadcast, ReceiptObserved]
  Lineage:    Plan → Signature → RPC
  Replay:     <span style="color:#72f2c3">Deterministic match</span></pre>
</div>
</div>
</details>
</div>
</section>`;

// Target string is the end of the examples section:
// We look for the closing of the last details block, then the closing div and section
const targetRegex = /<\/details>\s*<\/div>\s*<\/section>\s*<section id="faq">/;
const replacement = newExample + '\n<section id="faq">';

if (targetRegex.test(html)) {
    const replaced = html.replace(targetRegex, replacement);
    fs.writeFileSync(outPath, replaced, 'utf8');
    console.log('Successfully added query store example');
} else {
    console.log('Failed to find target using regex');
}
