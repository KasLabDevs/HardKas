// BETA-FIX W4 · the site renders the repository's docs/ as written for GitHub. These plugins bridge the two readers
// without asking the pages for anything GitHub would show as noise:
//   - remarkDocsSource: relative links that leave docs/ (packages, examples, root files) or point at a page the site does
//     not publish (docs/internal, docs/community, ...) become GitHub URLs; links to docs/reference/cli.md (the one-page
//     CLI reference, read on GitHub) become the generated per-group pages; GitHub alerts (`> [!WARNING]`) become
//     admonitions; `<!-- qualification: <id> -->` becomes the QualificationContext box, and an id without data fails the
//     build with file:line.
//   - rehypeStaticImages: a raw HTML <img> whose src is a relative path into a static directory (as the IDE pages use,
//     so the image also shows on GitHub) is served from that directory; one that resolves nowhere fails the build.
// No dependency: the trees are walked by hand.
import fs from "node:fs";
import path from "node:path";

const toPosix = (p) => p.split(path.sep).join("/");

function walk(node, visit, parent = null, index = null) {
  const replaced = visit(node, parent, index);
  if (replaced === "skip") return;
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) walk(node.children[i], visit, node, i);
  }
}

function where(file, node) {
  const line = node?.position?.start?.line;
  return `${file}${line ? `:${line}` : ""}`;
}

const ALERTS = { NOTE: "note", TIP: "tip", IMPORTANT: "important", WARNING: "warning", CAUTION: "caution" };

function hasProtocol(url) {
  return /^[a-z][a-z0-9+.-]*:/i.test(url);
}

function matchesAny(rel, prefixes) {
  return prefixes.some((p) => rel === p || rel.startsWith(p.endsWith("/") ? p : `${p}/`));
}

/**
 * @param {{ docsRoot: string, repoRoot: string, repoUrl: string, unpublished: string[], cliPagesDir: string,
 *           qualificationIds: string[] }} options
 */
