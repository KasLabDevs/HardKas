import fs from "fs";
import path from "path";

const projectRoot = path.resolve(process.cwd());
const templatePath = path.join(projectRoot, "plantilla-docs.html");
const outPath = path.join(projectRoot, "docs", "index.html");

const templateContent = fs.readFileSync(templatePath, "utf8");

// The body starts around line 2119. The <main> starts around 2185.
// We will slice the file up to `<aside class="left side">` and inject our own new structure.

const splitIndex = templateContent.indexOf('<aside class="left side">');
if (splitIndex === -1) {
  console.error("Could not find <aside class='left side'> in template");
  process.exit(1);
}

const headerPart = templateContent.substring(0, splitIndex);

const leftNav = `
<aside class="left side">
<div class="side-title">HardKAS 0.7.9</div>
<a href="#overview">Overview</a>
<a href="#quickstart">Quickstart</a>
<a href="#cli">CLI Reference</a>
<a href="#sdk">SDK Reference</a>
<a href="#artifacts">Artifacts Guide</a>
<a href="#localdev">Local Development</a>
<a href="#testing">Testing & CI</a>
<a href="#runtime">Runtime Contract</a>
</aside>
`;

const mainPart = `
<main>
<section class="header" id="overview">
<div class="hero-shell">
<div class="hero-copy">
<div class="hero-kicker">HardKAS 0.7.9-alpha</div>
<h1>HardKAS Documentation</h1>
<p class="subtitle">HardKAS is a local-first, deterministic runtime and SDK for building and testing Kaspa dApps. It manages isolated workspaces, enforces strict semantic invariants, and produces verifiable artifacts for every transaction.</p>
<div class="actions">
<a class="button primary" href="#quickstart">Quickstart</a>
<a class="button" href="#cli">CLI Reference</a>
<a class="button" href="https://github.com/KasLabDevs/HardKas" rel="noreferrer" target="_blank">GitHub</a>
</div>
<div class="meta">
<span class="badge accent">0.7.9-alpha</span>
<span class="badge">Deterministic</span>
<span class="badge">Local-first</span>
<span class="badge">Artifact-driven</span>
</div>
<div class="warning"><strong>Runtime Invariants Updated:</strong> Strict deterministic sorting (no localeCompare) and rigid path traversal boundaries are now enforced across the workspace.</div>
</div>
</div>
</section>

<section id="quickstart">
<h2>1. Quickstart</h2>
<p>Build, test, and verify a simple transaction workflow in 5 minutes.</p>
<div class="grid cols-2">
<div class="box">
<h3>Initialize a Workspace</h3>
<div class="codeblock">
<div class="codebar">setup <button class="copy" data-copy="mkdir my-dapp && cd my-dapp
pnpm init
pnpm add @hardkas/sdk
pnpm add -D @hardkas/cli
pnpm hardkas init">Copy</button></div>
<pre><span class="cmd">mkdir</span> my-dapp && <span class="cmd">cd</span> my-dapp
<span class="cmd">pnpm</span> init
<span class="cmd">pnpm</span> add @hardkas/sdk
<span class="cmd">pnpm</span> add -D @hardkas/cli
<span class="cmd">pnpm</span> hardkas init</pre>
</div>
</div>
<div class="box">
<h3>Start the Localnet</h3>
<div class="codeblock">
<div class="codebar">localnet <button class="copy" data-copy="pnpm hardkas localnet start --background
pnpm hardkas verify --strict">Copy</button></div>
<pre><span class="cmd">pnpm</span> hardkas localnet start <span class="flag">--background</span>
<span class="cmd">pnpm</span> hardkas verify <span class="flag">--strict</span></pre>
</div>
<p>State is deterministically saved to <code>.hardkas/localnet.json</code>.</p>
</div>
</div>
</section>

<section id="cli">
<h2>2. CLI Reference</h2>
<p>The primary interface for workspace management, testing, and debugging.</p>
<table>
<thead><tr><th>Command</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>hardkas init</code></td><td>Bootstraps a new workspace.</td></tr>
<tr><td><code>hardkas verify --strict</code></td><td>Cryptographically verifies lineage and integrity of all artifacts.</td></tr>
<tr><td><code>hardkas localnet start</code></td><td>Starts the simulator.</td></tr>
<tr><td><code>hardkas localnet fork --network testnet-10</code></td><td>Forks the state from a real network.</td></tr>
<tr><td><code>hardkas artifact inspect &lt;id&gt;</code></td><td>Outputs raw JSON of an artifact by its deterministic ID.</td></tr>
<tr><td><code>hardkas rebuild --from-artifacts</code></td><td>Rebuilds SQLite projection purely from canonical filesystem artifacts.</td></tr>
</tbody>
</table>
</section>

<section id="sdk">
<h2>3. SDK Reference</h2>
<p>Programmatic access to the HardKAS runtime for deterministic workflows.</p>
<div class="box">
<h3>Transaction Lifecycle (<code>sdk.tx</code>)</h3>
<ul>
<li><code>tx.plan(options)</code>: Generates an <code>UnsignedTxArtifact</code>.</li>
<li><code>tx.sign(planArtifact, credentials)</code>: Deterministically signs a plan, producing a <code>SignedTxArtifact</code>.</li>
<li><code>tx.broadcast(signedArtifact)</code>: Submits the transaction and generates a <code>BroadcastReceiptArtifact</code>.</li>
</ul>
</div>
<div class="warning"><strong>Path Traversal Protection:</strong> <code>sdk.artifacts.read(path)</code> resolves absolute paths and verifies they are prefixed with the workspace root to prevent escaping boundaries.</div>
</section>

<section id="artifacts">
<h2>4. Artifacts Guide</h2>
<p>Everything in a HardKAS workspace is recorded as a cryptographically verifiable JSON artifact.</p>
<div class="codeblock">
<div class="codebar">workspace layout</div>
<pre>
.hardkas/
├── artifacts/       <span class="comment"># Authoritative, hash-addressed JSON documents</span>
├── events.jsonl     <span class="comment"># Canonical, append-only causal ledger</span>
├── localnet.json    <span class="comment"># Local simulated network state</span>
└── telemetry.jsonl  <span class="comment"># Observational logs and metrics</span>
</pre>
</div>
<p>Artifacts are <strong>immutable</strong> and <strong>append-only</strong>. Once created, they are never modified.</p>
</section>

<section id="localdev">
<h2>5. Local Development</h2>
<div class="grid cols-2">
<div class="box">
<h3>The Simulator</h3>
<p>HardKAS includes a built-in deterministic simulator. Fork state directly from real networks like <code>testnet-10</code> to test your dApps safely.</p>
</div>
<div class="box">
<h3>The Dashboard</h3>
<p>Run <code>pnpm hardkas dev</code> to launch a real-time dashboard visualizing your artifacts, causal graphs, and telemetry stream.</p>
</div>
</div>
</section>

<section id="testing">
<h2>6. Testing and CI</h2>
<p>HardKAS makes CI tests deeply deterministic using the Replay Engine.</p>
<div class="codeblock">
<div class="codebar">Verification command <button class="copy" data-copy="pnpm hardkas verify --strict">Copy</button></div>
<pre><span class="cmd">pnpm</span> hardkas verify <span class="flag">--strict</span></pre>
</div>
<p>This strictly verifies that the causal graph is unbroken, no artifacts were modified by hand, and the state files have not leaked into the artifact index.</p>
</section>

<section id="runtime">
<h2>7. Runtime Contract</h2>
<p>The core philosophy of HardKAS is that <strong>canonical truth must be isolated from environmental noise</strong>.</p>
<ul>
<li><strong>No Environmental Noise:</strong> Ignores OS-specific filesystem locking quirks and latency.</li>
<li><strong>Byte-Identical Outputs:</strong> Semantic Bundles hash identically across Linux and Windows.</li>
<li><strong>Strict Determinism:</strong> Arrays (like multisig signatures) are sorted using byte-value comparison, never <code>localeCompare</code>.</li>
</ul>
</section>

<footer class="footer">
HardKAS Documentation · 0.7.9-alpha · CLI · SDK · Artifacts · MIT License<br/>
HardKAS is local developer infrastructure.
</footer>
</main>
`;

