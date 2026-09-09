/**
 * Checks that the documentation can be built into the public site.
 *
 * The public URL list is read from site/seo-ia-map.md, which is the design
 * source for the site's information architecture. Each page that is meant to
 * back one of those URLs declares it in its own front matter:
 *
 *     ---
 *     title: Deterministic Artifacts
 *     description: One sentence used as the meta description.
 *     url: /artifacts
 *     ---
 *
 * The map is therefore derived from the pages, not maintained beside them.
 *
 * Fails on contradictions a site build cannot resolve: two pages claiming the
 * same URL, a page claiming a URL the IA map does not define, or front matter
 * missing the fields a page needs to render a <title> and <meta description>.
 *
 * Pages with no front matter are reported as pending, not failed. That keeps
 * this a ratchet: finished pages can never regress, unfinished ones stay
 * visible as a backlog.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DOCS_DIR = path.join(ROOT, "docs");
const IA_MAP = path.join(ROOT, "site", "seo-ia-map.md");

// Not published: audit evidence and historical records.
const EXCLUDED_DIRS = new Set(["internal"]);

const REQUIRED_FIELDS = ["title", "description"];
const MAX_DESCRIPTION = 160;

function collectDocs(dir, base = "") {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      found.push(...collectDocs(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".md")) {
      found.push(rel);
    }
  }
  return found;
}

/** Minimal front matter reader: flat `key: value` pairs only. */
function readFrontMatter(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = text.slice(3, end);
  const data = {};
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf(":");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return data;
}

/** Pulls the URL column out of the IA map's table rows. */
function readPublicUrls() {
  if (!fs.existsSync(IA_MAP)) {
    console.error(`[site] IA map not found: ${path.relative(ROOT, IA_MAP)}`);
    process.exit(1);
  }
  const urls = new Set();
  for (const line of fs.readFileSync(IA_MAP, "utf8").split("\n")) {
    if (!line.startsWith("|")) continue;
    const first = line.split("|")[1];
    if (!first) continue;
    const m = first.trim().match(/^`(\/[^`]*)`$/);
    if (m) urls.add(m[1]);
  }
  return urls;
}

const publicUrls = readPublicUrls();
const files = collectDocs(DOCS_DIR).sort();

const errors = [];
const pending = [];
const claimed = new Map();
let ready = 0;

for (const rel of files) {
  const text = fs.readFileSync(path.join(DOCS_DIR, rel), "utf8");
  const fm = readFrontMatter(text);

  if (!fm) {
    pending.push(rel);
    continue;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!fm[field]) {
      errors.push(`${rel}: front matter is missing required field '${field}'`);
    }
  }

  if (fm.description && fm.description.length > MAX_DESCRIPTION) {
    errors.push(
      `${rel}: description is ${fm.description.length} chars, over the ${MAX_DESCRIPTION} limit search engines display`
    );
  }

  if (fm.url) {
    if (!publicUrls.has(fm.url)) {
      errors.push(
        `${rel}: claims url '${fm.url}', which the IA map does not define`
      );
    } else if (claimed.has(fm.url)) {
      errors.push(
        `${rel}: url '${fm.url}' is already claimed by ${claimed.get(fm.url)}`
      );
    } else {
      claimed.set(fm.url, rel);
    }
  }

  if (errors.length === 0 || !errors[errors.length - 1].startsWith(rel)) ready++;
}

const unclaimed = [...publicUrls].filter((u) => !claimed.has(u)).sort();

console.log(`[site] Public URLs defined by the IA map: ${publicUrls.size}`);
console.log(`[site] Pages with front matter:           ${files.length - pending.length}/${files.length}`);
console.log(`[site] Public URLs backed by a page:      ${claimed.size}/${publicUrls.size}`);

if (unclaimed.length > 0) {
  console.log(`\n[site] Public URLs with no page yet (${unclaimed.length}):`);
  for (const u of unclaimed) console.log(`         ${u}`);
}

if (pending.length > 0) {
  console.log(`\n[site] Pages still without front matter (${pending.length}):`);
  for (const p of pending) console.log(`         ${p}`);
}

if (errors.length > 0) {
  console.error(`\n[site] FAILED — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`         ${e}`);
  process.exit(1);
}

console.log(`\n[site] No contradictions. ${claimed.size} URL(s) mapped, ${pending.length} page(s) pending.`);
