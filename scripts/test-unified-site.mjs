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
// BETA-FIX W4: `--dir <dir>` checks an assembly made with `build-unified-site.mjs --out <dir>`.
const dirAt = process.argv.indexOf("--dir");
const DIST_SITE = dirAt > -1 && process.argv[dirAt + 1] ? path.resolve(process.argv[dirAt + 1]) : path.join(ROOT, "dist", "site");

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
      // BETA-FIX W4: the site renders the repository's docs/; the quickstart is docs/start/quickstart.md
      name: "Deep Docs Route: Quickstart (/docs/start/quickstart)",
      path: "/docs/start/quickstart",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("hardkas tx plan")) return "Missing verified CLI quickstart command";
        return null;
      }
    },
    {
      name: "Deep Docs Route: Concepts (/docs/concepts/execution-worlds)",
      path: "/docs/concepts/execution-worlds",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("ExecutionTarget")) return "Missing execution contract terms";
        return null;
      }
    },
    {
      name: "Moved page: old URL redirects (/docs/getting-started/quickstart)",
      path: "/docs/getting-started/quickstart",
      validate: (body, status) => {
        if (status !== 200) return `Expected the HTTP 200 redirect page, got ${status}`;
        // SEO-2026-11-21: redirect targets end in "/" (trailingSlash: true), so the 301 lands on the final URL
        if (!body.includes('url=/docs/start/quickstart/"')) return "Missing the redirect to /docs/start/quickstart/";
        return null;
      }
    },
    {
      name: "Cloudflare redirects at the root (/_redirects)",
      path: "/_redirects",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("/ide               /ide/")) return "Missing the landing page's own redirects";
        if (!body.includes("/docs/getting-started/quickstart /docs/start/quickstart/ 301")) return "Missing the docs redirects";
        if (!body.includes("/docs/concepts/execution-contract /docs/concepts/execution-worlds/ 301")) return "Missing a merged page's redirect";
        if (!body.includes("/docs/concepts/pskt/what-is-pskt /docs/concepts/pskt/ 301")) return "Missing a redirect of a page published before 21-nov";
        if (!body.includes("/docs/reference/sdk/core/* /docs/reference/sdk/generated/  301")) return "Missing the redirect of the old core SDK reference";
        return null;
      }
    },
    {
      name: "Generated CLI reference (/docs/reference/cli/tx)",
      path: "/docs/reference/cli/tx",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("hardkas tx plan")) return "Missing the tx plan command";
        return null;
      }
    },
    {
      // the generated TypeDoc reference (apps/docs/typedoc.json); the old hand-kept core set documented a core that no longer exists
      name: "Deep Docs Route: SDK Reference (/docs/reference/sdk/generated/)",
      path: "/docs/reference/sdk/generated/",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("HardKAS SDK")) return "Missing TypeDoc SDK markers";
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
        if (!body.includes("9 September 2026")) return "Missing SilverScript v1.0.0 release date";
        return null;
      }
    },
    {
      name: "Strategic Page 5: Testing Kaspa Covenants with HardKAS",
      path: "/docs/guides/testing-kaspa-covenants",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("Testing Kaspa Covenants with HardKAS")) return "Missing title/H1";
        if (!body.includes("artifact verify")) return "Missing evidence references (artifact verify)";
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
        // SEO-2026-11-21: sitemap URLs use the trailing-slash form Cloudflare Pages serves, and leave out the TypeDoc pages
        if (!body.includes("<loc>https://hardkas.dev/docs/start/quickstart/</loc>")) return "Missing quickstart in sitemap";
        if (/\/docs\/getting-started\/quickstart\/?</.test(body)) return "A moved page's old URL is in the sitemap";
        if (/<loc>https:\/\/hardkas\.dev\/docs\/[^<]*[^/]<\/loc>/.test(body)) return "A docs URL without its trailing slash is in the sitemap";
        if (!body.includes("<loc>https://hardkas.dev/docs/reference/sdk/generated/</loc>")) return "Missing the SDK reference index in sitemap";
        if (body.includes("/docs/reference/sdk/generated/sdk/")) return "TypeDoc member pages are in the sitemap";
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
        if (!body.includes("https://hardkas.dev/llms-full.txt")) return "Missing llms-full.txt pointer in llms.txt";
        if (!body.includes("hardkas tx send")) return "Missing CLI fast-path in llms.txt";
        if (!body.includes("https://hardkas.dev/docs/start/what-works/")) return "Missing the what-works page in llms.txt";
        if (!body.includes("https://hardkas.dev/md/")) return "Missing the Markdown copies in llms.txt";
        return null;
      }
    },
    {
      // SEO-2026-11-21: a top-level 404 page, so Cloudflare Pages answers unknown URLs with 404, not the landing page
      name: "Top-level 404 page (/404.html)",
      path: "/404.html",
      validate: (body, status) => {
        if (status !== 200) return `Expected the file to exist (HTTP 200 here), got ${status}`;
        if (!body.includes("__docusaurus")) return "The 404 page is not the docs 404 page";
        return null;
      }
    },
    {
      name: "Markdown copy of a page (/md/start/quickstart.md)",
      path: "/md/start/quickstart.md",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("hardkas tx plan")) return "Missing the quickstart's commands";
        return null;
      }
    },
    {
      name: "Markdown copies are noindex (/_headers)",
      path: "/_headers",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("/md/*") || !body.includes("X-Robots-Tag: noindex")) return "Missing the noindex header for /md/*";
        return null;
      }
    },
    {
      name: "Unified llms-full.txt",
      path: "/llms-full.txt",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("Build on Kaspa with AI")) return "Missing AI docs section in llms-full.txt";
        if (!body.includes("hardkas tx plan")) return "Missing tx plan workflow in llms-full.txt";
        if (!body.includes("hardkas silver covenant transition")) return "Missing covenant workflow in llms-full.txt";
        return null;
      }
    },
    {
      name: "Build on Kaspa with AI (/docs/ai/)",
      path: "/docs/ai/",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("Build on Kaspa with AI")) return "Missing AI landing title";
        return null;
      }
    },
    {
      name: "Canonical AI Workflows (/docs/ai/workflows)",
      path: "/docs/ai/workflows",
      validate: (body, status) => {
        if (status !== 200) return `Expected HTTP 200, got ${status}`;
        if (!body.includes("Canonical AI Workflows")) return "Missing workflows heading";
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
