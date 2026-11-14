import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveTortureCliEntry } from "../src/torture/local-buckets.js";

// rc2 audit E-10: the local torture bucket found the CLI at `../../cli/dist/index.js` next to @hardkas/testing's
// bundle. Under pnpm's isolated layout (node_modules/.pnpm/@hardkas+testing@<v>/node_modules/@hardkas/) no cli sits
// there (@hardkas/testing does not depend on @hardkas/cli), so `hardkas torture` failed its first case with
// INIT_FAILED. `hardkas torture` now passes its own entry (`cliEntry`); without it the bucket resolves
// `@hardkas/cli/bin`, then the sibling path, and otherwise fails typed (CLI_ENTRY_NOT_FOUND).

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

function layout(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-torture-cli-"));
  roots.push(root);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  const abs = (rel: string) => fs.realpathSync(path.join(root, rel));
  return { abs, url: (rel: string) => pathToFileURL(abs(rel)).href };
}

const CLI_MANIFEST = JSON.stringify({ name: "@hardkas/cli", type: "module", exports: { "./bin": "./dist/index.js" } });
const TESTING_MANIFEST = JSON.stringify({ name: "@hardkas/testing", type: "module", main: "./dist/index.js" });

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

describe("rc2 audit E-10 · the torture bucket's CLI entry", () => {
  it("under pnpm's isolated layout, without the CLI's entry: a typed CLI_ENTRY_NOT_FOUND, not a failed `node <missing>`", () => {
    const pnpm = "node_modules/.pnpm";
    const w = layout({
      [`${pnpm}/@hardkas+testing@9.9.9/node_modules/@hardkas/testing/package.json`]: TESTING_MANIFEST,
      [`${pnpm}/@hardkas+testing@9.9.9/node_modules/@hardkas/testing/dist/index.js`]: "export {};\n",
      [`${pnpm}/@hardkas+cli@9.9.9/node_modules/@hardkas/cli/package.json`]: CLI_MANIFEST,
      [`${pnpm}/@hardkas+cli@9.9.9/node_modules/@hardkas/cli/dist/index.js`]: "export {};\n"
    });
    const from = w.url(`${pnpm}/@hardkas+testing@9.9.9/node_modules/@hardkas/testing/dist/index.js`);
    expect(codeOf(() => resolveTortureCliEntry(undefined, from))).toBe("CLI_ENTRY_NOT_FOUND");
    expect(() => resolveTortureCliEntry(undefined, from)).toThrow(/run this bucket through `hardkas torture`, which passes its own entry/);
    // ...and with the entry `hardkas torture` passes (the CLI resolves itself), the same layout works
    const cli = w.abs(`${pnpm}/@hardkas+cli@9.9.9/node_modules/@hardkas/cli/dist/index.js`);
    expect(resolveTortureCliEntry(cli, from)).toBe(cli);
  });

  it("under a flat node_modules (npm), without the CLI's entry, resolves @hardkas/cli/bin", () => {
    const w = layout({
      "node_modules/@hardkas/testing/package.json": TESTING_MANIFEST,
      "node_modules/@hardkas/testing/dist/index.js": "export {};\n",
      "node_modules/@hardkas/cli/package.json": CLI_MANIFEST,
      "node_modules/@hardkas/cli/dist/index.js": "export {};\n"
    });
    expect(resolveTortureCliEntry(undefined, w.url("node_modules/@hardkas/testing/dist/index.js"))).toBe(w.abs("node_modules/@hardkas/cli/dist/index.js"));
  });

  it("refuses an entry it was given that does not exist", () => {
    const missing = path.join(os.tmpdir(), "hk-no-such-cli", "dist", "index.js");
    expect(codeOf(() => resolveTortureCliEntry(missing))).toBe("CLI_ENTRY_NOT_FOUND");
  });
});
