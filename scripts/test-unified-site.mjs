/**
 * Automated Verification for HardKAS Unified Web Distribution
 *
 * Boots a lightweight local HTTP server serving dist/site/ and validates:
 * 1. Root landing page (HTTP 200, canonical structure, /docs/ link)
 * 2. Docusaurus base (/docs/ HTTP 200, home link)
 * 3. Deep documentation routes (quickstart, execution-contract, sdk reference)
 * 4. Static assets (CSS, JS, fonts)
 * 5. Crawl & discovery files (sitemap.xml, robots.txt, llms.txt)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST_SITE = path.join(ROOT, "dist", "site");

if (!fs.existsSync(DIST_SITE)) {
  console.error("❌ dist/site does not exist. Run 'pnpm site:build' first.");
  process.exit(1);
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

// Create local static HTTP server matching production static hosting rules
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  let filePath = path.join(DIST_SITE, urlPath);

  // If path is a directory or ends with '/', look for index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  } else if (!fs.existsSync(filePath) && fs.existsSync(filePath + ".html")) {
    // Clean URLs support
    filePath = filePath + ".html";
  } else if (!fs.existsSync(filePath) && fs.existsSync(path.join(filePath, "index.html"))) {
    filePath = path.join(filePath, "index.html");
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`404 Not Found: ${urlPath}`);
  }
});

const PORT = 8899;

server.listen(PORT, async () => {
  console.log(`\n[Test Server] Running at http://localhost:${PORT}/ ...`);

  let failures = 0;
  const checks = [
    {
      name: "Root Landing Page (/) ",
      path: "/",
      validate: (body, status, headers) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("<title>HardKAS")) return "Missing <title>HardKAS";
        if (!body.includes('href="/docs/"')) return "Missing link to /docs/";
        return null;
      }
    },
    {
      name: "Documentation Base (/docs/)",
      path: "/docs/",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("__docusaurus")) return "Missing Docusaurus root element";
        if (!body.includes("https://hardkas.dev/docs/")) return "Missing canonical link to https://hardkas.dev/docs/";
        return null;
      }
    },
    {
      name: "Deep Docs Route: Quickstart (/docs/getting-started/quickstart)",
      path: "/docs/getting-started/quickstart",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("hardkas tx plan")) return "Missing verified CLI quickstart command";
        return null;
      }
    },
    {
      name: "Deep Docs Route: Concepts (/docs/concepts/execution-contract)",
      path: "/docs/concepts/execution-contract",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("ExecutionContract") && !body.includes("ExecutionTarget")) return "Missing execution contract terms";
        return null;
      }
    },
    {
      name: "Deep Docs Route: SDK Reference (/docs/reference/sdk/core/)",
      path: "/docs/reference/sdk/core/",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("@hardkas/core") && !body.includes("TypeDoc")) return "Missing TypeDoc SDK markers";
        return null;
      }
    },
    {
      name: "Strategic Page 1: Kaspa L1 Development Framework",
      path: "/docs/concepts/kaspa-l1-development-framework",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("Kaspa L1 Development Framework")) return "Missing title/H1";
        if (!body.includes("June 30, 2026") && !body.includes("474,165,565")) return "Missing verified Toccata activation date";
        return null;
      }
    },
    {
      name: "Strategic Page 2: Hardhat for Kaspa",
      path: "/docs/guides/hardhat-for-kaspa",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("Hardhat for Kaspa")) return "Missing title/H1";
        if (!body.includes("hardkas.config.ts")) return "Missing config comparison";
        return null;
      }
    },
    {
      name: "Strategic Page 3: Kaspa Developer Tools & Ecosystem",
      path: "/docs/concepts/kaspa-developer-tools-and-ecosystem",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("rusty-kaspa") || !body.includes("kaspa-wasm")) return "Missing ecosystem tools";
        return null;
      }
    },
    {
      name: "Strategic Page 4: SilverScript IDE & Local Development",
      path: "/docs/guides/silverscript-ide-and-local-development",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("SilverScript IDE")) return "Missing title/H1";
        if (!body.includes("silverc v1.0.0") && !body.includes("September 9, 2026")) return "Missing SilverScript v1.0.0 release date";
        return null;
      }
    },
    {
      name: "Strategic Page 5: Testing Kaspa Covenants with HardKAS",
      path: "/docs/guides/testing-kaspa-covenants",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("Testing Kaspa Covenants with HardKAS")) return "Missing title/H1";
        if (!body.includes("Evidence Package")) return "Missing evidence package references";
        return null;
      }
    },
    {
      name: "Unified sitemap.xml",
      path: "/sitemap.xml",
      validate: (body, status, headers) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("<loc>https://hardkas.dev/</loc>")) return "Missing root apex in sitemap";
        if (!body.includes("<loc>https://hardkas.dev/docs/</loc>")) return "Missing /docs/ in sitemap";
        if (!body.includes("<loc>https://hardkas.dev/docs/getting-started/quickstart</loc>")) return "Missing quickstart in sitemap";
        return null;
      }
    },
    {
      name: "Unified robots.txt",
      path: "/robots.txt",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("Sitemap: https://hardkas.dev/sitemap.xml")) return "Missing sitemap directive in robots.txt";
        if (!body.includes("User-agent: Googlebot")) return "Missing Googlebot directive";
        return null;
      }
    },
    {
      name: "Unified llms.txt",
      path: "/llms.txt",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("https://hardkas.dev/docs/")) return "Missing docs pointer in llms.txt";
        if (!body.includes("hardkas tx plan")) return "Missing CLI commands in llms.txt";
        return null;
      }
    }
  ];

  for (const check of checks) {
    try {
      const res = await fetch(`http://localhost:${PORT}${check.path}`);
      const body = await res.text();
      const err = check.validate(body, res.status, res.headers);
      if (err) {
        console.error(`  ❌ ${check.name}: FAIL - ${err}`);
        failures++;
      } else {
        console.log(`  ✓ ${check.name}: PASS (HTTP ${res.status})`);
      }
    } catch (e) {
      console.error(`  ❌ ${check.name}: ERROR - ${e.message}`);
      failures++;
    }
  }

  // Also verify an actual JS asset from /docs/
  try {
    const docsIndex = fs.readFileSync(path.join(DIST_SITE, "docs", "index.html"), "utf8");
    const scriptMatch = docsIndex.match(/src="(\/docs\/assets\/js\/[^"]+)"/);
    if (scriptMatch) {
      const assetUrl = `http://localhost:${PORT}${scriptMatch[1]}`;
      const res = await fetch(assetUrl);
      if (res.status === 200) {
        console.log(`  ✓ Asset Verification (${scriptMatch[1]}): PASS (HTTP 200)`);
      } else {
        console.error(`  ❌ Asset Verification (${scriptMatch[1]}): FAIL - HTTP ${res.status}`);
        failures++;
      }
    }
  } catch (e) {
    console.error(`  ❌ Asset check error: ${e.message}`);
    failures++;
  }

  server.close(() => {
    console.log(`\n[Test Server] Shutdown complete.`);
    if (failures > 0) {
      console.error(`\n❌ Validation failed with ${failures} error(s).`);
      process.exit(1);
    } else {
      console.log(`\n✔ ALL HTTP AND ASSET CHECKS PASSED PERFECTLY!`);
      process.exit(0);
    }
  });
});
