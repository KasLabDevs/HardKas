import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// INT9 · D1: no text tells the user to install a package this release does not publish. The unpublished packages are
// the "Not published" table of docs/status/versioning.md (@hardkas/ext-l2, @hardkas/l2, @hardkas/pskt-native, …), and
// `hardkas extension install l2` installs @hardkas/ext-l2 from the registry. A text may still name such a command when it
// says, within three lines, that the package is not published. Scanned: the docs people read (root and docs/ Markdown,
// apps/docs pages, the landing page), package READMEs, the sources of the packages (CLI help and messages, SDK errors)
// and the templates. CHANGELOG.md is history and docs/internal is local-only; both are left out. The READMEs of the
// unpublished L2 packages themselves document how they install once published: instead of the three-line rule, each
// must open its install story with a "Not published in this release." notice.
const OWN_READMES = new Set(["packages/l2/README.md", "packages/ext-l2/README.md"]);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function notPublished(): string[] {
  const doc = readFileSync(path.join(ROOT, "docs", "status", "versioning.md"), "utf8").replace(/\r\n/g, "\n");
  const heading = "### Not published";
  const start = doc.indexOf(`\n${heading}\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = doc.slice(start + heading.length + 2);
  const end = rest.search(/\n#{2,3} /);
  return [...(end >= 0 ? rest.slice(0, end) : rest).matchAll(/^\|\s*`(@hardkas\/[a-z0-9-]+)`\s*\|/gm)].map((m) => m[1]!);
}

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".docusaurus", "coverage", "target", "internal", "generated"]);
const TEXT = /\.(md|mdx|html|txt|ts|tsx|js|mjs|cjs|json)$/;

function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full);
    } else if (entry.isFile() && TEXT.test(entry.name)) yield full;
  }
}

function scannedFiles(): string[] {
  const out = new Set<string>();
  for (const f of readdirSync(ROOT)) if (f.endsWith(".md") && f !== "CHANGELOG.md" && statSync(path.join(ROOT, f)).isFile()) out.add(path.join(ROOT, f));
  for (const f of walk(path.join(ROOT, "docs"))) if (f.endsWith(".md")) out.add(f);
  for (const f of walk(path.join(ROOT, "apps", "docs", "docs"))) out.add(f);
  out.add(path.join(ROOT, "apps", "docs", "static", "llms.txt"));
  out.add(path.join(ROOT, "site", "index.html"));
  for (const pkg of readdirSync(path.join(ROOT, "packages"))) {
    const dir = path.join(ROOT, "packages", pkg);
    if (existsSync(path.join(dir, "README.md"))) out.add(path.join(dir, "README.md"));
    for (const sub of ["src", "templates"]) for (const f of walk(path.join(dir, sub))) out.add(f);
  }
  return [...out].filter((f) => existsSync(f));
}

const QUALIFIED = /not published|not on npm|unpublished/i;

describe("INT9 · texts do not recommend installing unpublished packages", () => {
  const unpublished = notPublished();
  const names = unpublished.map((n) => n.replace("/", "\\/")).join("|");
  const recommend = new RegExp(
    String.raw`hardkas extension install l2\b|(?:npm|pnpm|yarn|npx)\s+(?:install|add|i)\b[^\n]*?(?:${names})(?![\w-])|\binstall\s+(?:${names})(?![\w-])`,
    "i"
  );

  it("the unpublished list includes the L2 packages and pskt-native", () => {
    expect(unpublished).toEqual(expect.arrayContaining(["@hardkas/ext-l2", "@hardkas/l2", "@hardkas/pskt-native"]));
  });

  it("every recommendation to install one of them says, within three lines, that it is not published", () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const file of scannedFiles()) {
      scanned++;
      if (OWN_READMES.has(path.relative(ROOT, file).split(path.sep).join("/"))) continue;
      const lines = readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
      lines.forEach((line, i) => {
        if (!recommend.test(line)) return;
        const window = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
        if (!QUALIFIED.test(window)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim().slice(0, 160)}`);
      });
    }
    expect(scanned).toBeGreaterThan(200);
    expect(offenders).toEqual([]);
  });

  it("the READMEs of @hardkas/l2 and @hardkas/ext-l2 say they are not published in this release", () => {
    for (const pkg of ["l2", "ext-l2"]) {
      const text = readFileSync(path.join(ROOT, "packages", pkg, "README.md"), "utf8");
      const notice = text.search(/\*\*Not published in this release\.\*\*/);
      expect(notice, pkg).toBeGreaterThanOrEqual(0);
      const firstInstall = text.search(recommend);
      if (firstInstall >= 0) expect(notice, `${pkg}: the notice comes before the first install command`).toBeLessThan(firstInstall);
    }
  });
});
