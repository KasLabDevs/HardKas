import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Surface Cut 3c-1. `ResilientSubscriptionClient` was published as
 * `@hardkas/kaspa-rpc/internal/resilient-subscriber`. After a reconnect it re-attached `on()`
 * handlers but recovered nothing that changed while the socket was down, and no code in the
 * workspace used it. Watching addresses across reconnects is kaspa-wasm's UtxoContext, which
 * backs `WalletToolkit.watch()` since 3b. This keeps the subpath unpublished and the class deleted.
 */

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(PKG, "../..");
const ROOTS = ["packages", "examples", "labs", "apps", "scripts"];
const SKIP = new Set(["node_modules", "dist", "out", "build", "coverage", ".turbo", ".hardkas", ".docusaurus", "target"]);
const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const SURFACE = /\bResilientSubscriptionClient\b|resilient-subscriber/;
const SELF = "packages/kaspa-rpc/test/surface-cut-resilient-subscriber.test.ts";

// The class, its own tests, and the gate resolver's test that used the subpath as a sample.
const OWN = [
  "packages/kaspa-rpc/src/internal/resilient-subscriber.ts",
  "packages/kaspa-rpc/test/resilient-subscriber.test.ts",
  "packages/testing/test/gate-subpath-exports.test.ts",
  SELF
];

function codeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) codeFiles(full, out);
    else if (CODE.test(entry.name)) out.push(full);
  }
  return out;
}

describe("Surface Cut 3c-1: no internal/resilient-subscriber", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PKG, "package.json"), "utf8"));
  const mentions = ROOTS.flatMap((root) => {
    const dir = path.join(REPO, root);
    return fs.existsSync(dir) ? codeFiles(dir) : [];
  })
    .filter((file) => SURFACE.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(REPO, file).split(path.sep).join("/"));

  it("@hardkas/kaspa-rpc publishes no internal/* subpath", () => {
    expect(Object.keys(manifest.exports).filter((key) => key.startsWith("./internal"))).toEqual([]);
  });

  it("the build emits no internal entry point", () => {
    expect(manifest.scripts.build).not.toContain("src/internal/");
  });

  it("no code outside its own files uses it", () => {
    expect(mentions.filter((rel) => !OWN.includes(rel))).toEqual([]);
  });

  it("stays deleted", () => {
    expect(mentions.filter((rel) => rel !== SELF)).toEqual([]);
  });
});
