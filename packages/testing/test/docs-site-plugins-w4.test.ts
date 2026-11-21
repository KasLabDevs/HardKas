import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// BETA-FIX W4 · the docs site renders the repository's docs/ through apps/docs/plugins/markdown.mjs. Its contracts:
// a qualification id with no data fails the build (it used to render a red "Unknown capability" box on 13 live pages),
// GitHub alerts become admonitions, links that leave docs/ become GitHub URLs, links to the one-page CLI reference go to
// the generated per-group page, a broken relative link fails, and a raw <img> into the static folder gets the site path.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const plugins = await import(pathToFileURL(path.join(ROOT, "apps", "docs", "plugins", "markdown.mjs")).href);

const DOCS = path.join(ROOT, "docs");
const options = {
  docsRoot: DOCS,
  repoRoot: ROOT,
  repoUrl: "https://github.com/KasLabDevs/HardKas",
  unpublished: ["internal", "community", "proposals", "examples"],
  cliPagesDir: path.join(ROOT, "apps", "docs", "reference", "cli"),
  qualificationIds: ["artifacts", "replay"]
};
const page = path.join(DOCS, "concepts", "page.md");
const at = (line: number) => ({ start: { line, column: 1 }, end: { line, column: 1 } });
const run = (tree: any, file = page) => plugins.remarkDocsSource(options)(tree, { path: file });
const text = (value: string) => ({ type: "text", value });

describe("BETA-FIX W4 · docs site plugins", () => {
  it("an unknown qualification id fails with file:line; a known one becomes the component", () => {
    const bad = { type: "root", children: [{ type: "html", value: "<!-- qualification: workspaceLock -->", position: at(7) }] };
    expect(() => run(bad)).toThrow(/unknown qualification id "workspaceLock" at .*page\.md:7/);

    const good: any = { type: "root", children: [{ type: "html", value: "<!-- qualification: artifacts -->", position: at(3) }] };
    run(good);
    expect(good.children[0]).toMatchObject({
      type: "mdxJsxFlowElement",
      name: "QualificationContext",
      attributes: [{ name: "capabilityId", value: "artifacts" }]
    });
  });

  it("a GitHub alert becomes an admonition of the same kind", () => {
    const tree: any = {
      type: "root",
      children: [{ type: "blockquote", children: [{ type: "paragraph", children: [text("[!WARNING]\nMainnet is locked down.")] }] }]
    };
    run(tree);
    expect(tree.children[0].type).toBe("containerDirective");
    expect(tree.children[0].name).toBe("warning");
    expect(tree.children[0].children[0].children[0].value).toBe("Mainnet is locked down.");
  });

  it("links: outside docs/ or unpublished → GitHub; the one-page CLI reference → its group page; broken → error", () => {
    const link = (url: string) => ({ type: "link", url, children: [text("x")], position: at(2) });
    const tree: any = {
      type: "root",
      children: [
        link("../../packages/sdk/README.md#install"),
        link("../reference/cli.md#hardkas-tx-plan"),
        link("../reference/cli.md#hardkas-silver"),
        link("../start/quickstart.md"),
        link("https://example.org/a.md")
      ]
    };
    run(tree);
    expect(tree.children.map((l: any) => l.url)).toEqual([
      "https://github.com/KasLabDevs/HardKas/blob/develop/packages/sdk/README.md#install",
      "/reference/cli/tx#hardkas-tx-plan",
      "/reference/cli/silver",
      "../start/quickstart.md",
      "https://example.org/a.md"
    ]);
    expect(() => run({ type: "root", children: [link("./does-not-exist.md")] })).toThrow(/broken relative link "\.\/does-not-exist\.md" at .*page\.md:2/);
  });

  it("a raw <img> with a relative src into apps/docs/static is served from the site's static path", () => {
    const img: any = { type: "element", tagName: "img", properties: { src: "../../apps/docs/static/img/ide/icons/history.png", width: 24 }, children: [] };
    plugins.rehypeStaticImages({ staticDirs: [path.join(ROOT, "apps", "docs", "static")], baseUrl: "/docs/" })(
      { type: "root", children: [img] },
      { path: path.join(DOCS, "ide", "page.md") }
    );
    expect(img.properties.src).toBe("/docs/img/ide/icons/history.png");
  });
});