const rightNav = `
<aside class="right toc">
<div class="side-title">On this page</div>
<a href="#overview">Overview</a>
<a href="#quickstart">1. Quickstart</a>
<a href="#cli">2. CLI</a>
<a href="#sdk">3. SDK</a>
<a href="#artifacts">4. Artifacts</a>
<a href="#localdev">5. Local Dev</a>
<a href="#testing">6. Testing</a>
<a href="#runtime">7. Runtime</a>
</aside>
</div>
<script>
    document.querySelectorAll('.copy').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const text = btn.getAttribute('data-copy') || '';
        try {
          await navigator.clipboard.writeText(text);
          const old = btn.textContent;
          btn.textContent = 'Copied';
          setTimeout(() => btn.textContent = old, 900);
        } catch (err) {
          btn.textContent = 'Failed';
          setTimeout(() => btn.textContent = 'Copy', 900);
        }
      });
    });
    const toggle = document.querySelector('.theme-toggle');
    const saved = localStorage.getItem('hardkas-theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    }
    if (toggle) {
      toggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('hardkas-theme', next);
        toggle.textContent = next === 'light' ? '☾' : '☀';
      });
    }
</script>
</body>
</html>
`;

const finalHTML = headerPart + leftNav + mainPart + rightNav;

fs.writeFileSync(outPath, finalHTML, "utf8");
console.log("Successfully generated docs/index.html");
