/**
 * HardKAS Unified Web Deployment Generator
 *
 * Compiles Docusaurus with baseUrl: '/docs/', copies the landing page to root,
 * copies documentation into /docs/, and produces a unified, verified sitemap,
 * robots.txt, and llms.txt in dist/site.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST_SITE = path.join(ROOT, "dist", "site");
const SITE_SRC = path.join(ROOT, "site");
const DOCS_BUILD = path.join(ROOT, "apps", "docs", "build");

console.log("=== Building HardKAS Unified Web Distribution ===");

// 1. Build Docusaurus docs
console.log("\n[1/5] Building Docusaurus documentation (@hardkas/docs)...");
execSync("pnpm --filter @hardkas/docs build", {
  cwd: ROOT,
  stdio: "inherit"
});

// 2. Prepare dist/site directory
console.log("\n[2/5] Preparing clean distribution directory (dist/site)...");
if (fs.existsSync(DIST_SITE)) {
  fs.rmSync(DIST_SITE, { recursive: true, force: true });
}
fs.mkdirSync(DIST_SITE, { recursive: true });

// 3. Copy Landing page and root assets
console.log("\n[3/5] Deploying Landing Page and Root Assets to dist/site/...");
fs.copyFileSync(path.join(SITE_SRC, "index.html"), path.join(DIST_SITE, "index.html"));

// Copy any static assets from site/ if they exist (pdf, images, etc.)
for (const file of fs.readdirSync(SITE_SRC)) {
  if (file.endsWith(".pdf") || file.endsWith(".png") || file.endsWith(".ico") || file.endsWith(".svg") || file.startsWith("_")) {
    fs.copyFileSync(path.join(SITE_SRC, file), path.join(DIST_SITE, file));
    console.log(`  Copied root asset: ${file}`);
  }
}

// 4. Copy Docusaurus build output into dist/site/docs
console.log("\n[4/5] Deploying Docusaurus to dist/site/docs/...");
const distDocs = path.join(DIST_SITE, "docs");

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDirRecursive(DOCS_BUILD, distDocs);

// Copy standalone /ide/ landing page if present
const ideSrc = path.join(SITE_SRC, "ide");
if (fs.existsSync(ideSrc)) {
  copyDirRecursive(ideSrc, path.join(DIST_SITE, "ide"));
  console.log("  Deployed IDE landing page to dist/site/ide/");
}

// 5. Build Unified Sitemap, robots.txt, and llms.txt
console.log("\n[5/5] Generating unified sitemap.xml, robots.txt, and llms.txt...");

const today = new Date().toISOString().split("T")[0];
const isValidDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today;

/**
 * Index last commit dates (%cs = YYYY-MM-DD) for all tracked files under site/ and apps/docs/docs/
 * in a single git invocation. If git is unavailable, returns an empty map so <lastmod> is omitted.
 */
function buildGitLastModifiedMap() {
  const map = new Map();
  try {
    const out = execFileSync(
      "git",
      ["log", "--name-only", "--format=DATE:%cs", "--", "site/", "apps/docs/docs/"],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
    let currentDate = null;
    for (const rawLine of out.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith("DATE:")) {
        const d = line.slice(5).trim();
        currentDate = isValidDate(d) ? d : null;
      } else if (currentDate) {
        const normalized = line.replace(/\\/g, "/");
        if (!map.has(normalized)) {
          map.set(normalized, currentDate);
        }
      }
    }
  } catch {
    // Git unavailable or not a git repository: omit <lastmod> rather than inventing dates.
  }
  return map;
}

const gitDates = buildGitLastModifiedMap();

function gitLastModified(relPath) {
  return gitDates.get(relPath.replace(/\\/g, "/")) ?? null;
}

function resolveDocSourceDate(url) {
  const prefix = "https://hardkas.dev/docs";
  if (!url.startsWith(prefix)) return null;
  const rel = url.slice(prefix.length).replace(/^\/+|\/+$/g, "");
  const candidates = rel
    ? [
        `apps/docs/docs/${rel}.md`,
        `apps/docs/docs/${rel}.mdx`,
        `apps/docs/docs/${rel}/index.md`,
        `apps/docs/docs/${rel}/index.mdx`,
        `apps/docs/docs/${rel}/README.md`
      ]
    : ["apps/docs/docs/index.md", "apps/docs/docs/index.mdx", "apps/docs/docs/README.md"];
  for (const c of candidates) {
    const d = gitLastModified(c);
    if (d) return d;
  }
  return null;
}

function lastmodXml(date) {
  return isValidDate(date) ? `\n    <lastmod>${date}</lastmod>` : "";
}

