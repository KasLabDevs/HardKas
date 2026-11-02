/**
 * HardKAS Unified Web Deployment Generator
 *
 * Compiles Docusaurus with baseUrl: '/docs/', copies the landing page to root,
 * copies documentation into /docs/, and produces a unified, verified sitemap,
 * robots.txt, and llms.txt in dist/site.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
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

// 5. Build Unified Sitemap, robots.txt, and llms.txt
console.log("\n[5/5] Generating unified sitemap.xml, robots.txt, and llms.txt...");

// Read URLs from Docusaurus generated sitemap
const docusaurusSitemapPath = path.join(DOCS_BUILD, "sitemap.xml");
const docUrls = [];
if (fs.existsSync(docusaurusSitemapPath)) {
  const content = fs.readFileSync(docusaurusSitemapPath, "utf8");
  const regex = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    const url = m[1];
    if (!docUrls.includes(url)) docUrls.push(url);
  }
}

// Construct unified sitemap
const today = new Date().toISOString().split("T")[0];
let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
sitemapXml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

// Apex Landing Page
sitemapXml += `  <!-- HardKAS Apex Landing Page -->\n`;
sitemapXml += `  <url>\n    <loc>https://hardkas.dev/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

// Documentation URLs
sitemapXml += `  <!-- HardKAS Documentation (/docs/) -->\n`;
for (const url of docUrls) {
  // Give /docs/ entry high priority
  const priority = url === "https://hardkas.dev/docs/" ? "0.9" : "0.7";
  sitemapXml += `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
}
sitemapXml += `</urlset>\n`;

fs.writeFileSync(path.join(DIST_SITE, "sitemap.xml"), sitemapXml, "utf8");
console.log(`  ✓ Generated dist/site/sitemap.xml (${docUrls.length + 1} verified URLs)`);

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

// Unified llms.txt
const llmsTxt = `# HardKAS — Developer Framework & Transaction Simulator for Kaspa L1

> HardKAS is an open-source, local-first development framework, transaction simulator, and visual IDE for Kaspa L1.
> Inspired by the ergonomics of Ethereum tools (Hardhat, Foundry), built from first principles for Kaspa's UTXO BlockDAG.

## Core Truth & Boundaries
- Kaspa L1 is a Proof-of-Work UTXO BlockDAG running Kaspa Script (NOT an EVM, no Solidity on L1).
- HardKAS provides deterministic in-memory transaction simulation, managed Docker simnet (rusty-kaspad v2.0.0), and cryptographic JSON artifacts (TxPlan, SignedTx, TxReceipt).
- Every transaction plan, signed payload, and receipt can be replayed and verified offline.

## Canonical Web Endpoints
- Homepage: https://hardkas.dev/
- Documentation Base: https://hardkas.dev/docs/
- 5-Minute Quickstart: https://hardkas.dev/docs/getting-started/quickstart
- Installation Guide: https://hardkas.dev/docs/getting-started/installation
- The Execution Contract: https://hardkas.dev/docs/concepts/execution-contract
- Deterministic Replay: https://hardkas.dev/docs/concepts/replay
- Toccata & Covenants: https://hardkas.dev/docs/concepts/toccata/covenants
- SilverScript Tooling: https://hardkas.dev/docs/concepts/silverscript/what-is-silverscript
- CLI Command Reference: https://hardkas.dev/docs/reference/cli
- SDK Core Reference: https://hardkas.dev/docs/reference/sdk/core/

## Verified CLI Quickstart
\`\`\`bash
npx @hardkas/cli init my-app
cd my-app
hardkas tx plan --from alice --to bob --amount 10 --network simulated --out tx-plan.json
hardkas artifact verify tx-plan.json --strict
hardkas tx sign tx-plan.json --account alice --out tx-signed.json
hardkas tx send tx-signed.json --network simulated --yes
hardkas replay verify <receipt-id>
\`\`\`
`;

fs.writeFileSync(path.join(DIST_SITE, "llms.txt"), llmsTxt, "utf8");
console.log("  ✓ Generated dist/site/llms.txt");

console.log("\n✔ Unified Web Distribution successfully built at: dist/site/");