export function remarkDocsSource(options) {
  const docsRoot = path.resolve(options.docsRoot);
  const repoRoot = path.resolve(options.repoRoot);
  const unpublished = options.unpublished.map((p) => p.replace(/\/+$/, ""));
  const qualificationIds = new Set(options.qualificationIds);
  const cliGroups = fs.existsSync(options.cliPagesDir)
    ? fs
        .readdirSync(options.cliPagesDir)
        .filter((f) => f.endsWith(".md") && f !== "index.md")
        .map((f) => f.slice(0, -3))
        .sort((a, b) => b.length - a.length)
    : [];

  function githubUrl(abs, hash) {
    const kind = fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? "tree" : "blob";
    return `${options.repoUrl}/${kind}/develop/${toPosix(path.relative(repoRoot, abs))}${hash}`;
  }

  // the anchors of each generated group page: its `## \`hardkas <command>\`` headings (one per command with an action)
  const anchorsOf = new Map();
  function groupAnchors(group) {
    if (!anchorsOf.has(group)) {
      const text = fs.readFileSync(path.join(options.cliPagesDir, `${group}.md`), "utf8");
      const set = new Set();
      for (const m of text.matchAll(/^## `(hardkas [^`]+)`\s*$/gm)) set.add(m[1].toLowerCase().replace(/\s+/g, "-"));
      anchorsOf.set(group, set);
    }
    return anchorsOf.get(group);
  }

  function cliPageUrl(hash) {
    const anchor = hash.replace(/^#/, "");
    const group = cliGroups.find((g) => anchor === `hardkas-${g}` || anchor.startsWith(`hardkas-${g}-`));
    if (!group) return "/reference/cli/";
    // a group or a parent command (e.g. `hardkas silver covenant`) has no heading of its own there: link the page
    return groupAnchors(group).has(anchor) ? `/reference/cli/${group}${hash}` : `/reference/cli/${group}`;
  }

  function rewrite(url, file, node) {
    if (!url || url.startsWith("#") || url.startsWith("/") || hasProtocol(url)) return url;
    const hashAt = url.indexOf("#");
    const hash = hashAt >= 0 ? url.slice(hashAt) : "";
    const target = (hashAt >= 0 ? url.slice(0, hashAt) : url).split("?")[0];
    if (!target) return url;
    const abs = path.resolve(path.dirname(file), decodeURIComponent(target));
    if (!fs.existsSync(abs)) {
      throw new Error(`[docs-source] broken relative link "${url}" at ${where(file, node)}`);
    }
    const rel = toPosix(path.relative(docsRoot, abs));
    const inside = rel !== "" && !rel.startsWith("../") && !path.isAbsolute(rel);
    if (inside && rel === "reference/cli.md") return cliPageUrl(hash);
    // a page of the generated references (apps/docs/reference/{cli,sdk}) is a page of this site too
    const generated = options.generatedRefDir ? toPosix(path.relative(path.resolve(options.generatedRefDir), abs)) : "../";
    if (!generated.startsWith("../") && !path.isAbsolute(generated) && /\.md$/.test(generated)) {
      const route = generated.replace(/\.md$/, "").replace(/(^|\/)(README|index)$/, "$1");
      return `/reference/${route}${hash}`;
    }
    if (!inside || matchesAny(rel, unpublished) || !/\.mdx?$/.test(rel)) return githubUrl(abs, hash);
    return url;
  }

  return (tree, vfile) => {
    const file = vfile.path;
    if (!file || !path.resolve(file).startsWith(docsRoot + path.sep)) return;

    walk(tree, (node, parent, index) => {
      if ((node.type === "link" || node.type === "definition") && typeof node.url === "string") {
        node.url = rewrite(node.url, file, node);
      }

      if (node.type === "html" && parent) {
        const m = /^<!--\s*qualification:\s*([A-Za-z0-9_-]+)\s*-->$/.exec(node.value.trim());
        if (m) {
          if (!qualificationIds.has(m[1])) {
            throw new Error(
              `[docs-source] unknown qualification id "${m[1]}" at ${where(file, node)}; add it to apps/docs/docs-data/qualification.ts`
            );
          }
          parent.children[index] = {
            type: "mdxJsxFlowElement",
            name: "QualificationContext",
            attributes: [{ type: "mdxJsxAttribute", name: "capabilityId", value: m[1] }],
            children: [],
            position: node.position
          };
          return "skip";
        }
      }

      if (node.type === "blockquote" && node.children?.[0]?.type === "paragraph") {
        const para = node.children[0];
        const first = para.children?.[0];
        const m = first?.type === "text" ? /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(\r?\n)?/.exec(first.value) : null;
        if (m) {
          first.value = first.value.slice(m[0].length);
          if (first.value === "") para.children.shift();
          if (para.children[0]?.type === "break") para.children.shift();
          const children = para.children.length > 0 ? node.children : node.children.slice(1);
          node.type = "containerDirective";
          node.name = ALERTS[m[1]];
          node.attributes = {};
          node.children = children;
        }
      }
      return undefined;
    });
  };
}

/** @param {{ staticDirs: string[], baseUrl: string }} options */
export function rehypeStaticImages(options) {
  const staticDirs = options.staticDirs.map((d) => path.resolve(d));
  const baseUrl = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`;
  return (tree, vfile) => {
    const file = vfile.path;
    if (!file) return;
    walk(tree, (node) => {
      if (node.type !== "element" || node.tagName !== "img") return undefined;
      const src = node.properties?.src;
      if (typeof src !== "string" || src.startsWith("/") || src.startsWith("#") || hasProtocol(src)) return undefined;
      const abs = path.resolve(path.dirname(file), decodeURIComponent(src));
      const dir = staticDirs.find((d) => abs.startsWith(d + path.sep));
      if (!dir || !fs.existsSync(abs)) {
        throw new Error(`[docs-source] <img src="${src}"> at ${where(file, node)} is not a file in a static directory`);
      }
      node.properties.src = `${baseUrl}${toPosix(path.relative(dir, abs))}`;
      return undefined;
    });
  };
}