// Read URLs (and any existing valid <lastmod>) from Docusaurus generated sitemap
const docusaurusSitemapPath = path.join(DOCS_BUILD, "sitemap.xml");
const docEntries = [];
const seenUrls = new Set();
if (fs.existsSync(docusaurusSitemapPath)) {
  const content = fs.readFileSync(docusaurusSitemapPath, "utf8");
  const urlBlockRegex = /<url>([\s\S]*?)<\/url>/g;
  let m;
  while ((m = urlBlockRegex.exec(content)) !== null) {
    const block = m[1];
    const locMatch = /<loc>([^<]+)<\/loc>/.exec(block);
    if (!locMatch) continue;
    const url = locMatch[1];
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    const lmMatch = /<lastmod>([^<]+)<\/lastmod>/.exec(block);
    const docusaurusLastmod = lmMatch && isValidDate(lmMatch[1].slice(0, 10)) ? lmMatch[1].slice(0, 10) : null;
    docEntries.push({ url, lastmod: docusaurusLastmod ?? resolveDocSourceDate(url) });
  }
}

// Construct unified sitemap
const homeLastmod = gitLastModified("site/index.html");
const ideIndexPath = path.join(SITE_SRC, "ide", "index.html");
const hasIdeLanding = fs.existsSync(ideIndexPath);
const ideLastmod = hasIdeLanding ? gitLastModified("site/ide/index.html") : null;
let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
sitemapXml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

// Apex Landing Page
sitemapXml += `  <!-- HardKAS Apex Landing Page -->\n`;
sitemapXml += `  <url>\n    <loc>https://hardkas.dev/</loc>${lastmodXml(homeLastmod)}\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

// HardKAS IDE Landing Page
if (hasIdeLanding) {
  sitemapXml += `  <!-- HardKAS IDE Landing Page (/ide/) -->\n`;
  sitemapXml += `  <url>\n    <loc>https://hardkas.dev/ide/</loc>${lastmodXml(ideLastmod)}\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
}

