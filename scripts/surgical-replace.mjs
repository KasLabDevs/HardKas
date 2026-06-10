import fs from "fs";
import path from "path";

const projectRoot = path.resolve(process.cwd());
const templatePath = path.join(projectRoot, "plantilla-docs.html");
const outPath = path.join(projectRoot, "docs", "index.html");

let html = fs.readFileSync(templatePath, "utf8");

// Replace versions
html = html.replace(/0\.6\.1-alpha/g, "0.7.9-alpha");

// Replace Subtitle
html = html.replace(
  /<p class="subtitle">.*?<\/p>/,
  '<p class="subtitle">HardKAS is a local-first, deterministic runtime and SDK for building and testing Kaspa dApps. It manages isolated workspaces, enforces strict semantic invariants, and produces verifiable artifacts for every transaction.</p>'
);

// Replace Hero Warning
html = html.replace(
  /<div class="warning"><strong>Alpha boundary\.<\/strong>.*?<\/div>/,
  '<div class="warning"><strong>Runtime Invariants Updated:</strong> Strict deterministic sorting (byte-level, no localeCompare) and rigid path traversal boundaries are now enforced across the workspace.</div>'
);

// We need to keep the grid cols-3 and box classes intact.
html = html.replace(
  /<h3>Protocol tooling<\/h3>\s*<p>.*?<\/p>/,
  "<h3>Semantic Invariants</h3>\n<p>Byte-identical outputs across operating systems. Strict deterministic sorting ensures multisig arrays hash identically everywhere.</p>"
);

// Replace "What is HardKAS?" table contents to match new rules
html = html.replace(
  /A bridge-aware local simulator with explicit assumptions\./,
  "Strict deterministic artifact workflows."
);

// Replace quickstart code blocks
html = html.replace(
  /pnpm add -g @hardkas\/cli@alpha\nhardkas new my-kaspa-app\ncd my-kaspa-app\npnpm test\nhardkas console/,
  "pnpm init\npnpm add @hardkas/sdk\npnpm add -D @hardkas/cli\npnpm hardkas init\npnpm hardkas dev server"
);

// Replace L2 transaction plan details with Path traversal info
html = html.replace(
  /<summary>Create and inspect an L2 transaction plan<\/summary>/,
  "<summary>Inspect Path Traversal Boundaries (0.7.9 Update)</summary>"
);
html = html.replace(/hardkas l2 tx build.*?--json/g, "hardkas verify --strict");
html = html.replace(
  /L2 transaction plan:[\s\S]*?planned/g,
  "Lineage verification:\n  Strict mode: passed\n  Path integrity: locked"
);

// Left Side Nav replacement
html = html.replace(
  /<aside class="left side">[\s\S]*?<\/aside>/,
  `<aside class="left side">
<div class="side-title">Start</div>
<a href="#overview">Overview</a>
<a href="#quickstart">Quickstart</a>
<div class="side-title">Core Docs</div>
<a href="#cli">CLI Reference</a>
<a href="#packages">SDK</a>
<a href="#artifacts">Artifacts Guide</a>
<div class="side-title">Runtime</div>
<a href="#runtime">Runtime Contract</a>
<a href="#testing">Testing & Local Dev</a>
</aside>`
);

// Right side Nav replacement
html = html.replace(
  /<aside class="right toc">[\s\S]*?<\/aside>/,
  `<aside class="right toc">
<div class="side-title">On this page</div>
<a href="#overview">Overview</a>
<a href="#quickstart">Quickstart</a>
<a href="#cli">CLI</a>
<a href="#packages">SDK</a>
<a href="#artifacts">Artifacts</a>
<a href="#runtime">Runtime</a>
<a href="#testing">Testing</a>
</aside>`
);

fs.writeFileSync(outPath, html, "utf8");
console.log("Successfully generated surgically replaced docs/index.html");