// Documentation URLs
sitemapXml += `  <!-- HardKAS Documentation (/docs/) -->\n`;
for (const { url, lastmod } of docEntries) {
  const priority = url === "https://hardkas.dev/docs/" ? "0.9" : "0.7";
  sitemapXml += `  <url>\n    <loc>${url}</loc>${lastmodXml(lastmod)}\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
}
sitemapXml += `</urlset>\n`;

const totalSitemapUrls = docEntries.length + 1 + (hasIdeLanding ? 1 : 0);
fs.writeFileSync(path.join(DIST_SITE, "sitemap.xml"), sitemapXml, "utf8");
console.log(`  ✓ Generated dist/site/sitemap.xml (${totalSitemapUrls} verified URLs)`);

// Unified robots.txt
const robotsTxt = `# HardKAS Unified Robots Directive
User-agent: *
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

# AI & LLM Crawlers
User-agent: ClaudeBot
Allow: /

User-agent: GPTBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Applebot
Allow: /

Sitemap: https://hardkas.dev/sitemap.xml
`;

fs.writeFileSync(path.join(DIST_SITE, "robots.txt"), robotsTxt, "utf8");
console.log("  ✓ Generated dist/site/robots.txt");

// Unified llms.txt (navigation map) + llms-full.txt (compiled from canonical AI docs)
const llmsTxt = `# HardKAS — Developer Framework & Transaction Simulator for Kaspa L1

> HardKAS is an open-source, local-first development framework, transaction simulator, and visual IDE for Kaspa L1.
> Inspired by the ergonomics of Ethereum tools (Hardhat, Foundry), built from first principles for Kaspa's UTXO BlockDAG.

## Core Truth & Boundaries
- Kaspa L1 is a Proof-of-Work UTXO BlockDAG running Kaspa Script (NOT an EVM, no Solidity on L1).
- Versions: npm \`latest\` is \`0.13.0-rc.2\`; repository development tree is \`0.13.0-rc.3\`.
- Managed Docker simnet (\`--profile toccata-v2\`) runs \`rusty-kaspad\` \`v2.1.0\` (container \`hardkas-kaspad-toccata-v2\`, JSON wRPC \`ws://127.0.0.1:18210\`).
- Mainnet is blocked by policy (no reads, signing, or broadcast).
- \`simulated\` and local \`silver test\` (\`SCRIPT_VM\`) are NOT independent consensus proof; use \`simnet\` for real-node verification.
- Prefer HardKAS CLI/SDK over custom \`kaspa-wasm\` scripts for payments, keystores, SilverScript, and artifact verification.

## Token-Saving Reading Rule for Agents
- For a standard KAS payment on \`simnet\`, use the **Fast Path** below directly — do **not** read \`llms-full.txt\` (23 KB) and do **not** run \`doctor\`/\`silver doctor\` first.
- Only read a specific recipe anchor or \`https://hardkas.dev/llms-full.txt\` when you need SilverScript, Toccata covenants, artifact verification, or error codes:
  - Send KAS: https://hardkas.dev/docs/ai/workflows#1-send-kas-on-simnet-and-confirm-the-transaction
  - SilverScript P2SH: https://hardkas.dev/docs/ai/workflows#2-compile-and-execute-silverscript-p2sh-workflows
  - Covenants (valid & invalid): https://hardkas.dev/docs/ai/workflows#3-perform-valid-and-invalid-covenant-transitions-against-a-real-node
  - Verify receipts: https://hardkas.dev/docs/ai/workflows#4-verify-transaction-receipts-and-execution-artifacts
  - Diagnose node/UTXOs: https://hardkas.dev/docs/ai/workflows#5-diagnose-node-rpc-account-and-utxo-problems
  - CLI vs SDK: https://hardkas.dev/docs/ai/workflows#6-select-the-appropriate-hardkas-cli-or-sdk-workflow
  - Full AI Reference (all above combined): https://hardkas.dev/llms-full.txt

## Fast Path: Send KAS on Simnet (2 commands, no config file needed)
- Omit \`--url\` if using the default HardKAS localnet (\`ws://127.0.0.1:18210\`). \`--wait\` waits until \`CONFIRMED\` on the same node (default \`--wait-timeout 60\`; on timeout it exits \`1\` with \`code: TX_SEND_WAIT_FAILED\` and \`outcome: submitted\`).
\`\`\`bash
export HARDKAS_PASSWORD='choose-a-simnet-password'
hardkas accounts real import --name payer --address <kaspasim:sender> --network simnet --private-key-env PK --password-env HARDKAS_PASSWORD && \\
hardkas tx send --from payer --to <kaspasim:recipient> --amount 10 --network simnet --url ws://<host>:18210 --password-env HARDKAS_PASSWORD --yes --wait --json
\`\`\`

## Canonical Web Endpoints
- Homepage: https://hardkas.dev/
- HardKAS IDE: https://hardkas.dev/ide/
- Documentation Base: https://hardkas.dev/docs/
- Build on Kaspa with AI: https://hardkas.dev/docs/ai/
- Canonical AI Workflows (6 tasks): https://hardkas.dev/docs/ai/workflows
- AI Troubleshooting & Error Codes: https://hardkas.dev/docs/ai/troubleshooting
- Claude Code & Cursor Guide: https://hardkas.dev/docs/ai/claude-code-and-cursor
- 5-Minute Quickstart: https://hardkas.dev/docs/getting-started/quickstart
- CLI Command Reference: https://hardkas.dev/docs/reference/cli
- SDK Core Reference: https://hardkas.dev/docs/reference/sdk/core/

## First Checks (for SilverScript, Covenants, or Debugging)
\`\`\`bash
hardkas doctor --json
hardkas silver doctor --network simnet --json
\`\`\`
`;

fs.writeFileSync(path.join(DIST_SITE, "llms.txt"), llmsTxt, "utf8");
console.log("  ✓ Generated dist/site/llms.txt");

// Generate llms-full.txt from the single canonical source in apps/docs/docs/ai/
function stripFrontmatter(md) {
  if (!md.startsWith("---")) return md.trim();
  const end = md.indexOf("\n---", 3);
  return end === -1 ? md.trim() : md.slice(end + 4).trim();
}

const aiDocFiles = [
  "index.md",
  "workflows.md",
  "troubleshooting.md",
  "claude-code-and-cursor.md",
];
const aiSections = aiDocFiles
  .map((file) => {
    const fullPath = path.join(ROOT, "apps", "docs", "docs", "ai", file);
    return fs.existsSync(fullPath) ? stripFrontmatter(fs.readFileSync(fullPath, "utf8")) : null;
  })
  .filter(Boolean);

const llmsFullTxt = [
  llmsTxt.trim(),
  "",
  "---",
  "",
  ...aiSections.flatMap((section) => [section, "", "---", ""]),
].join("\n");

fs.writeFileSync(path.join(DIST_SITE, "llms-full.txt"), llmsFullTxt, "utf8");
console.log("  ✓ Generated dist/site/llms-full.txt");

console.log("\n✔ Unified Web Distribution successfully built at: dist/site/");
